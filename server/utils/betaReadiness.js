const {
  evaluateOfferReliability,
  DEFAULT_FRESH_HOURS,
  DEFAULT_REVIEW_HOURS,
} = require("./freshness");


const DEFAULT_CLOSED_BETA_MIN_READY_FAMILIES =
  3;

const DEFAULT_CLOSED_BETA_MIN_FINAL_COST_STORES =
  2;


function isKnownShipping(
  offer
) {
  return (
    typeof offer
      ?.shipping_price ===
      "number" &&
    Number.isFinite(
      offer.shipping_price
    ) &&
    offer.shipping_price >= 0
  );
}


function isStandardOffer(
  offer
) {
  return (
    offer &&
    offer.stock !== false &&
    offer.currency === "EUR" &&
    offer.pricing
      ?.conditional !== true
  );
}


function uniqueStores(
  offers
) {
  return [
    ...new Set(
      (
        Array.isArray(
          offers
        )
          ? offers
          : []
      )
        .map(
          offer =>
            offer?.store
        )
        .filter(Boolean)
    ),
  ].sort();
}


function readAutomationState(
  env = {}
) {
  const advertiserIds =
    String(
      env
        ?.AWIN_ADVERTISER_IDS ||
      ""
    )
      .split(",")
      .map(
        value =>
          value.trim()
      )
      .filter(Boolean);

  const enabled =
    String(
      env
        ?.AWIN_SYNC_ENABLED ||
      ""
    )
      .trim()
      .toLowerCase() ===
    "true";

  const credentialsConfigured =
    Boolean(
      String(
        env
          ?.AWIN_PUBLISHER_ID ||
        ""
      ).trim() &&
      String(
        env
          ?.AWIN_DATAFEED_KEY ||
        ""
      ).trim()
    );

  return {
    enabled,
    credentialsConfigured,
    advertiserCount:
      advertiserIds.length,
    allowlistConfigured:
      advertiserIds.length > 0,
    ready:
      enabled &&
      credentialsConfigured &&
      advertiserIds.length > 0,
  };
}


