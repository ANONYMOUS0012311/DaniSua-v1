const fs = require("fs");
const path = require("path");
const {
  spawn,
} = require("child_process");


const PROJECT_ROOT =
  path.join(
    __dirname,
    "..",
    ".."
  );

const DATA_DIR =
  path.join(
    PROJECT_ROOT,
    "data"
  );

const SERVER_PATH =
  path.join(
    __dirname,
    "..",
    "index.js"
  );

const PORT = 3201;

const BASE_URL =
  `http://127.0.0.1:${PORT}`;

const FIXTURE_NAME =
  `.offers.closed-beta-journey-${process.pid}.json`;

const FIXTURE_PATH =
  path.join(
    DATA_DIR,
    FIXTURE_NAME
  );

const EMPTY_DB_PATH =
  path.join(
    DATA_DIR,
    `.closed-beta-journey-${process.pid}.sqlite`
  );


function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(
      message
    );
  }
}


function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


async function waitUntilReady(
  child
) {
  for (
    let attempt = 0;
    attempt < 60;
    attempt += 1
  ) {
    if (
      child.exitCode !== null
    ) {
      throw new Error(
        `Closed beta server exited early with code ${child.exitCode}`
      );
    }

    try {
      const response =
        await fetch(
          `${BASE_URL}/health`
        );

      if (response.ok) {
        return;
      }
    } catch {
      // Server still starting.
    }

    await sleep(100);
  }

  throw new Error(
    "Closed beta server did not become ready"
  );
}


async function search(query) {
  const response =
    await fetch(
      `${BASE_URL}/search?q=${encodeURIComponent(query)}`
    );

  assert(
    response.ok,
    `/search failed with ${response.status} for "${query}"`
  );

  return response.json();
}


function buildOffer({
  id,
  store,
  price,
  shipping,
  verifiedAt,
}) {
  return {
    id,
    productId:
      "apple-iphone-17-256-black",
    store,
    seller:
      store,
    old_price:
      null,
    offer_price:
      price,
    currency:
      "EUR",
    shipping_price:
      shipping,
    stock:
      true,
    url:
      `https://example.com/${id}`,
    updatedAt:
      verifiedAt,
    verifiedAt,
    pricing: {
      type:
        "standard",
      conditional:
        false,
      conditions: [],
      paymentOptions: [
        {
          type:
            "one_time",
          total_price:
            price,
        },
      ],
    },
  };
}


async function main() {
  const verifiedAt =
    new Date(
      Date.now() -
      15 * 60 * 1000
    )
      .toISOString();

  const offers = [
    buildOffer({
      id:
        "closed-apple-iphone17",
      store:
        "Apple",
      price:
        979,
      shipping:
        0,
      verifiedAt,
    }),
    buildOffer({
      id:
        "closed-mediaworld-iphone17",
      store:
        "MediaWorld",
      price:
        949.49,
      shipping:
        0,
      verifiedAt,
    }),
    buildOffer({
      id:
        "closed-unieuro-iphone17",
      store:
        "Unieuro",
      price:
        969,
      shipping:
        0,
      verifiedAt,
    }),
    buildOffer({
      id:
        "closed-euronics-iphone17",
      store:
        "Euronics",
      price:
        999,
      shipping:
        7.9,
      verifiedAt,
    }),
  ];

  fs.writeFileSync(
    FIXTURE_PATH,
    JSON.stringify(
      offers,
      null,
      2
    )
  );

  let stderr = "";

  const child =
    spawn(
      process.execPath,
      [
        SERVER_PATH,
      ],
      {
        cwd:
          PROJECT_ROOT,
        env: {
          ...process.env,
          NODE_ENV:
            "production",
          PORT:
            String(PORT),
          HOST:
            "127.0.0.1",
          DANISUA_OFFERS_FILE:
            FIXTURE_NAME,
          DANISUA_DB_PATH:
            EMPTY_DB_PATH,
          CORS_ORIGINS:
            "https://danisua.netlify.app",
          AWIN_SYNC_ENABLED:
            "false",
        },
        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );

  child.stderr.on(
    "data",
    chunk => {
      stderr +=
        chunk.toString();
    }
  );

  try {
    await waitUntilReady(
      child
    );

    const cheapest =
      await search(
        "iPhone 17 più economico"
      );

    assert(
      cheapest.canRecommend ===
        true,
      "Ricerca price-first deve essere raccomandabile"
    );

    assert(
      cheapest
        .clarification
        ?.needed !==
        true,
      "iPhone 17 più economico non deve chiedere la capacità"
    );

    assert(
      cheapest.bestOffer
        ?.id ===
        "closed-mediaworld-iphone17",
      `Price-first deve scegliere il costo finale più basso: ${cheapest.bestOffer?.id}`
    );

    const generic =
      await search(
        "iPhone 17"
      );

    assert(
      generic.canRecommend ===
        true &&
      generic
        .clarification
        ?.needed !==
        true,
      "Ricerca modello generica non deve interrompersi con una domanda inutile"
    );

    assert(
      generic
        .recommendation
        ?.selectedVariant
        ?.storage ===
        "256 GB",
      `La variante disponibile deve essere selezionata automaticamente: ${generic.recommendation?.selectedVariant?.storage}`
    );

    const exact =
      await search(
        "iPhone 17 256 GB"
      );

    assert(
      exact.canRecommend ===
        true &&
      exact
        .recommendation
        ?.selectedVariant
        ?.storage ===
        "256 GB",
      "La capacità esplicita deve essere rispettata"
    );

    assert(
      exact.bestOffer
        ?.id ===
        "closed-mediaworld-iphone17",
      "La ricerca esatta deve mantenere la migliore offerta valida"
    );

    console.log(
      "✅ CLOSED BETA JOURNEY — no unnecessary clarification, exact constraints, final-cost winner"
    );
  } finally {
    child.kill(
      "SIGTERM"
    );

    for (
      let attempt = 0;
      attempt < 20;
      attempt += 1
    ) {
      if (
        child.exitCode !==
        null
      ) {
        break;
      }

      await sleep(50);
    }

    if (
      child.exitCode ===
        null
    ) {
      child.kill(
        "SIGKILL"
      );
    }

    for (
      const file of [
        FIXTURE_PATH,
        EMPTY_DB_PATH,
      ]
    ) {
      if (
        fs.existsSync(
          file
        )
      ) {
        fs.unlinkSync(
          file
        );
      }
    }
  }

  if (
    stderr.trim()
  ) {
    console.log(
      "ℹ️ Closed beta server stderr:",
      stderr.trim()
    );
  }
}


main()
  .catch(
    error => {
      console.error(
        "❌ CLOSED BETA JOURNEY",
        error.message
      );

      for (
        const file of [
          FIXTURE_PATH,
          EMPTY_DB_PATH,
        ]
      ) {
        if (
          fs.existsSync(
            file
          )
        ) {
          fs.unlinkSync(
            file
          );
        }
      }

      process.exitCode = 1;
    }
  );
