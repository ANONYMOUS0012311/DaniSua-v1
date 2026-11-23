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
  productId =
    "apple-iphone-17-256-black",
  store,
  price,
  shipping,
  verifiedAt,
}) {
  return {
    id,
    productId,
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
    buildOffer({
      id:
        "closed-apple-iphone17-512",
      productId:
        "apple-iphone-17-512-white",
      store:
        "Apple",
      price:
        899,
      shipping:
        0,
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
      typeof cheapest
        .requestId ===
        "string" &&
      cheapest
        .requestId
        .length > 0,
      "La risposta /search deve esporre requestId per correlare metriche senza salvare la query"
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
        "closed-apple-iphone17-512",
      `Price-first senza capacità deve poter scegliere la variante più economica: ${cheapest.bestOffer?.id}`
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
      generic.bestOffer
        ?.familyId ===
        "apple-iphone-17",
      `La ricerca generica deve restare nella famiglia iPhone 17: ${generic.bestOffer?.familyId}`
    );

    const exact =
      await search(
        "iPhone 17 256 GB"
      );

    assert(
      exact.canRecommend ===
        true &&
      exact.bestOffer
        ?.storage ===
        "256 GB",
      `La capacità esplicita deve essere rispettata: ${exact.bestOffer?.storage}`
    );

    assert(
      Array.isArray(
        exact.results
      ) &&
      exact.results
        .every(
          offer =>
            offer.storage ===
            "256 GB"
        ),
      "La ricerca 256 GB non deve includere offerte 512 GB"
    );

    assert(
      exact.bestOffer
        ?.id ===
        "closed-mediaworld-iphone17",
      "La ricerca esatta deve mantenere la migliore offerta valida tra le 256 GB"
    );

    const eventResponse =
      await fetch(
        `${BASE_URL}/events`,
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              type:
                "offer_click",
              offerId:
                exact.bestOffer
                  .id,
              familyId:
                exact.bestOffer
                  .familyId,
              store:
                exact.bestOffer
                  .store,
              position:
                0,
              searchRequestId:
                exact.requestId,
            }),
        }
      );

    assert(
      eventResponse.status ===
        202,
      `Evento click correlato deve essere accettato: ${eventResponse.status}`
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
