const {
  upsertOffer,
  getReviewById,
  markReviewResolved,
} = require("./database");

const {
  loadProducts,
} = require("../ingestion/productMatcher");


// ========================================
// DANISUA - REVIEW RESOLVER
//
// Una review manuale può diventare
// un'offerta solamente se il prodotto
// selezionato esiste nel catalogo DaniSua
// ed è compatibile con la review.
// ========================================


// ========================================
// FIND PRODUCT
// ========================================

function findProduct(
  products,
  productId
) {
  return (
    products.find(
      product =>
        product.productId ===
          productId ||
        product.id ===
          productId
    ) ||
    null
  );
}


// ========================================
// PRODUCT FAMILY
// ========================================

function getProductFamilyId(
  product
) {
  return (
    product.familyId ||
    product.productId ||
    product.id
  );
}


// ========================================
// CANDIDATE VALIDATION
// ========================================

function isAllowedCandidate(
  review,
  productId,
  familyId
) {
  const candidates =
    Array.isArray(
      review.candidates
    )
      ? review.candidates
      : [];


  if (
    candidates.length ===
    0
  ) {
    return true;
  }


  return (
    candidates.includes(
      productId
    ) ||
    candidates.includes(
      familyId
    )
  );
}


// ========================================
// RESOLVE REVIEW
// ========================================

function resolveReview(
  db,
  reviewId,
  selectedProductId,
  {
    note = null,
    products = loadProducts(),
  } = {}
) {
  if (!selectedProductId) {
    throw new Error(
      "selectedProductId is required"
    );
  }


  const review =
    getReviewById(
      db,
      reviewId
    );


  if (!review) {
    throw new Error(
      "Review not found"
    );
  }


  if (
    review.status !==
    "pending"
  ) {
    throw new Error(
      "Review is not pending"
    );
  }


  const product =
    findProduct(
      products,
      selectedProductId
    );


  if (!product) {
    throw new Error(
      "Selected product does not exist in DaniSua catalog"
    );
  }


  const familyId =
    getProductFamilyId(
      product
    );


  // ====================================
  // FAMILY SAFETY
  // ====================================

  if (
    review.familyId &&
    review.familyId !==
      familyId
  ) {
    throw new Error(
      "Selected product belongs to a different family"
    );
  }


  // ====================================
  // CANDIDATE SAFETY
  // ====================================

  if (
    !isAllowedCandidate(
      review,
      selectedProductId,
      familyId
    )
  ) {
    throw new Error(
      "Selected product is not compatible with review candidates"
    );
  }


  const originalOffer =
    review.payload?.offer;


  if (
    !originalOffer ||
    typeof originalOffer !==
      "object"
  ) {
    throw new Error(
      "Review does not contain a valid original offer"
    );
  }


  const previousMatch =
    review.payload?.match ||
    {};


  const resolvedOffer = {
    ...originalOffer,

    productId:
      selectedProductId,

    familyId,

    productMatch: {
      confidence:
        1,

      reason:
        "manual_review_resolution",

      decision:
        "MANUAL_MATCH",

      previousReason:
        previousMatch.reason ??
        null,
    },
  };


  // ====================================
  // ATOMIC TRANSACTION
  // ====================================

  db.exec(
    "BEGIN IMMEDIATE"
  );


  try {
    const savedOffer =
      upsertOffer(
        db,
        resolvedOffer
      );


    const resolvedReview =
      markReviewResolved(
        db,
        reviewId,
        {
          productId:
            selectedProductId,

          note,
        }
      );


    db.exec(
      "COMMIT"
    );


    return {
      offer:
        savedOffer,

      review:
        resolvedReview,
    };

  } catch (error) {

    try {
      db.exec(
        "ROLLBACK"
      );
    } catch {
      // Manteniamo l'errore originale.
    }


    throw error;
  }
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  findProduct,
  getProductFamilyId,
  isAllowedCandidate,
  resolveReview,
};