function buildBetaReadiness(
  {
    offers = [],
    products = [],
    targets = {},
    env = {},
  } = {},
  {
    now = Date.now(),
    freshHours =
      DEFAULT_FRESH_HOURS,
    reviewHours =
      DEFAULT_REVIEW_HOURS,
  } = {}
) {
  const productById =
    new Map(
      (
        Array.isArray(
          products
        )
          ? products
          : []
      )
        .map(
          product => [
            product.id,
            product,
          ]
        )
    );

  const targetFamilies =
    Array.isArray(
      targets?.families
    )
      ? targets.families
      : [];

  const familyRows =
    targetFamilies
      .map(
        target => {
          const familyOffers =
            (
              Array.isArray(
                offers
              )
                ? offers
                : []
            )
              .filter(
                offer =>
                  productById
                    .get(
                      offer
                        ?.productId
                    )
                    ?.familyId ===
                  target.familyId
              );

          const evaluated =
            familyOffers
              .map(
                offer => ({
                  offer,
                  reliability:
                    evaluateOfferReliability(
                      offer,
                      {
                        now,
                        freshHours,
                        reviewHours,
                      }
                    ),
                })
              );

          const freshStandard =
            evaluated
              .filter(
                row =>
                  row
                    .reliability
                    .status ===
                    "fresh" &&
                  row
                    .reliability
                    .eligibleForHourlyPolicy ===
                    true &&
                  isStandardOffer(
                    row.offer
                  )
              )
              .map(
                row =>
                  row.offer
              );

          const finalCostReady =
            freshStandard
              .filter(
                isKnownShipping
              );

          const freshStores =
            uniqueStores(
              freshStandard
            );

          const finalCostStores =
            uniqueStores(
              finalCostReady
            );

          const minimumStores =
            Number.isInteger(
              target.minimumStores
            ) &&
            target.minimumStores > 0
              ? target.minimumStores
              : 1;

          const missingFreshStores =
            Math.max(
              0,
              minimumStores -
              freshStores.length
            );

          const missingFinalCostStores =
            Math.max(
              0,
              minimumStores -
              finalCostStores.length
            );

          const ready =
            missingFreshStores === 0 &&
            missingFinalCostStores ===
              0;

          const closedBetaReady =
            finalCostStores.length >=
            DEFAULT_CLOSED_BETA_MIN_FINAL_COST_STORES;

          return {
            familyId:
              target.familyId,
            familyName:
              target.familyName ||
              target.familyId,
            priority:
              target.priority ||
              null,
            betaTier:
              target.betaTier ||
              null,
            minimumStores,
            offers:
              familyOffers.length,
            freshOffers:
              freshStandard.length,
            freshStores,
            freshStoreCount:
              freshStores.length,
            finalCostReadyOffers:
              finalCostReady.length,
            finalCostStores,
            finalCostStoreCount:
              finalCostStores.length,
            missingFreshStores,
            missingFinalCostStores,
            ready,
            closedBetaReady,
          };
        }
      );

  const p0 =
    familyRows
      .filter(
        row =>
          row.priority ===
          "P0"
      );

  const p0Ready =
    p0
      .filter(
        row =>
          row.ready
      );

  const closedBetaReadyFamilies =
    p0
      .filter(
        row =>
          row.closedBetaReady
      );

  const closedBetaMinimumFamilies =
    Math.min(
      DEFAULT_CLOSED_BETA_MIN_READY_FAMILIES,
      p0.length
    );

  const closedBetaDataReady =
    closedBetaMinimumFamilies > 0 &&
    closedBetaReadyFamilies.length >=
      closedBetaMinimumFamilies;

  const blockers =
    p0
      .filter(
        row =>
          !row.ready
      )
      .map(
        row => ({
          familyId:
            row.familyId,
          familyName:
            row.familyName,
          missingFreshStores:
            row
              .missingFreshStores,
          missingFinalCostStores:
            row
              .missingFinalCostStores,
          freshStores:
            row.freshStores,
          finalCostStores:
            row.finalCostStores,
        })
      );

  const automation =
    readAutomationState(
      env
    );

  return {
    readyForClosedBeta:
      closedBetaDataReady,

    closedBetaDataReady,

    readyForPublicBeta:
      p0.length > 0 &&
      p0Ready.length ===
        p0.length &&
      automation.ready,

    dataReady:
      p0.length > 0 &&
      p0Ready.length ===
        p0.length,

    automation,

    policy: {
      freshHours,
      reviewHours,
      marketCurrency:
        "EUR",
      finalCostRequiresKnownShipping:
        true,
      closedBeta: {
        minimumReadyFamilies:
          DEFAULT_CLOSED_BETA_MIN_READY_FAMILIES,
        minimumFinalCostStoresPerFamily:
          DEFAULT_CLOSED_BETA_MIN_FINAL_COST_STORES,
        automationRequired:
          false,
      },
    },

    summary: {
      targetFamilies:
        familyRows.length,
      p0Families:
        p0.length,
      p0Ready:
        p0Ready.length,
      p0Blocked:
        blockers.length,
      closedBetaMinimumFamilies,
      closedBetaFamiliesReady:
        closedBetaReadyFamilies
          .length,
      automationReady:
        automation.ready,
    },

    blockers,
    families:
      familyRows,
  };
}


function buildBetaHealthSnapshot(
  readiness
) {
  const safe =
    readiness &&
    typeof readiness === "object"
      ? readiness
      : {};

  const blockers =
    Array.isArray(
      safe.blockers
    )
      ? safe.blockers
      : [];

  return {
    readyForClosedBeta:
      safe
        .readyForClosedBeta ===
      true,
    closedBetaDataReady:
      safe
        .closedBetaDataReady ===
      true,
    readyForPublicBeta:
      safe
        .readyForPublicBeta ===
      true,
    dataReady:
      safe.dataReady ===
      true,
    automationReady:
      safe
        .automation
        ?.ready ===
      true,
    summary: {
      p0Families:
        Number(
          safe
            .summary
            ?.p0Families ||
          0
        ),
      p0Ready:
        Number(
          safe
            .summary
            ?.p0Ready ||
          0
        ),
      p0Blocked:
        Number(
          safe
            .summary
            ?.p0Blocked ||
          0
        ),
      closedBetaMinimumFamilies:
        Number(
          safe
            .summary
            ?.closedBetaMinimumFamilies ||
          0
        ),
      closedBetaFamiliesReady:
        Number(
          safe
            .summary
            ?.closedBetaFamiliesReady ||
          0
        ),
    },
    blockers:
      blockers.map(
        blocker => ({
          familyId:
            blocker
              ?.familyId ||
            null,
          missingFreshStores:
            Number(
              blocker
                ?.missingFreshStores ||
              0
            ),
          missingFinalCostStores:
            Number(
              blocker
                ?.missingFinalCostStores ||
              0
            ),
        })
      ),
  };
}


module.exports = {
  DEFAULT_CLOSED_BETA_MIN_READY_FAMILIES,
  DEFAULT_CLOSED_BETA_MIN_FINAL_COST_STORES,
  isKnownShipping,
  isStandardOffer,
  uniqueStores,
  readAutomationState,
  buildBetaReadiness,
  buildBetaHealthSnapshot,
};
