const {
  validateOffer,
} = require("../utils/offerContract");

const {
  attachTrust,
} = require("../utils/trustPolicy");

const {
  attachProductMatch,
} = require("./productMatcher");


// ========================================
// DANISUA — INGESTION STAGING
//
// raw source data
//      ↓
// mapper
//      ↓
// offer contract
//      ↓
// trust policy
//      ↓
// beta eligibility
//      ↓
// product matching
//      ↓
// ready / needs review / rejected
// ========================================


function isNonEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}


function safeErrorMessage(error) {
  if (
    error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(
    error ||
    "unknown_error"
  );
}


// ========================================
// STAGE SOURCE BATCH
// ========================================

function stageSourceBatch({
  sourceName,
  rawItems,
  mapItem,
  betaOnly = true,
}) {
  if (
    !isNonEmptyString(sourceName)
  ) {
    throw new Error(
      "sourceName is required"
    );
  }


  if (
    !Array.isArray(rawItems)
  ) {
    throw new Error(
      "rawItems must be an array"
    );
  }


  if (
    typeof mapItem !== "function"
  ) {
    throw new Error(
      "mapItem must be a function"
    );
  }


  const mappedOffers = [];

  const rejectedByMapping = [];

  const rejectedByContract = [];

  const rejectedByTrust = [];

  const rejectedByMatching = [];

  const needsReview = [];

  const betaEligibleOffers = [];

  const ready = [];


  // ====================================
  // 1. MAPPING
  // ====================================

  rawItems.forEach(
    (
      rawItem,
      index
    ) => {
      try {
        const mapped =
          mapItem(
            rawItem,
            index
          );


        if (
          !mapped ||
          typeof mapped !==
            "object"
        ) {
          rejectedByMapping.push({
            index,
            reason:
              "mapper_returned_no_offer",
          });

          return;
        }


        const normalizedOffer = {
          ...mapped,

          source:
            mapped.source ||
            sourceName,
        };


        mappedOffers.push({
          index,
          offer:
            normalizedOffer,
        });
      } catch (error) {
        rejectedByMapping.push({
          index,

          reason:
            "mapper_error",

          error:
            safeErrorMessage(
              error
            ),
        });
      }
    }
  );


  // ====================================
  // 2. OFFER CONTRACT
  // ====================================

  const contractValid = [];


  for (
    const item of mappedOffers
  ) {
    const validation =
      validateOffer(
        item.offer
      );


    if (
      !validation.valid
    ) {
      rejectedByContract.push({
        index:
          item.index,

        id:
          item.offer?.id ||
          null,

        errors:
          validation.errors,
      });

      continue;
    }


    contractValid.push(
      item
    );
  }


  // ====================================
  // 3. TRUST POLICY
  // ====================================

  const trustEvaluated = [];


  for (
    const item of contractValid
  ) {
    const offerWithTrust =
      attachTrust(
        item.offer
      );


    if (!offerWithTrust) {
      rejectedByTrust.push({
        index:
          item.index,

        id:
          item.offer?.id ||
          null,

        reason:
          "trust_evaluation_failed",
      });

      continue;
    }


    trustEvaluated.push({
      index:
        item.index,

      offer:
        offerWithTrust,
    });
  }


  // ====================================
  // 4. BETA FILTER
  // ====================================

  for (
    const item of trustEvaluated
  ) {
    const betaEligible =
      item.offer
        ?.trust
        ?.betaEligible ===
      true;


    if (
      betaOnly &&
      !betaEligible
    ) {
      rejectedByTrust.push({
        index:
          item.index,

        id:
          item.offer?.id ||
          null,

        reason:
          item.offer
            ?.trust
            ?.reason ||
          "not_beta_eligible",
      });

      continue;
    }


    betaEligibleOffers.push(
      item
    );
  }


  // ====================================
  // 5. PRODUCT MATCHING
  // ====================================

  for (
    const item of betaEligibleOffers
  ) {
    const result =
      attachProductMatch(
        item.offer
      );


    const match =
      result.match;


    // ----------------------------------
    // MATCH SICURO
    // ----------------------------------

    if (
      match.status ===
      "matched"
    ) {
      ready.push(
        result.offer
      );

      continue;
    }


    // ----------------------------------
    // RICHIEDE REVIEW
    // ----------------------------------

    if (
      match.status ===
      "needs_review"
    ) {
      needsReview.push({
        index:
          item.index,

        offer:
          item.offer,

        match,
      });

      continue;
    }


    // ----------------------------------
    // NESSUN MATCH
    // ----------------------------------

    rejectedByMatching.push({
      index:
        item.index,

      id:
        item.offer?.id ||
        null,

      reason:
        match.reason ||
        "product_not_matched",

      match,
    });
  }


  // ====================================
  // 6. RESULT
  // ====================================

  return {
    ready,

    needsReview,

    rejected: {
      mapping:
        rejectedByMapping,

      contract:
        rejectedByContract,

      trust:
        rejectedByTrust,

      matching:
        rejectedByMatching,
    },

    diagnostics: {
      source:
        sourceName,

      betaOnly,

      totalRaw:
        rawItems.length,

      totalMapped:
        mappedOffers.length,

      totalRejectedByMapping:
        rejectedByMapping.length,

      totalContractValid:
        contractValid.length,

      totalRejectedByContract:
        rejectedByContract.length,

      totalTrustEvaluated:
        trustEvaluated.length,

      totalRejectedByTrust:
        rejectedByTrust.length,

      totalBetaEligible:
        betaEligibleOffers.length,

      totalProductMatchEvaluated:
        betaEligibleOffers.length,

      totalNeedsReview:
        needsReview.length,

      totalRejectedByMatching:
        rejectedByMatching.length,

      totalReady:
        ready.length,
    },
  };
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  stageSourceBatch,
};