const {
  readAwinConfig,
  buildAwinFeedListUrl,
  redactAwinUrl,
  parseAwinFeedList,
  selectChangedAwinFeeds,
  mapAwinProductRow,
  importAwinProductFeed,
  fetchAwinFeedList,
} = require("../integrations/awin");


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


async function main() {
  const missing =
    readAwinConfig(
      {}
    );

  assert(
    missing.configured ===
      false &&
    missing
      .allowlistConfigured ===
      false,
    "Awin non deve risultare configurato senza credenziali"
  );


  let fetchCalls = 0;

  const noCredentials =
    await fetchAwinFeedList({
      env: {},
      fetchImpl:
        async () => {
          fetchCalls += 1;
          throw new Error(
            "network should not be called"
          );
        },
    });

  assert(
    noCredentials.ok ===
      false &&
    noCredentials.reason ===
      "missing_credentials" &&
    fetchCalls === 0,
    "Senza credenziali non deve partire nessuna chiamata"
  );


  const noAllowlist =
    await fetchAwinFeedList({
      env: {
        AWIN_PUBLISHER_ID:
          "12345",
        AWIN_DATAFEED_KEY:
          "super-secret",
      },
      fetchImpl:
        async () => {
          fetchCalls += 1;
          throw new Error(
            "network should not be called"
          );
        },
    });

  assert(
    noAllowlist.ok ===
      false &&
    noAllowlist.reason ===
      "missing_advertiser_allowlist" &&
    fetchCalls === 0,
    "Senza allowlist advertiser Awin deve fermarsi prima della rete"
  );


  const config =
    readAwinConfig({
      AWIN_PUBLISHER_ID:
        "12345",
      AWIN_DATAFEED_KEY:
        "super-secret",
      AWIN_ADVERTISER_IDS:
        "1001, 1002",
      AWIN_PRIMARY_REGION:
        "it",
    });

  const url =
    buildAwinFeedListUrl(
      config
    );

  assert(
    url.includes(
      "/12345/super-secret/1/feedList"
    ),
    "URL feed list Awin inatteso"
  );

  const redacted =
    redactAwinUrl(
      url
    );

  assert(
    !redacted.includes(
      "super-secret"
    ) &&
    redacted.includes(
      "[REDACTED]"
    ),
    "La data feed key non deve comparire nei log"
  );


  const feedListCsv = [
    "Advertiser ID,Advertiser Name,Primary Region,Membership Status,Datafeed Format,Feed ID,Feed Name,Language,Vertical,Last Imported,Last Checked,No of products,URL",
    "1001,Unieuro,IT,active,Awin,5001,Default,Italian,Retail,2026-11-23 18:00:00,2026-11-23 18:05:00,1000,https://productdata.awin.com/datafeed/download/apikey/feed-secret/id/5001",
    "1002,MediaWorld,IT,active,Awin,5002,Default,Italian,Retail,2026-11-22 18:00:00,2026-11-23 18:05:00,2000,https://productdata.awin.com/datafeed/download/apikey/feed-secret/id/5002",
    "1003,Unknown Shop,IT,active,Awin,5003,Default,Italian,Retail,2026-11-23 19:00:00,2026-11-23 19:05:00,3000,https://productdata.awin.com/datafeed/download/apikey/feed-secret/id/5003",
    "1001,Unieuro,DE,active,Awin,5004,DE Feed,German,Retail,2026-11-23 19:00:00,2026-11-23 19:05:00,4000,https://productdata.awin.com/datafeed/download/apikey/feed-secret/id/5004",
    "1001,Unieuro,IT,pending,Awin,5005,Pending,Italian,Retail,2026-11-23 19:00:00,2026-11-23 19:05:00,5000,https://productdata.awin.com/datafeed/download/apikey/feed-secret/id/5005",
    "1001,Unieuro,IT,active,Google,5006,Enhanced,Italian,Retail,2026-11-23 19:00:00,2026-11-23 19:05:00,6000,https://api.awin.com/publishers/12345/awinfeeds/download/1001-retail-it_IT.jsonl",
  ].join("\n");

  const feeds =
    parseAwinFeedList(
      feedListCsv
    );

  assert(
    feeds.length === 6 &&
    feeds[0]
      .advertiserName ===
      "Unieuro" &&
    feeds[0]
      .productCount ===
      1000,
    "Parsing feed list Awin inatteso"
  );


  const plan =
    selectChangedAwinFeeds(
      feeds,
      {
        advertiserIds:
          config
            .advertiserIds,
        region:
          config.region,
        lastImportedByFeedId: {
          "5001":
            "2026-11-22 18:00:00",
          "5002":
            "2026-11-22 18:00:00",
        },
      }
    );

  assert(
    plan.selected.length ===
      1 &&
    plan.selected[0]
      .feedId ===
      "5001",
    "Deve selezionare solo il feed IT active Awin allowlisted e cambiato"
  );

  assert(
    plan.skipped.some(
      item =>
        item.feedId ===
          "5002" &&
        item.reasons.includes(
          "feed_not_changed"
        )
    ),
    "Feed non cambiato deve essere saltato"
  );

  assert(
    plan.skipped.some(
      item =>
        item.feedId ===
          "5003" &&
        item.reasons.includes(
          "advertiser_not_allowlisted"
        )
    ),
    "Advertiser fuori allowlist deve essere saltato"
  );

  assert(
    plan.skipped.some(
      item =>
        item.feedId ===
          "5006" &&
        item.reasons.includes(
          "unsupported_feed_format"
        )
    ),
    "Enhanced/Google non deve entrare nel parser legacy"
  );


  const noListPlan =
    selectChangedAwinFeeds(
      feeds,
      {
        advertiserIds: [],
      }
    );

  assert(
    noListPlan
      .selected
      .length === 0,
    "Allowlist vuota deve selezionare zero feed"
  );


  const mapped =
    mapAwinProductRow(
      {
        product_id:
          "SKU-17",
        product_name:
          "Apple iPhone 17 256 GB Nero",
        brand_name:
          "Apple",
        price:
          "999.00",
        currency:
          "EUR",
        delivery_cost:
          "",
        in_stock:
          "",
        deep_link:
          "https://www.unieuro.it/online/test",
        product_price_old:
          "1129.00",
        rrp_price:
          "1199.00",
        last_updated:
          "2026-11-23T18:30:00Z",
      },
      {
        advertiserId:
          "1001",
        advertiserName:
          "Unieuro",
        observedAt:
          "2026-11-23T20:00:00Z",
      }
    );

  assert(
    mapped
      .shipping_price ===
      null,
    "Delivery cost vuoto deve restare null"
  );

  assert(
    mapped.stock ===
      null,
    "in_stock vuoto deve restare null"
  );

  assert(
    mapped.old_price ===
      "1129.00",
    "product_price_old deve restare marketing old price"
  );

  assert(
    mapped.verified_at ===
      "2026-11-23T20:00:00Z" &&
    mapped.updated_at ===
      "2026-11-23T18:30:00Z",
    "Osservazione DaniSua e timestamp fonte devono restare distinti"
  );


  const free =
    mapAwinProductRow(
      {
        product_id:
          "SKU-FREE",
        product_name:
          "Apple iPhone 17 256 GB Bianco",
        price:
          "969",
        delivery_cost:
          "Free",
        in_stock:
          "1",
        deep_link:
          "https://www.unieuro.it/online/test-free",
      },
      {
        advertiserId:
          "1001",
        advertiserName:
          "Unieuro",
        observedAt:
          "2026-11-23T20:00:00Z",
      }
    );

  assert(
    free
      .shipping_price ===
      0 &&
    free.stock === "1",
    "Spedizione Free deve diventare 0 prima della normalizzazione"
  );


  const productFeedCsv = [
    "product_id,product_name,brand_name,price,currency,delivery_cost,in_stock,deep_link,product_price_old,last_updated",
    "SKU-17,Apple iPhone 17 256 GB Nero,Apple,999.00,EUR,,1,https://www.unieuro.it/online/test,1129.00,2026-11-23T18:30:00Z",
  ].join("\n");

  const imported =
    importAwinProductFeed({
      content:
        productFeedCsv,
      advertiserId:
        "1001",
      advertiserName:
        "Unieuro",
      observedAt:
        "2026-11-23T20:00:00Z",
      betaOnly: true,
    });

  assert(
    imported.ready.length ===
      1 &&
    imported.ready[0]
      .store ===
      "Unieuro" &&
    imported.ready[0]
      .shipping_price ===
      null &&
    imported.ready[0]
      .stock ===
      true &&
    imported.ready[0]
      .old_price ===
      1129 &&
    imported.ready[0]
      .verifiedAt ===
      "2026-11-23T20:00:00.000Z",
    "Feed Awin deve attraversare matching, trust e contract DaniSua"
  );


  const refurbishedCsv = [
    "product_id,product_name,brand_name,price,currency,delivery_cost,in_stock,deep_link,condition",
    "SKU-REFURB,Apple iPhone 17 256 GB Nero,Apple,699.00,EUR,0,1,https://www.unieuro.it/online/test-refurb,refurbished",
  ].join("\n");

  const refurbished =
    importAwinProductFeed({
      content:
        refurbishedCsv,
      advertiserId:
        "1001",
      advertiserName:
        "Unieuro",
      observedAt:
        "2026-11-23T20:00:00Z",
      betaOnly: true,
    });

  assert(
    refurbished.ready.length ===
      0 &&
    refurbished
      .needsReview
      .length === 1 &&
    refurbished
      .needsReview[0]
      ?.match
      ?.reason ===
      "condition_mismatch",
    "Una offerta refurbished non deve auto-matchare un prodotto new"
  );


  const accessoryCsv = [
    "product_id,product_name,brand_name,price,currency,delivery_cost,in_stock,deep_link,merchant_category",
    "SKU-CASE,Apple Custodia MagSafe per iPhone 17,Apple,59.00,EUR,0,1,https://www.unieuro.it/online/test-case,Accessori Smartphone",
  ].join("\n");

  const accessory =
    importAwinProductFeed({
      content:
        accessoryCsv,
      advertiserId:
        "1001",
      advertiserName:
        "Unieuro",
      observedAt:
        "2026-11-23T20:00:00Z",
      betaOnly: true,
    });

  assert(
    accessory.ready.length ===
      0 &&
    accessory
      .needsReview
      .length === 0 &&
    accessory
      .rejected
      ?.matching
      ?.length === 1 &&
    accessory
      .rejected
      .matching[0]
      ?.reason ===
      "accessory_not_catalog_product",
    "Un accessorio evidente non deve riempire la review queue del prodotto principale"
  );


  console.log(
    "✅ AWIN — config, allowlist, feed planning e mapping"
  );
}


main()
  .catch(
    error => {
      console.error(
        "❌ AWIN",
        error.message
      );

      process.exitCode = 1;
    }
  );
