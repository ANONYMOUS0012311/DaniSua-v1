const fs = require("fs");
const path = require("path");

const {
  stageSourceBatch,
} = require("../ingestion/staging");

const {
  openDatabase,
  getOfferById,
  listOffers,
  listPendingReviews,
  closeDatabase,
} = require("../db/database");

const {
  persistIngestionResult,
} = require("../db/persistIngestion");


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


// ========================================
// RAW TEST DATA
// ========================================

function buildRawItems(
  price = 1099.99
) {
  return [

    // ====================================
    // AUTO MATCH
    // ====================================

    {
      sku:
        "IPHONE15PRO128",

      name:
        "Apple iPhone 15 Pro 128 GB",

      brand:
        "Apple",

      model:
        "iPhone 15 Pro",

      storage:
        "128 GB",

      price,

      store:
        "Unieuro",

      url:
        "https://www.unieuro.it/online/test-persistence-128",
    },


    // ====================================
    // NEEDS REVIEW
    // ====================================

    {
      sku:
        "IPHONE15PROUNKNOWN",

      name:
        "Apple iPhone 15 Pro",

      brand:
        "Apple",

      model:
        "iPhone 15 Pro",

      price:
        1049.99,

      store:
        "Unieuro",

      url:
        "https://www.unieuro.it/online/test-persistence-review",
    },


    // ====================================
    // NO MATCH
    // ====================================

    {
      sku:
        "UNKNOWN",

      name:
        "XYZ SuperPhone 9000",

      brand:
        "XYZ",

      model:
        "SuperPhone 9000",

      price:
        399.99,

      store:
        "Unieuro",

      url:
        "https://www.unieuro.it/online/test-persistence-unknown",
    },
  ];
}


// ========================================
// MAPPER
// ========================================

function mapItem(
  rawItem
) {
  return {
    id:
      `test-${rawItem.sku}`,

    store:
      rawItem.store,

    seller:
      rawItem.store,

    title:
      rawItem.name,

    brand:
      rawItem.brand,

    model:
      rawItem.model,

    storage:
      rawItem.storage,

    offer_price:
      rawItem.price,

    currency:
      "EUR",

    url:
      rawItem.url,

    old_price:
      null,

    shipping_price:
      null,

    stock:
      null,

    updatedAt:
      null,
  };
}


// ========================================
// CREATE STAGING RESULT
// ========================================

function createStagingResult(
  price
) {
  return stageSourceBatch({
    sourceName:
      "test-source",

    rawItems:
      buildRawItems(
        price
      ),

    mapItem,

    betaOnly:
      true,
  });
}


// ========================================
// TEST
// ========================================

function main() {
  console.log(
    "\nDaniSua Persistence Smoke Test"
  );

  console.log(
    "==============================\n"
  );


  const databasePath =
    path.join(
      __dirname,
      "danisua-persistence-test.sqlite"
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

    // ====================================
    // DATABASE
    // ====================================

    db =
      openDatabase(
        databasePath
      );


    // ====================================
    // FIRST INGESTION
    // ====================================

    const firstStaging =
      createStagingResult(
        1099.99
      );


    assert(
      firstStaging.ready.length ===
        1,
      "Prima ingestion dovrebbe avere 1 ready"
    );


    assert(
      firstStaging.needsReview.length ===
        1,
      "Prima ingestion dovrebbe avere 1 needsReview"
    );


    assert(
      firstStaging
        .rejected
        .matching
        .length ===
        1,
      "Prima ingestion dovrebbe avere 1 NO_MATCH"
    );


    const firstPersist =
      persistIngestionResult(
        db,
        firstStaging
      );


    assert(
      firstPersist
        .diagnostics
        .offersUpserted ===
        1,
      "Dovrebbe essere salvata 1 offerta"
    );


    assert(
      firstPersist
        .diagnostics
        .reviewsEnqueued ===
        1,
      "Dovrebbe essere accodata 1 review"
    );


    assert(
      listOffers(
        db
      ).length ===
        1,
      "Database dovrebbe contenere 1 offerta"
    );


    assert(
      listPendingReviews(
        db
      ).length ===
        1,
      "Database dovrebbe contenere 1 review pending"
    );


    // ====================================
    // SECOND INGESTION
    //
    // Stessa offerta:
    // - prezzo aggiornato
    // - niente duplicato offer
    // - niente duplicato review
    // ====================================

    const secondStaging =
      createStagingResult(
        999.99
      );


    const secondPersist =
      persistIngestionResult(
        db,
        secondStaging
      );


    assert(
      secondPersist
        .diagnostics
        .offersUpserted ===
        1,
      "Seconda ingestion dovrebbe fare UPSERT di 1 offerta"
    );


    assert(
      secondPersist
        .diagnostics
        .reviewsEnqueued ===
        0,
      "La stessa review non dovrebbe essere duplicata"
    );


    assert(
      secondPersist
        .diagnostics
        .reviewsAlreadyPending ===
        1,
      "La review esistente dovrebbe essere riconosciuta"
    );


    // ====================================
    // VERIFY OFFER UPSERT
    // ====================================

    const savedOffer =
      getOfferById(
        db,
        "test-IPHONE15PRO128"
      );


    assert(
      savedOffer !==
        null,
      "Offerta persistita non trovata"
    );


    assert(
      savedOffer.offer_price ===
        999.99,
      `Prezzo aggiornato inatteso: ${savedOffer?.offer_price}`
    );


    assert(
      savedOffer.productId ===
        "apple-iphone-15-pro-128",
      `Product ID inatteso: ${savedOffer?.productId}`
    );


    assert(
      savedOffer.familyId ===
        "apple-iphone-15-pro",
      `Family ID inatteso: ${savedOffer?.familyId}`
    );


    // ====================================
    // VERIFY NO DUPLICATES
    // ====================================

    assert(
      listOffers(
        db
      ).length ===
        1,
      "UPSERT non dovrebbe duplicare offers"
    );


    assert(
      listPendingReviews(
        db
      ).length ===
        1,
      "Repeated ingestion non dovrebbe duplicare review pending"
    );


    // ====================================
    // SUCCESS
    // ====================================

    console.log(
      "✅ PERSISTENCE — ingestion, offers, review queue e idempotenza"
    );

    console.log(
      "\n✅ 1 test superato"
    );

    console.log(
      "❌ 0 test falliti\n"
    );

  } catch (error) {

    console.log(
      "❌ PERSISTENCE — ingestion, offers, review queue e idempotenza"
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