const fs = require("fs");
const path = require("path");

const {
  openDatabase,
  upsertOffer,
  closeDatabase,
} = require("../db/database");


// ========================================
// TEST DATABASE PATH
// ========================================

const databasePath =
  path.join(
    __dirname,
    "danisua-source-test.sqlite"
  );


process.env.DANISUA_DB_PATH =
  databasePath;


// IMPORT DOPO ENV
const databaseSource =
  require("../sources/database");


// ========================================
// ASSERT
// ========================================

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
// TEST
// ========================================

async function main() {
  console.log(
    "\nDaniSua Database Source Smoke Test"
  );

  console.log(
    "==================================\n"
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
    // DB NON ESISTENTE
    // ====================================

    const before =
      await databaseSource.search(
        "iphone"
      );


    assert(
      before.length ===
        0,
      "Database assente dovrebbe restituire []"
    );


    // ====================================
    // CREATE TEST DATABASE
    // ====================================

    db =
      openDatabase(
        databasePath
      );


    upsertOffer(
      db,
      {
        id:
          "db-test-iphone",

        source:
          "awin-unieuro",

        store:
          "Unieuro",

        seller:
          "Unieuro",

        title:
          "Apple iPhone 15 Pro 128 GB",

        brand:
          "Apple",

        model:
          "iPhone 15 Pro",

        storage:
          "128 GB",

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
          "https://www.unieuro.it/test",

        updatedAt:
          "2026-10-09T10:00:00Z",

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
      }
    );


    closeDatabase(
      db
    );

    db = null;


    // ====================================
    // SEARCH
    // ====================================

    const iphoneResults =
      await databaseSource.search(
        "iphone 15 pro"
      );


    assert(
      iphoneResults.length ===
        1,
      `Atteso 1 risultato, ricevuti ${iphoneResults.length}`
    );


    assert(
      iphoneResults[0]
        .productId ===
        "apple-iphone-15-pro-128",
      `Product ID inatteso: ${iphoneResults[0]?.productId}`
    );


    assert(
      iphoneResults[0]
        .offer_price ===
        999.99,
      `Prezzo inatteso: ${iphoneResults[0]?.offer_price}`
    );


    assert(
      iphoneResults[0]
        .source ===
        "awin-unieuro",
      `Source inattesa: ${iphoneResults[0]?.source}`
    );


    // ====================================
    // NON MATCHING QUERY
    // ====================================

    const sonyResults =
      await databaseSource.search(
        "sony xm5"
      );


    assert(
      sonyResults.length ===
        0,
      "Query Sony non dovrebbe trovare iPhone"
    );


    // ====================================
    // EMPTY QUERY
    // ====================================

    const allResults =
      await databaseSource.search(
        ""
      );


    assert(
      allResults.length ===
        1,
      "Query vuota dovrebbe restituire tutte le offerte"
    );


    // ====================================
    // STATUS
    // ====================================

    const status =
      databaseSource.getStatus();


    assert(
      status.available ===
        true,
      "Database source dovrebbe risultare available"
    );


    console.log(
      "✅ DATABASE SOURCE — lettura e ricerca offerte persistite"
    );

    console.log(
      "\n✅ 1 test superato"
    );

    console.log(
      "❌ 0 test falliti\n"
    );

  } catch (error) {

    console.log(
      "❌ DATABASE SOURCE — lettura e ricerca offerte persistite"
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