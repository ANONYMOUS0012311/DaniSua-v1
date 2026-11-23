const {
  buildBetaReadiness,
  buildBetaHealthSnapshot,
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
      true &&
    ready
      .readyForClosedBeta ===
      true,
    "Due store fresh con costo finale devono rendere ready il fixture minimo e, con automazione, anche la beta pubblica"
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

  const closedBetaTargets = {
    families: [
      {
        familyId:
          "family-a",
        priority:
          "P0",
        minimumStores:
          4,
      },
      {
        familyId:
          "family-b",
        priority:
          "P0",
        minimumStores:
          4,
      },
      {
        familyId:
          "family-c",
        priority:
          "P0",
        minimumStores:
          4,
      },
      {
        familyId:
          "family-d",
        priority:
          "P0",
        minimumStores:
          4,
      },
    ],
  };

  const closedBetaProducts =
    closedBetaTargets
      .families
      .map(
        family => ({
          id:
            family.familyId +
            "-256",
          familyId:
            family.familyId,
        })
      );

  const closedBetaOffers = [];

  for (
    const familyId of
    [
      "family-a",
      "family-b",
      "family-c",
    ]
  ) {
    for (
      const [
        index,
        store,
      ] of
      [
        "Store A",
        "Store B",
      ]
        .entries()
    ) {
      closedBetaOffers.push({
        ...baseOffer,
        id:
          familyId +
          "-" +
          index,
        productId:
          familyId +
          "-256",
        store,
        offer_price:
          900 +
          index,
        shipping_price:
          index,
      });
    }
  }

  const closedBeta =
    buildBetaReadiness(
      {
        products:
          closedBetaProducts,
        targets:
          closedBetaTargets,
        offers:
          closedBetaOffers,
        env: {},
      },
      {
        now,
      }
    );

  assert(
    closedBeta
      .readyForClosedBeta ===
      true &&
    closedBeta
      .readyForPublicBeta ===
      false &&
    closedBeta
      .summary
      .closedBetaFamiliesReady ===
      3 &&
    closedBeta
      .summary
      .closedBetaMinimumFamilies ===
      3,
    "Tre famiglie P0 con due store fresh e costo finale devono bastare per la beta chiusa, non per quella pubblica"
  );


  const health =
    buildBetaHealthSnapshot(
      missingShipping
    );

  assert(
    health
      .readyForPublicBeta ===
      false &&
    health
      .readyForClosedBeta ===
      false &&
    health
      .summary
      .p0Blocked ===
      1 &&
    health
      .blockers[0]
      ?.familyId ===
      "phone-family" &&
    health
      .blockers[0]
      ?.missingFinalCostStores ===
      1,
    "Snapshot health deve esporre blocker beta senza dati sensibili"
  );

  assert(
    !Object.prototype
      .hasOwnProperty
      .call(
        health,
        "families"
      ) &&
    !Object.prototype
      .hasOwnProperty
      .call(
        health,
        "automation"
      ),
    "Snapshot health deve restare compatto e non esporre configurazione completa"
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
