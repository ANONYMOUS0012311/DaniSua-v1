const {
  upsertOffer,
  enqueueReview,
  listPendingReviews,
} = require("./database");


// ========================================
// DANISUA — INGESTION PERSISTENCE
//
// Riceve il risultato già validato di:
//
// staging
//   ↓
// contract
//   ↓
// trust
//   ↓
// matching
//
// e persiste solamente:
//
// ready       → offers
// needsReview → review_queue
//
// Rejected non diventano offerte.
// ========================================


// ========================================
// VALIDATION
// ========================================

function ensureStagingResult(
  stagingResult
) {
  if (
    !stagingResult ||
    typeof stagingResult !==
      "object"
  ) {
    throw new Error(
      "stagingResult is required"
    );
  }
}


// ========================================
// REVIEW KEY
// ========================================

function getReviewKey(
  reviewItem
) {
  const offer =
    reviewItem?.offer ||
    {};


  const source =
    String(
      offer.source || ""
    ).trim();


  const id =
    String(
      offer.id || ""
    ).trim();


  if (
    !source ||
    !id
  ) {
    return null;
  }


  return `${source}::${id}`;
}


// ========================================
// PERSIST STAGING RESULT
// ========================================

function persistIngestionResult(
  db,
  stagingResult
) {
  ensureStagingResult(
    stagingResult
  );


  const ready =
    Array.isArray(
      stagingResult.ready
    )
      ? stagingResult.ready
      : [];


  const needsReview =
    Array.isArray(
      stagingResult.needsReview
    )
      ? stagingResult.needsReview
      : [];


  // ====================================
  // 1. READY OFFERS
  // ====================================

  const savedOffers = [];


  for (
    const offer of ready
  ) {
    const saved =
      upsertOffer(
        db,
        offer
      );


    savedOffers.push(
      saved
    );
  }


  // ====================================
  // 2. CURRENT PENDING REVIEWS
  //
  // Evitiamo duplicati quando lo stesso
  // feed viene processato più volte.
  // ====================================

  const pendingReviews =
    listPendingReviews(
      db
    );


  const pendingKeys =
    new Set();


  for (
    const review of pendingReviews
  ) {
    const source =
      review?.source;

    const offerId =
      review?.offerId;


    if (
      source &&
      offerId
    ) {
      pendingKeys.add(
        `${source}::${offerId}`
      );
    }
  }


  // ====================================
  // 3. NEEDS REVIEW
  // ====================================

  const enqueuedReviewIds = [];

  let reviewsAlreadyPending = 0;


  for (
    const reviewItem of
    needsReview
  ) {
    const key =
      getReviewKey(
        reviewItem
      );


    if (
      key &&
      pendingKeys.has(
        key
      )
    ) {
      reviewsAlreadyPending += 1;

      continue;
    }


    const reviewId =
      enqueueReview(
        db,
        reviewItem
      );


    enqueuedReviewIds.push(
      reviewId
    );


    if (key) {
      pendingKeys.add(
        key
      );
    }
  }


  // ====================================
  // RESULT
  // ====================================

  return {
    savedOffers,

    enqueuedReviewIds,

    diagnostics: {
      readyReceived:
        ready.length,

      offersUpserted:
        savedOffers.length,

      reviewsReceived:
        needsReview.length,

      reviewsEnqueued:
        enqueuedReviewIds.length,

      reviewsAlreadyPending,

      rejectedIgnored:
        Array.isArray(
          stagingResult
            ?.rejected
            ?.matching
        )
          ? stagingResult
              .rejected
              .matching
              .length
          : 0,
    },
  };
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  getReviewKey,
  persistIngestionResult,
};