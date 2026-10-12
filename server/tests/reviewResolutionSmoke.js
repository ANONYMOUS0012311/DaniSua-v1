const fs = require("fs");
const path = require("path");

const {
  openDatabase,
  enqueueReview,
  getOfferById,
  getReviewById,
  listPendingReviews,
  closeDatabase,
} = require("../db/database");

const {
  resolveReview,
} = require("../db/reviewResolver");


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
  console.log(
    "\nDaniSua Review Resolution Smoke Test"
  );

  console.log(
    "====================================\n"
  );


  const databasePath =
    path.join(
      __dirname,
      "danisua-review-test.sqlite"
    );


  if (
    fs.existsSync(
      databasePath
    )
  ) {
    fs.unlinkSync(
      databasePath
    );
  }


  let db = null;


  try {
    db =
      openDatabase(
        databasePath
      );


    // ====================================
    // CREATE PENDING REVIEW
    // ====================================

    const reviewId =
      enqueueReview(
        db,
        {
          offer: {
            id:
              "review-test-offer",

            source:
              "awin-unieuro",

            store:
              "Unieuro",

            seller:
              "Unieuro",

            title:
              "Apple iPhone 15 Pro",

            offer_price:
              999.99,

            currency:
              "EUR",

            old_price:
              null,

            shipping_price:
              null,

            stock:
              true,

            url:
              "https://www.unieuro.it/review-test",

            updatedAt:
              null,

            trust: {
              trustTier:
                "A",

              betaEligible:
                true,
            },
          },

          match: {
            status:
              "needs_review",

            decision:
              "NEEDS_REVIEW",

            confidence:
              0.7,

            familyId:
              "apple-iphone-15-pro",

            reason:
              "variant_not_disambiguated",

            candidates: [
              "apple-iphone-15-pro-128",
              "apple-iphone-15-pro-256",
            ],
          },
        }
      );


    assert(
      listPendingReviews(
        db
      ).length ===
        1,
      "Dovrebbe esistere 1 review pending"
    );


    // ====================================
    // RESOLVE
    // ====================================

    const result =
      resolveReview(
        db,
        reviewId,
        "apple-iphone-15-pro-128",
        {
          note:
            "Capacità verificata manualmente",
        }
      );


    assert(
      result.offer.productId ===
        "apple-iphone-15-pro-128",
      `Product ID inatteso: ${result.offer.productId}`
    );


    assert(
      result.offer.familyId ===
        "apple-iphone-15-pro",
      `Family ID inatteso: ${result.offer.familyId}`
    );


    assert(
      result.offer
        .payload
        .productMatch
        .decision ===
        "MANUAL_MATCH",
      "L'offerta dovrebbe risultare MANUAL_MATCH"
    );


    // ====================================
    // REVIEW RESOLVED
    // ====================================

    const review =
      getReviewById(
        db,
        reviewId
      );


    assert(
      review.status ===
        "resolved",
      "Review dovrebbe essere resolved"
    );


    assert(
      review.resolvedProductId ===
        "apple-iphone-15-pro-128",
      "resolvedProductId inatteso"
    );


    assert(
      review.resolvedAt !==
        null,
      "resolvedAt dovrebbe essere valorizzato"
    );


    assert(
      listPendingReviews(
        db
      ).length ===
        0,
      "Non dovrebbero restare review pending"
    );


    // ====================================
    // OFFER EXISTS
    // ====================================

    const savedOffer =
      getOfferById(
        db,
        "review-test-offer"
      );


    assert(
      savedOffer !==
        null,
      "Offerta risolta non salvata"
    );


    assert(
      savedOffer.productId ===
        "apple-iphone-15-pro-128",
      "Offerta salvata con productId errato"
    );


    // ====================================
    // CANNOT RESOLVE TWICE
    // ====================================

    let secondResolutionFailed =
      false;


    try {
      resolveReview(
        db,
        reviewId,
        "apple-iphone-15-pro-256"
      );
    } catch {
      secondResolutionFailed =
        true;
    }


    assert(
      secondResolutionFailed ===
        true,
      "Una review resolved non dovrebbe essere risolvibile una seconda volta"
    );


    console.log(
      "✅ REVIEW RESOLUTION — pending → manual match → offer"
    );

    console.log(
      "\n✅ 1 test superato"
    );

    console.log(
      "❌ 0 test falliti\n"
    );

  } catch (error) {

    console.log(
      "❌ REVIEW RESOLUTION — pending → manual match → offer"
    );

    console.log(
      `   ${error.message}`
    );

    console.log(
      "\n✅ 0 test superati"
    );

    console.log(
      "❌ 1 test fallito\n"
    );

    process.exitCode = 1;

  } finally {

    if (db) {
      closeDatabase(
        db
      );
    }


    if (
      fs.existsSync(
        databasePath
      )
    ) {
      fs.unlinkSync(
        databasePath
      );
    }
  }
}


main();