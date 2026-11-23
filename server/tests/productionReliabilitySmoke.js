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

const PORT =
  3199;

const BASE_URL =
  `http://127.0.0.1:${PORT}`;

const FIXTURE_NAME =
  `.offers.production-reliability-${process.pid}.json`;

const FIXTURE_PATH =
  path.join(
    DATA_DIR,
    FIXTURE_NAME
  );

const EMPTY_DB_PATH =
  path.join(
    DATA_DIR,
    `.production-reliability-${process.pid}.sqlite`
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


function sleep(
  ms
) {
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
      child.exitCode !==
      null
    ) {
      throw new Error(
        `Server production exited early with code ${child.exitCode}`
      );
    }

    try {
      const response =
        await fetch(
          `${BASE_URL}/health`
        );

      if (
        response.ok
      ) {
        return;
      }
    } catch {
      // Il server non è ancora pronto.
    }

    await sleep(
      100
    );
  }

  throw new Error(
    "Production reliability server did not become ready"
  );
}


async function search(
  query
) {
  const response =
    await fetch(
      `${BASE_URL}/search?q=${encodeURIComponent(query)}`
    );

  assert(
    response.ok,
    `/search failed with ${response.status}`
  );

  return response.json();
}


async function main() {
  const now =
    Date.now();

  const freshAt =
    new Date(
      now -
      30 * 60 * 1000
    )
      .toISOString();

  const staleAt =
    new Date(
      now -
      8 * 60 * 60 * 1000
    )
      .toISOString();

  const offers = [
    {
      id:
        "production-fresh-iphone17",
      productId:
        "apple-iphone-17-256-black",
      store:
        "Apple",
      seller:
        "Apple",
      old_price:
        null,
      offer_price:
        999,
      currency:
        "EUR",
      shipping_price:
        0,
      stock:
        true,
      url:
        "https://www.apple.com/it/shop/buy-iphone/iphone-17",
      updatedAt:
        freshAt,
      verifiedAt:
        freshAt,
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
              999,
          },
        ],
      },
    },
    {
      id:
        "production-stale-iphone16",
      productId:
        "apple-iphone-16-128-black",
      store:
        "Apple",
      seller:
        "Apple",
      old_price:
        null,
      offer_price:
        799,
      currency:
        "EUR",
      shipping_price:
        0,
      stock:
        true,
      url:
        "https://www.apple.com/it/shop/buy-iphone/iphone-16",
      updatedAt:
        staleAt,
      verifiedAt:
        staleAt,
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
              799,
          },
        ],
      },
    },
  ];

  fs.writeFileSync(
    FIXTURE_PATH,
    JSON.stringify(
      offers,
      null,
      2
    )
  );

  let stderr =
    "";

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
            String(
              PORT
            ),
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

    const fresh =
      await search(
        "iPhone 17 256 GB"
      );

    assert(
      fresh.canRecommend ===
        true &&
      fresh.bestOffer
        ?.id ===
        "production-fresh-iphone17",
      `Offerta fresh deve essere raccomandabile in produzione: ${JSON.stringify({
        status:
          fresh.status,
        canRecommend:
          fresh.canRecommend,
        bestOffer:
          fresh.bestOffer
            ?.id,
      })}`
    );

    const stale =
      await search(
        "iPhone 16 128 GB"
      );

    assert(
      stale.status ===
        "offers_need_refresh" &&
      stale.canRecommend ===
        false &&
      stale.bestOffer ===
        null,
      `Offerta di 8h deve essere bloccata in produzione: ${JSON.stringify({
        status:
          stale.status,
        canRecommend:
          stale.canRecommend,
        bestOffer:
          stale.bestOffer
            ?.id,
      })}`
    );

    assert(
      stale.clarification
        ?.needed ===
        false &&
      typeof stale
        .clarification
        ?.message ===
        "string" &&
      stale.clarification
        .message
        .length > 0,
      "Stale-only response deve spiegare il refresh senza chiedere chiarimenti"
    );

    console.log(
      "✅ PRODUCTION RELIABILITY — fresh wins, 8h stale blocked"
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

      await sleep(
        50
      );
    }

    if (
      child.exitCode ===
      null
    ) {
      child.kill(
        "SIGKILL"
      );
    }

    if (
      fs.existsSync(
        FIXTURE_PATH
      )
    ) {
      fs.unlinkSync(
        FIXTURE_PATH
      );
    }

    if (
      fs.existsSync(
        EMPTY_DB_PATH
      )
    ) {
      fs.unlinkSync(
        EMPTY_DB_PATH
      );
    }
  }

  if (
    stderr.trim()
  ) {
    console.log(
      "ℹ️ Production server stderr:",
      stderr.trim()
    );
  }
}


main()
  .catch(
    error => {
      console.error(
        "❌ PRODUCTION RELIABILITY",
        error.message
      );

      if (
        fs.existsSync(
          FIXTURE_PATH
        )
      ) {
        fs.unlinkSync(
          FIXTURE_PATH
        );
      }

      if (
        fs.existsSync(
          EMPTY_DB_PATH
        )
      ) {
        fs.unlinkSync(
          EMPTY_DB_PATH
        );
      }

      process.exitCode =
        1;
    }
  );
