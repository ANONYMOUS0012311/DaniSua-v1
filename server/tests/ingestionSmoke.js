const {
  stageSourceBatch,
} = require("../ingestion/staging");


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


function testIngestionStaging() {
  const rawItems = [

    // 1. VALIDO + MATCH SICURO

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

      price:
        1099.99,

      store:
        "Unieuro",

      url:
        "https://www.unieuro.it/online/test-iphone-128",
    },


    // 2. CONTRACT ERROR

    {
      sku:
        "NOPRICE",

      name:
        "Apple iPhone 15 Pro 128 GB",

      brand:
        "Apple",

      model:
        "iPhone 15 Pro",

      storage:
        "128 GB",

      store:
        "Unieuro",

      url:
        "https://www.unieuro.it/online/test-no-price",
    },


    // 3. TRUST ERROR

    {
      sku:
        "UNKNOWNSTORE",

      name:
        "Apple iPhone 15 Pro 128 GB",

      brand:
        "Apple",

      model:
        "iPhone 15 Pro",

      storage:
        "128 GB",

      price:
        999.99,

      store:
        "Negozio Sconosciuto",

      url:
        "https://example.com/test",
    },


    // 4. MAPPER ERROR

    {
      sku:
        "ERROR",

      forceError:
        true,
    },


    // 5. MATCH AMBIGUO

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
        "https://www.unieuro.it/online/test-iphone-unknown",
    },


    // 6. NESSUN MATCH

    {
      sku:
        "UNKNOWNPRODUCT",

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
        "https://www.unieuro.it/online/test-unknown-product",
    },
  ];


  const result =
    stageSourceBatch({
      sourceName:
        "awin-unieuro",

      rawItems,

      mapItem:
        rawItem => {
          if (
            rawItem.forceError
          ) {
            throw new Error(
              "errore mapper simulato"
            );
          }


          return {
            id:
              `awin-${rawItem.sku}`,

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
        },

      betaOnly:
        true,
    });


  // ====================================
  // READY
  // ====================================

  assert(
    result.ready.length ===
      1,
    `Attesa 1 offerta pronta, ricevute ${result.ready.length}`
  );


  assert(
    result.ready[0]
      .store ===
      "Unieuro",
    "L'offerta pronta dovrebbe appartenere a Unieuro"
  );


  assert(
    result.ready[0]
      .source ===
      "awin-unieuro",
    `Source inattesa: ${result.ready[0]?.source}`
  );


  assert(
    result.ready[0]
      .trust
      ?.betaEligible ===
      true,
    "Unieuro dovrebbe essere betaEligible"
  );


  assert(
    result.ready[0]
      .productId ===
      "apple-iphone-15-pro-128",
    `Product ID inatteso: ${result.ready[0]?.productId}`
  );


  assert(
    result.ready[0]
      .familyId ===
      "apple-iphone-15-pro",
    `Family ID inatteso: ${result.ready[0]?.familyId}`
  );


  assert(
    result.ready[0]
      .productMatch
      ?.decision ===
      "AUTO_MATCH",
    "L'offerta valida dovrebbe essere AUTO_MATCH"
  );


  // ====================================
  // MAPPING ERROR
  // ====================================

  assert(
    result.rejected
      .mapping
      .length ===
      1,
    `Atteso 1 errore mapping, ricevuti ${result.rejected.mapping.length}`
  );


  // ====================================
  // CONTRACT ERROR
  // ====================================

  assert(
    result.rejected
      .contract
      .length ===
      1,
    `Atteso 1 errore contract, ricevuti ${result.rejected.contract.length}`
  );


  assert(
    result.rejected
      .contract[0]
      .errors
      .includes(
        "invalid_offer_price"
      ),
    "Il prodotto senza prezzo dovrebbe fallire per invalid_offer_price"
  );


  // ====================================
  // TRUST ERROR
  // ====================================

  assert(
    result.rejected
      .trust
      .length ===
      1,
    `Atteso 1 errore trust, ricevuti ${result.rejected.trust.length}`
  );


  assert(
    result.rejected
      .trust[0]
      .reason ===
      "unknown_store",
    `Trust reason inattesa: ${result.rejected.trust[0]?.reason}`
  );


  // ====================================
  // NEEDS REVIEW
  // ====================================

  assert(
    result.needsReview
      .length ===
      1,
    `Attesa 1 offerta needs review, ricevute ${result.needsReview.length}`
  );


  assert(
    result.needsReview[0]
      .match
      .decision ===
      "NEEDS_REVIEW",
    "iPhone Pro senza capacità dovrebbe essere NEEDS_REVIEW"
  );


  assert(
    result.needsReview[0]
      .match
      .familyId ===
      "apple-iphone-15-pro",
    "La family dell'offerta ambigua dovrebbe essere identificata"
  );


  // ====================================
  // NO MATCH
  // ====================================

  assert(
    result.rejected
      .matching
      .length ===
      1,
    `Atteso 1 prodotto senza match, ricevuti ${result.rejected.matching.length}`
  );


  assert(
    result.rejected
      .matching[0]
      .match
      .decision ===
      "NO_MATCH",
    "Il prodotto sconosciuto dovrebbe essere NO_MATCH"
  );


  // ====================================
  // DIAGNOSTICS
  // ====================================

  assert(
    result.diagnostics
      .totalRaw ===
      6,
    "totalRaw dovrebbe essere 6"
  );


  assert(
    result.diagnostics
      .totalMapped ===
      5,
    "totalMapped dovrebbe essere 5"
  );


  assert(
    result.diagnostics
      .totalRejectedByMapping ===
      1,
    "totalRejectedByMapping dovrebbe essere 1"
  );


  assert(
    result.diagnostics
      .totalContractValid ===
      4,
    "totalContractValid dovrebbe essere 4"
  );


  assert(
    result.diagnostics
      .totalRejectedByContract ===
      1,
    "totalRejectedByContract dovrebbe essere 1"
  );


  assert(
    result.diagnostics
      .totalTrustEvaluated ===
      4,
    "totalTrustEvaluated dovrebbe essere 4"
  );


  assert(
    result.diagnostics
      .totalRejectedByTrust ===
      1,
    "totalRejectedByTrust dovrebbe essere 1"
  );


  assert(
    result.diagnostics
      .totalBetaEligible ===
      3,
    "totalBetaEligible dovrebbe essere 3"
  );


  assert(
    result.diagnostics
      .totalProductMatchEvaluated ===
      3,
    "totalProductMatchEvaluated dovrebbe essere 3"
  );


  assert(
    result.diagnostics
      .totalNeedsReview ===
      1,
    "totalNeedsReview dovrebbe essere 1"
  );


  assert(
    result.diagnostics
      .totalRejectedByMatching ===
      1,
    "totalRejectedByMatching dovrebbe essere 1"
  );


  assert(
    result.diagnostics
      .totalReady ===
      1,
    "totalReady dovrebbe essere 1"
  );
}


function main() {
  console.log(
    "\n🧪 DaniSua Ingestion Smoke Test"
  );

  console.log(
    "===============================\n"
  );


  try {
    testIngestionStaging();

    console.log(
      "✅ INGESTION — contract, trust e product matching"
    );

    console.log(
      "\n✅ 1 test superato"
    );

    console.log(
      "❌ 0 test falliti\n"
    );
  } catch (error) {
    console.log(
      "❌ INGESTION — contract, trust e product matching"
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