const {
  spawn,
} = require("child_process");

const path =
  require("path");

const {
  validateOffer,
} = require("../utils/offerContract");


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