const fs = require("fs");
const path = require("path");

const {
  openDatabase,
  listOffers,
  listOfferPriceHistory,
  closeDatabase,
} = require("../db/database");

const {
  loadAwinFeedState,
} = require("../integrations/awinState");

const {
  syncAwinFeeds,
} = require("../integrations/awinSync");


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


function response({
  body,
  url,
  status = 200,
}) {
  return {
    ok:
      status >= 200 &&
      status < 300,

    status,

    url,

    async text() {
      return body;
    },
  };
}


async function main() {
  const testDir =
    path.join(
      __dirname,
      "awin-sync-smoke"
    );

  const databasePath =
    path.join(
      testDir,
      "danisua.sqlite"
    );

  const statePath =
    path.join(
      testDir,
      "awin-state.json"
    );

  fs.rmSync(
    testDir,
    {
      recursive: true,
      force: true,
    }
  );

  const env = {
    AWIN_PUBLISHER_ID:
      "12345",

    AWIN_DATAFEED_KEY:
      "publisher-secret",

    AWIN_ADVERTISER_IDS:
      "1001",

    AWIN_PRIMARY_REGION:
      "IT",

    AWIN_STORE_MAP_JSON:
      JSON.stringify({
        "1001":
          "Unieuro",
      }),
  };

  const feedUrl =
    "https://productdata.awin.com/datafeed/download/apikey/feed-secret/id/5001";

  const feedListCsv = [
    "Advertiser ID,Advertiser Name,Primary Region,Membership Status,Datafeed Format,Feed ID,Feed Name,Language,Vertical,Last Imported,Last Checked,No of products,URL",
    "1001,Unieuro Affiliate IT,IT,active,Awin,5001,Default,Italian,Retail,2026-11-23 18:00:00,2026-11-23 18:05:00,1," +
      feedUrl,
  ].join(
    "\n"
  );

  const productFeedCsv = [
    "product_id,product_name,brand_name,price,currency,delivery_cost,in_stock,deep_link,product_price_old,last_updated",
    "SKU-17,Apple iPhone 17 256 GB Nero,Apple,999.00,EUR,,1,https://www.unieuro.it/online/test-awin-sync,1129.00,2026-11-23T18:30:00Z",
  ].join(
    "\n"
  );

  let feedListCalls = 0;
  let productCalls = 0;

  const fetchImpl =
    async url => {
      if (
        String(
          url
        )
          .includes(
            "/feedList"
          )
      ) {
        feedListCalls += 1;

        return response({
          body:
            feedListCsv,
          url:
            String(
              url
            ),
        });
      }

      if (
        String(
          url
        ) ===
        feedUrl
      ) {
        productCalls += 1;

        return response({
          body:
            productFeedCsv,
          url:
            feedUrl,
        });
      }

      throw new Error(
        "Unexpected URL"
      );
    };


  const plan =
    await syncAwinFeeds({
      env,
      fetchImpl,
      apply: false,
      databasePath,
      statePath,
      observedAtFactory:
        () =>
          "2026-11-23T20:00:00Z",
    });

  assert(
    plan.ok === true &&
    plan.applied === false &&
    plan
      .diagnostics
      .selected === 1,
    "Dry-run deve pianificare il feed cambiato"
  );

  assert(
    feedListCalls === 1 &&
    productCalls === 0,
    "Dry-run deve scaricare solo la feed list"
  );

  assert(
    !fs.existsSync(
      databasePath
    ) &&
    !fs.existsSync(
      statePath
    ),
    "Dry-run non deve modificare DB o state"
  );

  const planText =
    JSON.stringify(
      plan
    );

  assert(
    !planText.includes(
      "publisher-secret"
    ) &&
    !planText.includes(
      "feed-secret"
    ),
    "Il risultato pubblico non deve esporre segreti Awin"
  );


  const applied =
    await syncAwinFeeds({
      env,
      fetchImpl,
      apply: true,
      databasePath,
      statePath,
      observedAtFactory:
        () =>
          "2026-11-23T20:00:00Z",
    });

  assert(
    applied.ok === true &&
    applied.applied === true &&
    applied
      .diagnostics
      .processed === 1 &&
    applied
      .diagnostics
      .failed === 0,
    "Apply deve processare il feed"
  );

  assert(
    productCalls === 1,
    "Apply deve scaricare il prodotto una volta"
  );

  let db = null;

  try {
    db =
      openDatabase(
        databasePath
      );

    const offers =
      listOffers(
        db
      );

    assert(
      offers.length === 1 &&
      offers[0]
        .store ===
        "Unieuro" &&
      offers[0]
        .offer_price ===
        999 &&
      offers[0]
        .shipping_price ===
        null &&
      offers[0]
        .stock ===
        true,
      "Feed Awin applicato non persistito correttamente"
    );

    const history =
      listOfferPriceHistory(
        db,
        offers[0].id
      );

    assert(
      history.length === 1 &&
      history[0]
        .verifiedAt ===
        "2026-11-23T20:00:00.000Z",
      "Sync Awin deve alimentare lo storico osservato"
    );
  } finally {
    if (db) {
      closeDatabase(
        db
      );
    }
  }


  const state =
    loadAwinFeedState(
      statePath
    );

  assert(
    state.feeds[
      "5001"
    ]
      .lastImported ===
      "2026-11-23 18:00:00",
    "Feed state deve aggiornarsi solo dopo apply riuscito"
  );


  const second =
    await syncAwinFeeds({
      env,
      fetchImpl,
      apply: true,
      databasePath,
      statePath,
      observedAtFactory:
        () =>
          "2026-11-23T21:00:00Z",
    });

  assert(
    second.ok === true &&
    second
      .diagnostics
      .selected === 0 &&
    productCalls === 1,
    "Feed invariato non deve essere riscaricato"
  );


  const failureStatePath =
    path.join(
      testDir,
      "failure-state.json"
    );

  const changedFeedListCsv =
    feedListCsv
      .replace(
        "2026-11-23 18:00:00",
        "2026-11-23 22:00:00"
      );

  const failingFetch =
    async url => {
      if (
        String(
          url
        )
          .includes(
            "/feedList"
          )
      ) {
        return response({
          body:
            changedFeedListCsv,
          url:
            String(
              url
            ),
        });
      }

      return response({
        body:
          "temporary failure",
        url:
          String(
            url
          ),
        status: 503,
      });
    };

  const failed =
    await syncAwinFeeds({
      env,
      fetchImpl:
        failingFetch,
      apply: true,
      databasePath:
        path.join(
          testDir,
          "failure.sqlite"
        ),
      statePath:
        failureStatePath,
      observedAtFactory:
        () =>
          "2026-11-23T22:05:00Z",
    });

  assert(
    failed.ok === false &&
    failed
      .diagnostics
      .failed === 1,
    "Errore download deve essere riportato"
  );

  assert(
    !fs.existsSync(
      failureStatePath
    ),
    "Feed fallito non deve essere marcato processato"
  );


  fs.rmSync(
    testDir,
    {
      recursive: true,
      force: true,
    }
  );

  console.log(
    "✅ AWIN SYNC — plan, apply, state e failure safety"
  );
}


main()
  .catch(
    error => {
      console.error(
        "❌ AWIN SYNC",
        error.message
      );

      process.exitCode = 1;
    }
  );
