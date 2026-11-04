const {
  spawn,
} = require("child_process");

const path =
  require("path");

const {
  validateOffer,
} = require("../utils/offerContract");

const {
  getLowestOffer,
} = require("../utils/rankProducts");


const BASE_URL =
  process.env.DANISUA_BASE_URL ||
  "http://localhost:3000";

const PROJECT_ROOT =
  path.join(
    __dirname,
    "..",
    ".."
  );

const SERVER_PATH =
  path.join(
    __dirname,
    "..",
    "index.js"
  );

let temporaryServer =
  null;


// ========================================
// UTILS
// ========================================

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


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


async function isServerReady() {
  try {
    const response =
      await fetch(
        `${BASE_URL}/health`
      );

    return response.ok;
  } catch {
    return false;
  }
}


// ========================================
// SERVER TEMPORANEO
// ========================================

async function startServerIfNeeded() {
  if (
    await isServerReady()
  ) {
    console.log(
      "ℹ️ Server già attivo."
    );

    return;
  }


  console.log(
    "🚀 Avvio temporaneamente il server..."
  );


  let stderr = "";


  temporaryServer =
    spawn(
      process.execPath,
      [
        SERVER_PATH,
      ],
      {
        cwd:
          PROJECT_ROOT,

        env: {
          ...process.env,
        },

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );


  temporaryServer.stderr.on(
    "data",
    chunk => {
      stderr +=
        chunk.toString();
    }
  );


  for (
    let attempt = 0;
    attempt < 40;
    attempt += 1
  ) {
    if (
      temporaryServer.exitCode !==
      null
    ) {
      throw new Error(
        `Impossibile avviare DaniSua.\n${stderr}`
      );
    }


    if (
      await isServerReady()
    ) {
      console.log(
        "✅ Server pronto."
      );

      return;
    }


    await sleep(250);
  }


  throw new Error(
    `Timeout durante l'avvio del server.\n${stderr}`
  );
}


function stopTemporaryServer() {
  if (
    temporaryServer &&
    temporaryServer.exitCode ===
      null
  ) {
    temporaryServer.kill();
  }
}


// ========================================
// SEARCH
// ========================================

async function search(query) {
  const url =
    `${BASE_URL}/search?q=${encodeURIComponent(
      query
    )}`;

  const response =
    await fetch(url);


  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }


  return response.json();
}


// ========================================
// TEST 1
// PRODUCT SEARCH
// ========================================

async function testProductSearch() {
  const data =
    await search(
      "iPhone 15 Pro 128 GB"
    );


  assert(
    data.intent ===
      "PRODUCT_SEARCH",
    `Intent atteso PRODUCT_SEARCH, ricevuto ${data.intent}`
  );


  assert(
    data.status ===
      "specific",
    `Status atteso specific, ricevuto ${data.status}`
  );


  assert(
    Array.isArray(
      data.results
    ),
    "results non è un array"
  );


  assert(
    data.results.length ===
      3,
    `Attese 3 offerte equivalenti, ricevute ${data.results.length}`
  );


  assert(
    data.bestOffer
      ?.productId ===
      "apple-iphone-15-pro-128",
    "Prodotto migliore inatteso"
  );


  assert(
    data.bestOffer
      ?.offer_price ===
      1199.99,
    `Prezzo atteso 1199.99, ricevuto ${data.bestOffer?.offer_price}`
  );
}


// ========================================
// TEST 2
// BEST OFFER
// ========================================

async function testBestOffer() {
  const data =
    await search(
      "iPhone 15 Pro più economico"
    );


  assert(
    data.intent ===
      "BEST_OFFER",
    `Intent atteso BEST_OFFER, ricevuto ${data.intent}`
  );


  assert(
    data.bestOffer,
    "bestOffer mancante"
  );


  assert(
    data.bestOffer
      .productId ===
      "apple-iphone-15-pro-128",
    `Variante inattesa: ${data.bestOffer?.productId}`
  );


  assert(
    data.bestOffer
      .offer_price ===
      1199.99,
    `Prezzo atteso 1199.99, ricevuto ${data.bestOffer?.offer_price}`
  );
}


