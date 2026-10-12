const {
  matchProduct,
} = require("../ingestion/productMatcher");


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
    "\n🧪 DaniSua Product Matcher Smoke Test"
  );

  console.log(
    "=====================================\n"
  );


  try {

    // ====================================
    // 1. VARIANTE CHIARA
    // ====================================

    const iphone128 =
      matchProduct({
        title:
          "Apple iPhone 15 Pro 128 GB Titanio Blu",
        brand:
          "Apple",
        model:
          "iPhone 15 Pro",
        storage:
          "128 GB",
      });


    assert(
      iphone128.status ===
        "matched",
      `iPhone 128 dovrebbe essere matched, ricevuto ${iphone128.status}`
    );


    assert(
      iphone128.productId ===
        "apple-iphone-15-pro-128",
      `Product ID inatteso: ${iphone128.productId}`
    );


    assert(
      iphone128.familyId ===
        "apple-iphone-15-pro",
      `Family ID inatteso: ${iphone128.familyId}`
    );


    assert(
      iphone128.decision ===
        "AUTO_MATCH",
      "iPhone 128 dovrebbe essere AUTO_MATCH"
    );


    // ====================================
    // 2. VARIANTE AMBIGUA
    // ====================================

    const iphoneAmbiguous =
      matchProduct({
        title:
          "Apple iPhone 15 Pro",
        brand:
          "Apple",
        model:
          "iPhone 15 Pro",
      });


    assert(
      iphoneAmbiguous.status ===
        "needs_review",
      `iPhone senza capacità dovrebbe richiedere review, ricevuto ${iphoneAmbiguous.status}`
    );


    assert(
      iphoneAmbiguous.familyId ===
        "apple-iphone-15-pro",
      "Family iPhone Pro non identificata"
    );


    assert(
      iphoneAmbiguous.decision ===
        "NEEDS_REVIEW",
      "Variante ambigua dovrebbe essere NEEDS_REVIEW"
    );


    // ====================================
    // 3. FAMILY CON UNA SOLA VARIANTE
    // ====================================

    const sony =
      matchProduct({
        title:
          "Sony WH-1000XM5 cuffie wireless",
        brand:
          "Sony",
        model:
          "WH-1000XM5",
      });


    assert(
      sony.status ===
        "matched",
      `Sony dovrebbe essere matched, ricevuto ${sony.status}`
    );


    assert(
      sony.productId ===
        "sony-wh-1000xm5",
      `Sony product ID inatteso: ${sony.productId}`
    );


    // ====================================
    // 4. PRODOTTO SCONOSCIUTO
    // ====================================

    const unknown =
      matchProduct({
        title:
          "Marca XYZ SuperPhone 9000",
        brand:
          "XYZ",
        model:
          "SuperPhone 9000",
      });


    assert(
      unknown.status ===
        "unmatched",
      `Prodotto sconosciuto dovrebbe essere unmatched, ricevuto ${unknown.status}`
    );


    assert(
      unknown.decision ===
        "NO_MATCH",
      "Prodotto sconosciuto dovrebbe essere NO_MATCH"
    );


    // ====================================
    // RISULTATO
    // ====================================

    console.log(
      "✅ PRODUCT MATCHER — family, variant e review"
    );

    console.log(
      "\n✅ 1 test superato"
    );

    console.log(
      "❌ 0 test falliti\n"
    );

  } catch (error) {

    console.log(
      "❌ PRODUCT MATCHER — family, variant e review"
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
  }
}


main();