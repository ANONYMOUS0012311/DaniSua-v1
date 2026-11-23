const {
  runAwinPreflight,
} = require("../integrations/awinPreflight");


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
  const missing =
    await runAwinPreflight({
      env: {},
      fetchImpl:
        async () => {
          throw new Error(
            "Network must not run without credentials"
          );
        },
    });

  assert(
    missing.ready ===
      false &&
    missing.reason ===
      "missing_credentials" &&
    missing.dryRun
      .attempted ===
      false,
    "Preflight deve fermarsi prima della rete senza credenziali"
  );


  const env = {
    AWIN_PUBLISHER_ID:
      "12345",
    AWIN_DATAFEED_KEY:
      "super-secret-key",
    AWIN_ADVERTISER_IDS:
      "1001,1002",
    AWIN_PRIMARY_REGION:
      "IT",
    AWIN_SYNC_ENABLED:
      "false",
  };

  const feedListCsv = [
    "Advertiser ID,Advertiser Name,Primary Region,Membership Status,Datafeed Format,Feed ID,Feed Name,Language,Vertical,Last Imported,Last Checked,No of products,URL",
    "1001,Store One,IT,active,Awin,5001,Default,Italian,Retail,2026-11-23 20:00:00,2026-11-23 20:05:00,10,https://productdata.awin.com/datafeed/download/apikey/feed-secret/id/5001",
    "1002,Store Two,IT,active,Awin,5002,Default,Italian,Retail,2026-11-23 20:00:00,2026-11-23 20:05:00,20,https://productdata.awin.com/datafeed/download/apikey/feed-secret-2/id/5002",
  ].join(
    "\n"
  );

  let feedListCalls =
    0;

  let productCalls =
    0;

  const result =
    await runAwinPreflight({
      env,

      fetchImpl:
        async url => {
          const text =
            String(url);

          if (
            text.includes(
              "/feedList"
            )
          ) {
            feedListCalls +=
              1;

            return response({
              body:
                feedListCsv,
              url:
                text,
            });
          }

          productCalls +=
            1;

          throw new Error(
            "Preflight must not download product feeds"
          );
        },
    });

  assert(
    result.ok ===
      true &&
    result.ready ===
      true &&
    result
      .configuration
      .advertiserCount ===
      2 &&
    result
      .configuration
      .region ===
      "IT" &&
    result
      .dryRun
      .attempted ===
      true &&
    result
      .dryRun
      .selectedFeeds ===
      2,
    "Preflight configurato deve validare feed list e allowlist"
  );

  assert(
    feedListCalls === 1 &&
    productCalls === 0,
    "Preflight deve scaricare solo la feed list"
  );

  const publicText =
    JSON.stringify(
      result
    );

  assert(
    !publicText.includes(
      "super-secret-key"
    ) &&
    !publicText.includes(
      "feed-secret"
    ),
    "Preflight non deve esporre segreti o download URL"
  );


  const missingAllowlist =
    await runAwinPreflight({
      env: {
        AWIN_PUBLISHER_ID:
          "12345",
        AWIN_DATAFEED_KEY:
          "secret",
      },
      fetchImpl:
        async () => {
          throw new Error(
            "Network must not run without allowlist"
          );
        },
    });

  assert(
    missingAllowlist
      .reason ===
      "missing_advertiser_allowlist" &&
    missingAllowlist
      .dryRun
      .attempted ===
      false,
    "Preflight deve richiedere una advertiser allowlist esplicita"
  );


  console.log(
    "✅ AWIN PREFLIGHT — config, feed list e no secrets"
  );
}


main()
  .catch(
    error => {
      console.error(
        "❌ AWIN PREFLIGHT",
        error.message
      );

      process.exitCode = 1;
    }
  );