// ========================================
// TEST 3
// BEST PRODUCT
// ========================================

async function testBestProduct() {
  const data =
    await search(
      "smartphone con la migliore fotocamera"
    );


  assert(
    data.intent ===
      "BEST_PRODUCT",
    `Intent atteso BEST_PRODUCT, ricevuto ${data.intent}`
  );


  assert(
    data.bestOffer,
    "bestOffer mancante"
  );


  assert(
    data.bestOffer
      .familyId ===
      "apple-iphone-15-pro",
    `Famiglia vincente inattesa: ${data.bestOffer?.familyId}`
  );
}


// ========================================
// TEST 3B
// QUERY NATURALE + TYPO
// ========================================

async function testNaturalCameraQuery() {
  const queries = [
    "iPhone 15 con la migliore telecamera",
    "iPhone 15 con la miglore telecamera",
  ];

  for (const query of queries) {
    const data = await search(query);

    assert(
      data.intent === "BEST_PRODUCT",
      `BEST_PRODUCT atteso per "${query}", ricevuto ${data.intent}`
    );

    assert(
      String(data.productQuery || "").toLowerCase() === "iphone 15",
      `productQuery inattesa per "${query}": ${data.productQuery}`
    );

    assert(
      Array.isArray(data.context?.objectives) &&
        data.context.objectives.some(
          objective => objective.criterion === "camera"
        ),
      `Obiettivo camera non rilevato per "${query}"`
    );

    assert(
      data.bestOffer,
      `Nessuna bestOffer per "${query}"`
    );
  }
}


// ========================================
// TEST 4
// RECOMMENDATION SOTTO 1000
// ========================================

async function testRecommendationBudget() {
  const data =
    await search(
      "Mi serve uno smartphone per fare foto sotto 1000 euro"
    );


  assert(
    data.intent ===
      "RECOMMENDATION",
    `Intent atteso RECOMMENDATION, ricevuto ${data.intent}`
  );


  assert(
    data.bestOffer,
    "bestOffer mancante"
  );


  assert(
    data.bestOffer
      .familyId ===
      "apple-iphone-15",
    `Famiglia attesa apple-iphone-15, ricevuta ${data.bestOffer?.familyId}`
  );


  assert(
    data.bestOffer
      .offer_price <=
      1000,
    `L'offerta supera il budget: ${data.bestOffer?.offer_price}`
  );

  assert(
    data.context
      ?.dataCoverage
      ?.partialObjectives
      ?.some(
        item =>
          item.criterion ===
          "camera"
      ),
    "La copertura camera dovrebbe essere dichiarata parziale"
  );

  assert(
    data.context
      ?.dataCoverage
      ?.excludedFamilies >= 1,
    "Dovrebbe essere dichiarata almeno una famiglia esclusa dal ranking"
  );

  assert(
    data.recommendation
      ?.message
      ?.includes(
        "dati verificati comparabili"
      ),
    "La raccomandazione deve spiegare la copertura parziale"
  );
}


// ========================================
// TEST 5
// NESSUN LAPTOP SOTTO 1000
// ========================================

async function testNoLaptopInBudget() {
  const data =
    await search(
      "Mi serve un portatile per l'università sotto 1000 euro"
    );


  assert(
    data.intent ===
      "RECOMMENDATION",
    `Intent atteso RECOMMENDATION, ricevuto ${data.intent}`
  );


  assert(
    data.status ===
      "no_products_in_budget",
    `Status atteso no_products_in_budget, ricevuto ${data.status}`
  );


  assert(
    data.canRecommend ===
      false,
    `canRecommend atteso false, ricevuto ${data.canRecommend}`
  );


  assert(
    !data.bestOffer,
    "Non dovrebbe esserci una bestOffer"
  );
}


// ========================================
// TEST 6
// SOURCE REGISTRY + TRUST
// ========================================

