const fs = require("fs");
const path = require("path");

const {
  openDatabase,
  upsertOffer,
  getOfferById,
  listOffers,
  listOfferPriceHistory,
  enqueueReview,
  listPendingReviews,
  closeDatabase,
} = require("../db/database");


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
    "\nDaniSua Database Smoke Test"
  );

  console.log(
    "===========================\n"
  );


  const databasePath =
    path.join(
      __dirname,
      "danisua-test.sqlite"
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
    // READY OFFER
    // ====================================

    const offer = {
      id:
        "test-offer-1",

      source:
        "test-source",

      store:
        "Unieuro",

      seller:
        "Unieuro",

      title:
        "Apple iPhone 15 Pro 128 GB",

      offer_price:
        1099.99,

      currency:
        "EUR",

      old_price:
        null,

      shipping_price:
        null,

      stock:
        true,

      url:
        "https://www.unieuro.it/test",

      updatedAt:
        null,

      verifiedAt:
        "2026-11-23T18:00:00Z",

      productId:
        "apple-iphone-15-pro-128",

      familyId:
        "apple-iphone-15-pro",

      trust: {
        trustTier:
          "A",

        betaEligible:
          true,
      },

      productMatch: {
        confidence:
          0.99,

        reason:
          "variant_attributes_match",

        decision:
          "AUTO_MATCH",
      },
    };


    const saved =
      upsertOffer(
        db,
        offer
      );


    assert(
      saved.id ===
        "test-offer-1",
      "Offer ID non salvato"
    );


    assert(
      saved.productId ===
        "apple-iphone-15-pro-128",
      "Product ID non salvato"
    );


    assert(
      saved.familyId ===
        "apple-iphone-15-pro",
      "Family ID non salvato"
    );


    assert(
      saved.offer_price ===
        1099.99,
      "Prezzo non salvato"
    );


    assert(
      saved.stock === true,
      "Stock non salvato"
    );


    const initialHistory =
      listOfferPriceHistory(
        db,
        offer.id
      );


    assert(
      initialHistory.length === 1 &&
      initialHistory[0].offer_price ===
        1099.99 &&
      initialHistory[0].verifiedAt ===
        "2026-11-23T18:00:00Z",
      "La prima osservazione di prezzo non è stata registrata"
    );


    // ====================================
    // UPSERT
    // ====================================

    const changedOffer = {
      ...offer,

      offer_price:
        999.99,

      verifiedAt:
        "2026-11-23T19:00:00Z",
    };


    upsertOffer(
      db,
      changedOffer
    );


    const updated =
      getOfferById(
        db,
        offer.id
      );


    assert(
      updated.offer_price ===
        999.99,
      "UPSERT non ha aggiornato il prezzo"
    );


    assert(
      listOffers(
        db
      ).length ===
        1,
      "UPSERT ha duplicato l'offerta"
    );


    const changedHistory =
      listOfferPriceHistory(
        db,
        offer.id
      );


    assert(
      changedHistory.length === 2 &&
      changedHistory[0].offer_price ===
        1099.99 &&
      changedHistory[1].offer_price ===
        999.99,
      "Lo storico deve conservare prezzi realmente osservati"
    );


    assert(
      updated.old_price === null,
      "old_price non deve essere usato come storico osservato"
    );


    upsertOffer(
      db,
      changedOffer
    );


    assert(
      listOfferPriceHistory(
        db,
        offer.id
      ).length === 2,
      "Un UPSERT identico non deve duplicare l'osservazione"
    );


    upsertOffer(
      db,
      {
        ...changedOffer,

        shipping_price:
          0,

        verifiedAt:
          "2026-11-23T20:00:00Z",
      }
    );


    const shippingHistory =
      listOfferPriceHistory(
        db,
        offer.id
      );


    assert(
      shippingHistory.length === 3 &&
      shippingHistory[2].shipping_price ===
        0,
      "Una variazione del costo di spedizione deve creare una nuova osservazione"
    );


    // ====================================
    // REVIEW QUEUE
    // ====================================

    enqueueReview(
      db,
      {
        offer: {
          id:
            "review-offer-1",

          source:
            "test-source",

          store:
            "Unieuro",

          title:
            "Apple iPhone 15 Pro",
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


    const reviews =
      listPendingReviews(
        db
      );


    assert(
      reviews.length ===
        1,
      "Review queue dovrebbe contenere 1 elemento"
    );


    assert(
      reviews[0]
        .status ===
        "pending",
      "Review dovrebbe essere pending"
    );


    assert(
      reviews[0]
        .reason ===
        "variant_not_disambiguated",
      "Review reason inattesa"
    );


    assert(
      reviews[0]
        .candidates
        .length ===
        2,
      "Candidate variants non salvate"
    );


    console.log(
      "✅ DATABASE — offers, upsert e review queue"
    );

    console.log(
      "\n✅ 1 test superato"
    );

    console.log(
      "❌ 0 test falliti\n"
    );

  } catch (error) {
    console.log(
      "❌ DATABASE — offers, upsert e review queue"
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