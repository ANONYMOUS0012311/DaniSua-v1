const {
  buildBetaReadiness,
} = require("../utils/betaReadiness");


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


function main() {
  const now =
    Date.parse(
      "2026-11-23T20:00:00Z"
    );

  const products = [
    {
      id:
        "phone-256",
      familyId:
        "phone-family",
    },
  ];

  const targets = {
    families: [
      {
        familyId:
          "phone-family",
        familyName:
          "Phone Family",
        priority:
          "P0",
        minimumStores:
          2,
      },
    ],
  };

  const baseOffer = {
    productId:
      "phone-256",
    currency:
      "EUR",
    stock:
      true,
    pricing: {
      conditional:
        false,
    },
    verifiedAt:
      "2026-11-23T19:30:00Z",
  };

  const ready =
    buildBetaReadiness(
      {
        products,
        targets,
        offers: [
          {
            ...baseOffer,
            id:
              "store-a",
            store:
              "Store A",
            offer_price:
              900,
            shipping_price:
              0,
          },
          {
            ...baseOffer,
            id:
              "store-b",
            store:
              "Store B",
            offer_price:
              910,
            shipping_price:
              5,
          },
        ],
        env: {
          AWIN_SYNC_ENABLED:
            "true",
          AWIN_PUBLISHER_ID:
            "publisher",
          AWIN_DATAFEED_KEY:
            "secret",
          AWIN_ADVERTISER_IDS:
            "1,2",
        },
      },
      {
        now,
      }
    );

  assert(
    ready
      .readyForPublicBeta ===
      true,
    "Due store fresh con costo finale e automazione pronta devono risultare ready"
  );

  const missingShipping =
    buildBetaReadiness(
      {
        products,
        targets,
        offers: [
          {
            ...baseOffer,
            id:
              "store-a",
            store:
              "Store A",
            offer_price:
              900,
            shipping_price:
              0,
          },
          {
            ...baseOffer,
            id:
              "store-b",
            store:
              "Store B",
            offer_price:
              890,
            shipping_price:
              null,
          },
        ],
        env: {
          AWIN_SYNC_ENABLED:
            "true",
          AWIN_PUBLISHER_ID:
            "publisher",
          AWIN_DATAFEED_KEY:
            "secret",
          AWIN_ADVERTISER_IDS:
            "1,2",
        },
      },
      {
        now,
      }
    );

  assert(
    missingShipping
      .dataReady === false &&
    missingShipping
      .blockers[0]
      ?.missingFinalCostStores ===
      1,
    "Shipping sconosciuta non deve contare come copertura costo finale"
  );

  const stale =
    buildBetaReadiness(
      {
        products,
        targets,
        offers: [
          {
            ...baseOffer,
            id:
              "stale-a",
            store:
              "Store A",
            shipping_price:
              0,
            verifiedAt:
              "2026-11-23T10:00:00Z",
          },
          {
            ...baseOffer,
            id:
              "stale-b",
            store:
              "Store B",
            shipping_price:
              0,
            verifiedAt:
              "2026-11-23T10:00:00Z",
          },
        ],
        env: {},
      },
      {
        now,
      }
    );

  assert(
    stale
      .summary
      .p0Ready ===
      0 &&
    stale
      .automation
      .ready ===
      false,
    "Offerte stale e automazione spenta devono bloccare la beta"
  );

  console.log(
    "✅ BETA READINESS — data + automation gates"
  );
}


try {
  main();
} catch (error) {
  console.error(
    "❌ BETA READINESS",
    error.message
  );

  process.exitCode = 1;
}