async function testTrustLayer() {
  const data =
    await search(
      "iPhone 15 Pro 128 GB"
    );


  assert(
    Array.isArray(
      data.results
    ) &&
      data.results.length ===
        3,
    "Il test trust richiede 3 offerte"
  );


  for (
    const offer of data.results
  ) {
    assert(
      offer.source ===
        "local",
      `Source mancante o inattesa per ${offer.store}: ${offer.source}`
    );


    assert(
      offer.trust,
      `Trust mancante per ${offer.store}`
    );


    assert(
      offer.trust
        .knownStore ===
        true,
      `${offer.store} non risulta knownStore`
    );


    assert(
      offer.trust
        .verifiedStore ===
        true,
      `${offer.store} non risulta verifiedStore`
    );


    assert(
      offer.trust
        .betaEligible ===
        true,
      `${offer.store} non risulta betaEligible`
    );


    assert(
      offer.trust
        .reason ===
        "trusted_store",
      `Trust reason inattesa per ${offer.store}: ${offer.trust?.reason}`
    );
  }


  const amazon =
    data.results.find(
      offer =>
        offer.store ===
        "Amazon"
    );


  assert(
    amazon,
    "Offerta Amazon mancante"
  );


  assert(
    amazon.trust
      .storeType ===
      "marketplace",
    `Amazon dovrebbe essere marketplace, ricevuto ${amazon.trust?.storeType}`
  );


  assert(
    amazon.trust
      .directSeller ===
      true,
    "Amazon dovrebbe essere riconosciuto come venditore diretto"
  );
}


// ========================================
// TEST 7
// OFFER CONTRACT
// ========================================

async function testOfferContract() {
  const data =
    await search(
      "iPhone 15 Pro 128 GB"
    );


  assert(
    Array.isArray(
      data.results
    ) &&
      data.results.length >
        0,
    "Nessuna offerta disponibile per il test contract"
  );


  for (
    const offer of data.results
  ) {
    const validation =
      validateOffer(
        offer
      );


    assert(
      validation.valid ===
        true,
      `Offerta ${offer.id} non valida: ${validation.errors.join(", ")}`
    );
  }


  const invalidOffer = {
    id:
      "invalid-test",

    source:
      "test",

    store:
      "Test Store",

    title:
      "Prodotto test",

    offer_price:
      -10,

    currency:
      "EUR",

    url:
      "not-a-valid-url",

    updatedAt:
      "not-a-date",
  };


  const invalidValidation =
    validateOffer(
      invalidOffer
    );


  assert(
    invalidValidation.valid ===
      false,
    "Il contract ha accettato un'offerta volutamente invalida"
  );


  assert(
    invalidValidation.errors.includes(
      "invalid_offer_price"
    ),
    "Manca errore invalid_offer_price"
  );


  assert(
    invalidValidation.errors.includes(
      "invalid_url"
    ),
    "Manca errore invalid_url"
  );


  assert(
    invalidValidation.errors.includes(
      "invalid_updated_at"
    ),
    "Manca errore invalid_updated_at"
  );
}


// ========================================
// TEST 8
// PREZZI CONDIZIONATI
// ========================================

async function testConditionalPricingRanking() {
  const entity = {
    offers: [
      {
        id: "conditional-cheap",
        offer_price: 499,
        pricing: {
          conditional: true,
        },
      },
      {
        id: "standard-real",
        offer_price: 699,
        pricing: {
          conditional: false,
        },
      },
    ],
  };

  const best =
    getLowestOffer(entity);

  assert(
    best?.id === "standard-real",
    `Un prezzo condizionato non deve vincere il ranking standard: ${best?.id}`
  );
}


// ========================================
// TEST 9
// PRODUCT LINE — PREZZO DOMINA
// ========================================

async function testAirPodsProductLine() {
  const data =
    await search(
      "AirPods"
    );

  assert(
    data.intent ===
      "PRODUCT_SEARCH",
    `Intent AirPods inatteso: ${data.intent}`
  );

  assert(
    data.status ===
      "product_line_ready",
    `Status AirPods inatteso: ${data.status}`
  );

  assert(
    data.recommendation
      ?.reason ===
      "generic_price_first",
    "La linea AirPods deve usare la regola price-first"
  );

  assert(
    data.bestOffer
      ?.productId ===
      "apple-airpods-5-usbc",
    `Variante disponibile più economica inattesa: ${data.bestOffer?.productId}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      149,
    `Prezzo AirPods generico inatteso: ${data.bestOffer?.offer_price}`
  );
}


// ========================================
// TEST 10
// HARD REQUIREMENT — ANC
// ========================================

async function testAirPodsAncRequirement() {
  const data =
    await search(
      "AirPods con cancellazione del rumore"
    );

  assert(
    data.productQuery ===
      "airpods",
    `productQuery ANC inattesa: ${data.productQuery}`
  );

  assert(
    data.context
      ?.hardRequirements
      ?.anc === true,
    "Requisito ANC non rilevato"
  );

  assert(
    Array.isArray(
      data.results
    ) &&
    data.results.length > 0,
    "Nessun AirPods compatibile con ANC"
  );

  assert(
    data.results.every(
      offer =>
        offer.attributes
          ?.anc === true
    ),
    "È rimasta una variante senza ANC"
  );

  assert(
    data.bestOffer
      ?.productId ===
      "apple-airpods-5-usbc",
    `Migliore AirPods ANC inatteso: ${data.bestOffer?.productId}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      149,
    `Prezzo AirPods ANC inatteso: ${data.bestOffer?.offer_price}`
  );
}


// ========================================
// TEST 11
// FAMILY — VARIANTE PIÙ ECONOMICA
// ========================================

async function testAirPodsFamilyPriceFirst() {
  const data =
    await search(
      "AirPods 5"
    );

  assert(
    data.status ===
      "family_price_ready",
    `Status AirPods 5 inatteso: ${data.status}`
  );

  assert(
    data.bestOffer
      ?.productId ===
      "apple-airpods-5-usbc",
    `Variante AirPods 5 inattesa: ${data.bestOffer?.productId}`
  );

  assert(
    data.results.length ===
      2,
    `Attese 2 varianti AirPods 5, ricevute ${data.results.length}`
  );
}


// ========================================
// TEST 12
// IPHONE 17 — COLORE FLESSIBILE
// ========================================

async function testIPhone17FlexibleColor() {
  const data =
    await search(
      "iPhone 17 256 GB"
    );

  assert(
    data.status ===
      "family_price_ready",
    `Status iPhone 17 inatteso: ${data.status}`
  );

  assert(
    data.canRecommend === true,
    "iPhone 17 senza colore non deve chiedere chiarimenti"
  );

  assert(
    data.results.some(
      offer =>
        offer.color === "Nero"
    ) &&
    data.results.some(
      offer =>
        offer.color === "Salvia"
    ),
    "La ricerca deve mantenere più colori compatibili"
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-mediaworld-iphone17-256-black",
    `Offerta iPhone 17 inattesa: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      989.49,
    `Prezzo iPhone 17 inatteso: ${data.bestOffer?.offer_price}`
  );
}


// ========================================
// TEST 13
// IPHONE 17 — COLORE ESPLICITO
// ========================================

async function testIPhone17ExplicitColor() {
  const data =
    await search(
      "iPhone 17 256 GB Salvia"
    );

  assert(
    data.canRecommend === true,
    "iPhone 17 Salvia deve essere raccomandabile"
  );

  assert(
    data.results.length === 1,
    `Attesa una sola offerta Salvia, ricevute ${data.results.length}`
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-mediaworld-iphone17-256-sage",
    `Offerta Salvia inattesa: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      999.49,
    `Prezzo Salvia inatteso: ${data.bestOffer?.offer_price}`
  );
}


// ========================================
// TEST 14
// GALAXY S26 ULTRA — MULTI STORE
// ========================================

async function testGalaxyS26UltraMultiStore() {
  const data =
    await search(
      "Galaxy S26 Ultra 256 GB White"
    );

  assert(
    data.canRecommend === true,
    "Galaxy S26 Ultra deve essere raccomandabile"
  );

  assert(
    data.results.length === 2,
    `Attese 2 offerte Galaxy S26 Ultra, ricevute ${data.results.length}`
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-mediaworld-s26ultra-256-white",
    `Migliore offerta Galaxy inattesa: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      1274.49,
    `Prezzo Galaxy inatteso: ${data.bestOffer?.offer_price}`
  );
}


// ========================================
// TEST 15
// MACBOOK AIR M5 — COLORE FLESSIBILE
// ========================================

async function testMacBookAirM5FlexibleColor() {
  const data =
    await search(
      "MacBook Air 13 M5 16 GB 512 GB"
    );

  assert(
    data.status ===
      "family_price_ready",
    `Status MacBook Air M5 inatteso: ${data.status}`
  );

  assert(
    data.canRecommend === true,
    "MacBook Air M5 senza colore non deve chiedere chiarimenti"
  );

  assert(
    data.results.length === 4,
    `Attese 4 offerte MacBook Air M5, ricevute ${data.results.length}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      1399,
    `Prezzo MacBook Air M5 inatteso: ${data.bestOffer?.offer_price}`
  );
}


// ========================================
// TESTS
// ========================================

const tests = [
  {
    name:
      "PRODUCT_SEARCH — offerte equivalenti",

    run:
      testProductSearch,
  },

  {
    name:
      "BEST_OFFER — variante più economica",

    run:
      testBestOffer,
  },

  {
    name:
      "BEST_PRODUCT — ranking per famiglia",

    run:
      testBestProduct,
  },

  {
    name:
      "NATURAL QUERY — migliore telecamera + typo",

    run:
      testNaturalCameraQuery,
  },

  {
    name:
      "RECOMMENDATION — foto sotto 1000 €",

    run:
      testRecommendationBudget,
  },

  {
    name:
      "RECOMMENDATION — nessun laptop sotto 1000 €",

    run:
      testNoLaptopInBudget,
  },

  {
    name:
      "TRUST — source registry e negozi verificati",

    run:
      testTrustLayer,
  },

  {
    name:
      "OFFER CONTRACT — validazione dati",

    run:
      testOfferContract,
  },

  {
    name:
      "PRICING — offerte condizionate escluse dal ranking standard",

    run:
      testConditionalPricingRanking,
  },

  {
    name:
      "PRODUCT LINE — AirPods generici price-first",

    run:
      testAirPodsProductLine,
  },

  {
    name:
      "HARD REQUIREMENT — AirPods con ANC",

    run:
      testAirPodsAncRequirement,
  },

  {
    name:
      "FAMILY — AirPods 5 variante più economica",

    run:
      testAirPodsFamilyPriceFirst,
  },

  {
    name:
      "VARIANT — iPhone 17 colore flessibile",

    run:
      testIPhone17FlexibleColor,
  },

  {
    name:
      "VARIANT — iPhone 17 colore esplicito",

    run:
      testIPhone17ExplicitColor,
  },

  {
    name:
      "MULTI STORE — Galaxy S26 Ultra",

    run:
      testGalaxyS26UltraMultiStore,
  },

  {
    name:
      "VARIANT — MacBook Air M5 colore flessibile",

    run:
      testMacBookAirM5FlexibleColor,
  },
];


// ========================================
// RUNNER
// ========================================

async function main() {
  console.log(
    "\n🧪 DaniSua Smoke Tests"
  );

  console.log(
    "======================\n"
  );


  let passed = 0;

  let failed = 0;


  try {
    await startServerIfNeeded();
  } catch (error) {
    console.error(
      `❌ ${error.message}`
    );

    process.exitCode = 1;

    return;
  }


  console.log("");


  for (
    const test of tests
  ) {
    try {
      await test.run();

      passed += 1;

      console.log(
        `✅ ${test.name}`
      );
    } catch (error) {
      failed += 1;

      console.log(
        `❌ ${test.name}`
      );

      console.log(
        `   ${error.message}`
      );
    }
  }


  console.log(
    "\n======================"
  );

  console.log(
    `✅ ${passed} test superati`
  );

  console.log(
    `❌ ${failed} test falliti`
  );

  console.log(
    "======================\n"
  );


  if (failed > 0) {
    process.exitCode = 1;
  }


  stopTemporaryServer();
}


main()
  .catch(
    error => {
      console.error(
        error
      );

      stopTemporaryServer();

      process.exitCode = 1;
    }
  );