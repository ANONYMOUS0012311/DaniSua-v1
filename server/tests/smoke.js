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
  getKnownFinalCost,
  getOfferSelection,
  normalizeCriterionScores,
} = require("../utils/rankProducts");

const {
  evaluateOfferFreshness,
} = require("../utils/freshness");

const {
  importFeedContent,
} = require("../ingestion/feedImporter");

const {
  evaluateOfferTrust,
} = require("../utils/trustPolicy");


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
      "apple-iphone-16",
    `Famiglia attesa apple-iphone-16, ricevuta ${data.bestOffer?.familyId}`
  );

  assert(
    data.recommendation
      ?.finalCost ===
      974.9,
    `Costo finale iPhone 16 inatteso: ${data.recommendation?.finalCost}`
  );

  assert(
    data.recommendation
      ?.confidence ===
      "medium",
    `Confidenza inattesa: ${data.recommendation?.confidence}`
  );

  assert(
    data.recommendation
      ?.rankingEvidence
      ?.some(
        item =>
          item.criterion ===
            "camera" &&
          item.score === 147 &&
          item.protocol ===
            "DXOMARK Camera v5" &&
          item.sourceName ===
            "DXOMARK"
      ),
    "La raccomandazione deve spiegare lo score camera comparabile usato nel ranking"
  );

  assert(
    data.recommendation
      ?.verifiedFacts
      ?.some(
        item =>
          item.key ===
            "camera" &&
          item.value ===
            "48 MP" &&
          item.usedForRanking ===
            false
      ),
    "I fatti del produttore devono essere separati dai dati usati nel ranking"
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
// LAPTOP SOTTO 1000 — DATI INSUFFICIENTI
// ========================================

async function testLaptopUnder1000KnowledgeInsufficient() {
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
      "knowledge_insufficient",
    `Status atteso knowledge_insufficient, ricevuto ${data.status}`
  );


  assert(
    data.canRecommend ===
      false,
    `canRecommend atteso false, ricevuto ${data.canRecommend}`
  );


  assert(
    !data.bestOffer,
    "Non dovrebbe esserci una bestOffer senza dati comparabili sufficienti"
  );


  const compatibleOffers =
    Array.isArray(
      data.results
    )
      ? data.results
      : [];


  assert(
    compatibleOffers.some(
      offer =>
        offer.productId ===
          "apple-macbook-neo-13-a18pro-8-256-indigo" &&
        offer.offer_price <=
          1000
    ),
    "MacBook Neo sotto 1000 € dovrebbe essere riconosciuto come compatibile"
  );


  assert(
    String(
      data.clarification
        ?.message ||
      ""
    ).includes(
      "dati verificati sufficienti"
    ),
    "La risposta deve spiegare che mancano dati verificati sufficienti"
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
      989.49,
    `Prezzo Salvia inatteso: ${data.bestOffer?.offer_price}`
  );

  assert(
    data.bestOffer
      ?.shipping_price ===
      3.99,
    `Spedizione Salvia inattesa: ${data.bestOffer?.shipping_price}`
  );

  assert(
    data.recommendation
      ?.finalCost ===
      993.48,
    `Costo finale Salvia inatteso: ${data.recommendation?.finalCost}`
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
      1199.49,
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
// TEST 16
// SONY WH-1000XM6
// ========================================


async function testSonyXM6() {
  const data =
    await search(
      "WH-1000XM6"
    );

  assert(
    data.canRecommend === true,
    "WH-1000XM6 deve essere raccomandabile"
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-sony-wh1000xm6-olive-gray",
    `Offerta WH-1000XM6 inattesa: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      379,
    `Prezzo WH-1000XM6 inatteso: ${data.bestOffer?.offer_price}`
  );

  assert(
    data.bestOffer
      ?.shipping_price ===
      0,
    "Sony deve usare la spedizione gratuita verificata dello store ufficiale"
  );

  assert(
    data.recommendation
      ?.finalCost ===
      379,
    `Costo finale Sony inatteso: ${data.recommendation?.finalCost}`
  );
}

// ========================================
// TEST 17
// IPAD AIR M4 — MULTI STORE + TABLET
// ========================================


async function testIPadAirM4() {
  const data =
    await search(
      "iPad Air 11 M4 128 GB Grigio Siderale"
    );

  assert(
    data.context
      ?.category ===
      "tablet",
    `Categoria iPad inattesa: ${data.context?.category}`
  );

  assert(
    data.results.length ===
      2,
    `Attese 2 offerte iPad Air, ricevute ${data.results.length}`
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-mediaworld-ipad-air-m4-128-space-gray",
    `Migliore offerta iPad inattesa: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      769,
    `Prezzo iPad inatteso: ${data.bestOffer?.offer_price}`
  );

  assert(
    data.bestOffer
      ?.shipping_price ===
      4.99,
    `Spedizione iPad inattesa: ${data.bestOffer?.shipping_price}`
  );

  assert(
    data.recommendation
      ?.finalCost ===
      773.99,
    `Costo finale iPad inatteso: ${data.recommendation?.finalCost}`
  );
}

// ========================================
// TEST 18
// MACBOOK NEO — MULTI STORE
// ========================================


async function testMacBookNeo() {
  const data =
    await search(
      "MacBook Neo 13 A18 Pro 8 GB 256 GB Indaco"
    );

  assert(
    data.canRecommend === true,
    "MacBook Neo deve essere raccomandabile"
  );

  assert(
    data.results.length ===
      2,
    `Attese 2 offerte MacBook Neo, ricevute ${data.results.length}`
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-apple-macbook-neo-indigo-256",
    `Il costo finale deve favorire Apple: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      799,
    `Prezzo MacBook Neo inatteso: ${data.bestOffer?.offer_price}`
  );

  assert(
    data.recommendation
      ?.finalCost ===
      799,
    `Costo finale MacBook Neo inatteso: ${data.recommendation?.finalCost}`
  );
}

// ========================================
// TEST 19
// SWITCH 2 — BASE PRIMA DEL BUNDLE
// ========================================


async function testSwitch2PriceFirst() {
  const data =
    await search(
      "Nintendo Switch 2"
    );

  assert(
    data.context
      ?.category ===
      "consola",
    `Categoria Switch inattesa: ${data.context?.category}`
  );

  assert(
    data.status ===
      "family_price_ready",
    `Status Switch 2 inatteso: ${data.status}`
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-mediaworld-switch2-base",
    `Variante Switch 2 inattesa: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      499,
    `Prezzo Switch 2 inatteso: ${data.bestOffer?.offer_price}`
  );

  assert(
    data.bestOffer
      ?.shipping_price ===
      null,
    "La spedizione della Switch 2 base deve restare sconosciuta"
  );

  assert(
    data.recommendation
      ?.finalCost ===
      null,
    "La Switch 2 base non deve dichiarare costo finale senza spedizione verificata"
  );
}

// ========================================
// TEST 20
// SWITCH 2 — BUNDLE ESATTO
// ========================================


async function testSwitch2MarioKartBundle() {
  const data =
    await search(
      "Nintendo Switch 2 Mario Kart World"
    );

  assert(
    data.canRecommend === true,
    "Bundle Switch 2 Mario Kart deve essere raccomandabile"
  );

  assert(
    data.results.length ===
      1,
    `Attesa 1 offerta bundle, ricevute ${data.results.length}`
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-mediaworld-switch2-mario-kart",
    `Bundle Switch 2 inatteso: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.offer_price ===
      519,
    `Prezzo bundle Switch 2 inatteso: ${data.bestOffer?.offer_price}`
  );

  assert(
    data.bestOffer
      ?.shipping_price ===
      4.99,
    `Spedizione bundle Switch 2 inattesa: ${data.bestOffer?.shipping_price}`
  );

  assert(
    data.recommendation
      ?.finalCost ===
      523.99,
    `Costo finale bundle Switch 2 inatteso: ${data.recommendation?.finalCost}`
  );
}

// ========================================
// TEST 21
// COSTO FINALE — SPEDIZIONE CAMBIA IL VINCITORE
// ========================================

async function testFinalCostCanChangeWinner() {
  assert(
    getKnownFinalCost({
      offer_price: 100,
      shipping_price: 5,
      pricing: {
        conditional: false,
      },
    }) === 105,
    "getKnownFinalCost dovrebbe sommare prezzo e spedizione"
  );


  const selection =
    getOfferSelection([
      {
        id: "cheap-sticker-expensive-shipping",
        offer_price: 100,
        shipping_price: 20,
        pricing: {
          conditional: false,
        },
      },
      {
        id: "higher-sticker-free-shipping",
        offer_price: 110,
        shipping_price: 0,
        pricing: {
          conditional: false,
        },
      },
    ]);

  assert(
    selection.bestOffer?.id ===
      "higher-sticker-free-shipping",
    `Il costo finale dovrebbe cambiare il vincitore: ${selection.bestOffer?.id}`
  );

  assert(
    selection.finalCost === 110,
    `Costo finale atteso 110, ricevuto ${selection.finalCost}`
  );

  assert(
    selection.confirmedFinalCost ===
      true,
    "Il costo finale dovrebbe essere confermato"
  );
}


// ========================================
// TEST 22
// SPEDIZIONE SCONOSCIUTA — RISULTATO PROVVISORIO
// ========================================

async function testUnknownShippingIsProvisional() {
  const selection =
    getOfferSelection([
      {
        id: "known-total",
        offer_price: 100,
        shipping_price: 0,
        pricing: {
          conditional: false,
        },
      },
      {
        id: "unknown-shipping",
        offer_price: 90,
        shipping_price: null,
        pricing: {
          conditional: false,
        },
      },
    ]);

  assert(
    selection.bestOffer?.id ===
      "unknown-shipping",
    `Il prezzo base più basso dovrebbe restare candidato provvisorio: ${selection.bestOffer?.id}`
  );

  assert(
    selection.confirmedFinalCost ===
      false,
    "Una spedizione sconosciuta non deve produrre un costo finale confermato"
  );

  assert(
    selection.finalCost === null,
    `Il costo finale dovrebbe essere null, ricevuto ${selection.finalCost}`
  );

  assert(
    selection.mode ===
      "listed_price_provisional",
    `Modalità provvisoria inattesa: ${selection.mode}`
  );
}


// ========================================
// TEST 23
// VINCITORE GARANTITO CON SPEDIZIONE SCONOSCIUTA ALTROVE
// ========================================

async function testKnownFinalCostCanStillBeGuaranteed() {
  const selection =
    getOfferSelection([
      {
        id: "known-winner",
        offer_price: 100,
        shipping_price: 5,
        pricing: {
          conditional: false,
        },
      },
      {
        id: "unknown-but-higher-base",
        offer_price: 120,
        shipping_price: null,
        pricing: {
          conditional: false,
        },
      },
    ]);

  assert(
    selection.bestOffer?.id ===
      "known-winner",
    `Vincitore finale inatteso: ${selection.bestOffer?.id}`
  );

  assert(
    selection.finalCost === 105,
    `Costo finale atteso 105, ricevuto ${selection.finalCost}`
  );

  assert(
    selection.confirmedFinalCost ===
      true,
    "Il vincitore dovrebbe essere matematicamente garantito"
  );

  assert(
    selection.mode ===
      "final_cost_confirmed_with_unknown_shipping",
    `Modalità finale inattesa: ${selection.mode}`
  );
}


// ========================================
// TEST 24
// GALAXY S26 ULTRA — COSTO FINALE REALE
// ========================================

async function testGalaxyFinalCostMetadata() {
  const data =
    await search(
      "Galaxy S26 Ultra 256 GB White"
    );

  assert(
    data.bestOffer
      ?.id ===
      "test-mediaworld-s26ultra-256-white",
    `Migliore offerta Galaxy inattesa: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.costComparison
      ?.confirmedFinalCost ===
      true,
    "Il Galaxy MediaWorld dovrebbe avere un costo finale confermato"
  );

  assert(
    data.bestOffer
      ?.costComparison
      ?.finalCost ===
      1203.48,
    `Costo finale Galaxy inatteso: ${data.bestOffer?.costComparison?.finalCost}`
  );

  assert(
    data.recommendation
      ?.finalCost ===
      1203.48,
    `Costo finale recommendation inatteso: ${data.recommendation?.finalCost}`
  );
}


// ========================================
// TEST 25
// IPAD AIR — COSTO FINALE VERIFICATO
// ========================================


async function testIPadUnknownShippingIsHonest() {
  const data =
    await search(
      "iPad Air 11 M4 128 GB Grigio Siderale"
    );

  assert(
    data.bestOffer
      ?.id ===
      "test-mediaworld-ipad-air-m4-128-space-gray",
    `Offerta iPad inattesa: ${data.bestOffer?.id}`
  );

  assert(
    data.bestOffer
      ?.costComparison
      ?.confirmedFinalCost ===
      true,
    "L'iPad MediaWorld deve avere costo finale confermato con spedizione verificata"
  );

  assert(
    data.recommendation
      ?.finalCost ===
      773.99,
    `Il costo finale iPad dovrebbe essere 773.99, ricevuto ${data.recommendation?.finalCost}`
  );

  assert(
    data.recommendation
      ?.shippingPrice ===
      4.99,
    `La spedizione iPad dovrebbe essere 4.99, ricevuto ${data.recommendation?.shippingPrice}`
  );
}

// ========================================
// TEST 26
// FRESHNESS — STALE NON VINCE
// ========================================

async function testFreshnessGuard() {
  const now =
    Date.parse(
      "2026-11-04T12:00:00Z"
    );

  const fresh =
    evaluateOfferFreshness(
      {
        verifiedAt:
          "2026-11-04T10:00:00Z",
      },
      {
        now,
        maxAgeHours: 72,
        allowUnknown: false,
      }
    );

  const stale =
    evaluateOfferFreshness(
      {
        verifiedAt:
          "2026-10-30T10:00:00Z",
      },
      {
        now,
        maxAgeHours: 72,
        allowUnknown: false,
      }
    );

  const unknown =
    evaluateOfferFreshness(
      {},
      {
        now,
        maxAgeHours: 72,
        allowUnknown: false,
      }
    );

  assert(
    fresh.status === "fresh" &&
    fresh.eligibleForRecommendation === true,
    "Un'offerta recente dovrebbe essere fresh"
  );

  assert(
    stale.status === "stale" &&
    stale.eligibleForRecommendation === false,
    "Un'offerta vecchia dovrebbe essere stale e non raccomandabile"
  );

  assert(
    unknown.status === "unknown" &&
    unknown.eligibleForRecommendation === false,
    "In produzione una data sconosciuta non deve essere raccomandabile"
  );

  const selection =
    getOfferSelection([
      {
        id: "stale-cheap",
        offer_price: 50,
        shipping_price: 0,
        pricing: {
          conditional: false,
        },
        freshness: stale,
      },
      {
        id: "fresh-expensive",
        offer_price: 60,
        shipping_price: 0,
        pricing: {
          conditional: false,
        },
        freshness: fresh,
      },
    ]);

  assert(
    selection.bestOffer?.id ===
      "fresh-expensive",
    `L'offerta stale non deve vincere: ${selection.bestOffer?.id}`
  );
}


// ========================================
// TEST 27
// FEED JSON — MATCH ESATTO
// ========================================

async function testFeedImporterExactMatch() {
  const content =
    JSON.stringify([
      {
        id:
          "feed-airpods5",
        productId:
          "apple-airpods-5-usbc",
        title:
          "Apple AirPods 5",
        store:
          "Apple",
        seller:
          "Apple",
        price:
          "149,00 €",
        currency:
          "EUR",
        shipping:
          "0",
        stock:
          "disponibile",
        url:
          "https://www.apple.com/it/shop/buy-airpods/airpods-5",
        verified_at:
          "2026-11-04T10:00:00Z",
      },
    ]);

  const result =
    importFeedContent({
      content,
      format: "json",
      sourceName:
        "partner-test",
      betaOnly: true,
    });

  assert(
    result.ready.length === 1,
    `Feed esatto dovrebbe produrre 1 ready, ricevuti ${result.ready.length}`
  );

  assert(
    result.needsReview.length === 0,
    "Feed esatto non dovrebbe richiedere review"
  );

  assert(
    result.ready[0]
      ?.productId ===
      "apple-airpods-5-usbc",
    `Product match feed inatteso: ${result.ready[0]?.productId}`
  );

  assert(
    result.ready[0]
      ?.offer_price ===
      149,
    `Prezzo feed normalizzato inatteso: ${result.ready[0]?.offer_price}`
  );
}


// ========================================
// TEST 28
// FEED CSV — VARIANTE AMBIGUA IN REVIEW
// ========================================

async function testFeedImporterAmbiguousVariant() {
  const content = [
    "id,title,brand,model,storage,store,seller,price,currency,stock,url,verified_at",
    "feed-iphone17,Apple iPhone 17 256 GB,Apple,iPhone 17,256 GB,MediaWorld,MediaWorld,989.49,EUR,true,https://www.mediaworld.it/it/product/_apple-iphone-17-256gb-nero-389194.html,2026-11-04T10:00:00Z",
  ].join("\n");

  const result =
    importFeedContent({
      content,
      format: "csv",
      sourceName:
        "partner-test",
      betaOnly: true,
    });

  assert(
    result.ready.length === 0,
    "Una variante senza colore non deve essere associata automaticamente"
  );

  assert(
    result.needsReview.length === 1,
    `Variante ambigua dovrebbe andare in review, ricevute ${result.needsReview.length}`
  );

  assert(
    result.needsReview[0]
      ?.match
      ?.reason ===
      "variant_not_disambiguated" ||
    result.needsReview[0]
      ?.match
      ?.reason ===
      "multiple_variant_candidates",
    `Motivo review inatteso: ${result.needsReview[0]?.match?.reason}`
  );
}


// ========================================
// TEST 29
// REQUEST ID + HEALTH
// ========================================

async function testRequestTracing() {
  const response =
    await fetch(
      `${BASE_URL}/health`
    );

  assert(
    response.ok,
    `Health HTTP inatteso: ${response.status}`
  );

  const requestId =
    response.headers.get(
      "x-request-id"
    );

  assert(
    typeof requestId ===
      "string" &&
    requestId.length > 0,
    "X-Request-Id mancante"
  );

  const data =
    await response.json();

  assert(
    data.requestId ===
      requestId,
    "requestId body/header non coincidono"
  );

  assert(
    typeof data.runtime
      ?.uptimeSeconds ===
      "number",
    "Runtime health mancante"
  );
}


// ========================================
// TEST 30
// 404 SAFE
// ========================================

async function testSafeNotFound() {
  const response =
    await fetch(
      `${BASE_URL}/route-that-does-not-exist`
    );

  assert(
    response.status === 404,
    `404 atteso, ricevuto ${response.status}`
  );

  const requestId =
    response.headers.get(
      "x-request-id"
    );

  const data =
    await response.json();

  assert(
    data.error ===
      "Risorsa non trovata.",
    `Messaggio 404 inatteso: ${data.error}`
  );

  assert(
    data.requestId ===
      requestId,
    "404 deve includere lo stesso requestId"
  );

  assert(
    !Object.prototype
      .hasOwnProperty
      .call(
        data,
        "details"
      ),
    "404 non deve esporre details"
  );
}


// ========================================
// TEST 31
// CORS ERROR SAFE
// ========================================

async function testSafeCorsError() {
  const response =
    await fetch(
      `${BASE_URL}/health`,
      {
        headers: {
          Origin:
            "https://evil.example",
        },
      }
    );

  assert(
    response.status === 403,
    `CORS dovrebbe restituire 403, ricevuto ${response.status}`
  );

  const data =
    await response.json();

  assert(
    data.error ===
      "Richiesta non autorizzata.",
    `Messaggio CORS inatteso: ${data.error}`
  );

  assert(
    typeof data.requestId ===
      "string" &&
    data.requestId.length > 0,
    "Errore CORS deve includere requestId"
  );

  assert(
    !Object.prototype
      .hasOwnProperty
      .call(
        data,
        "details"
      ),
    "Errore CORS non deve esporre details"
  );
}


// ========================================
// SEARCH V2 — INTENTO NATURALE
// ========================================

async function testNaturalNeedDoesNotAskForModel() {
  const cases = [
    {
      query:
        "smartphone per foto",
      expectedIntent:
        "RECOMMENDATION",
      expectedProductQuery:
        "smartphone",
    },
    {
      query:
        "portatile per università",
      expectedIntent:
        "RECOMMENDATION",
      expectedProductQuery:
        "portatil",
    },
    {
      query:
        "smartphone sotto 1000 euro",
      expectedIntent:
        "RECOMMENDATION",
      expectedProductQuery:
        "smartphone",
    },
  ];

  for (const item of cases) {
    const data =
      await search(
        item.query
      );

    assert(
      data.intent ===
        item.expectedIntent,
      `Intent inatteso per "${item.query}": ${data.intent}`
    );

    assert(
      String(
        data.productQuery || ""
      ).toLowerCase() ===
        item.expectedProductQuery,
      `productQuery inattesa per "${item.query}": ${data.productQuery}`
    );

    assert(
      data.clarification
        ?.missing
        ?.includes(
          "model"
        ) !== true,
      `DaniSua non deve chiedere il modello per "${item.query}"`
    );
  }
}


async function testExactPriceSearchStillUsesBestOffer() {
  const data =
    await search(
      "iPhone 15 Pro più economico"
    );

  assert(
    data.intent ===
      "BEST_OFFER",
    `BEST_OFFER atteso per prodotto specifico, ricevuto ${data.intent}`
  );

  assert(
    String(
      data.productQuery || ""
    ).toLowerCase()
      .includes(
        "iphone 15 pro"
      ),
    `La ricerca specifica deve preservare il prodotto: ${data.productQuery}`
  );
}


// ========================================
// TRUST — NUOVI STORE UFFICIALI
// ========================================

async function testOfficialSmartphoneStoresTrust() {
  const cases = [
    {
      store: "Google Store",
      url: "https://store.google.com/it/category/phones?hl=it",
      expectedStoreId: "google-store-it",
    },
    {
      store: "Xiaomi",
      url: "https://www.mi.com/it/",
      expectedStoreId: "xiaomi-it",
    },
    {
      store: "HONOR",
      url: "https://www.honor.com/it/phones/",
      expectedStoreId: "honor-it",
    },
    {
      store: "OPPO",
      url: "https://www.oppo.com/it/smartphones/",
      expectedStoreId: "oppo-it",
    },
    {
      store: "Euronics",
      url: "https://www.euronics.it/telefonia/smartphone-e-cellulari/",
      expectedStoreId: "euronics-it",
    },
  ];

  for (const item of cases) {
    const trust =
      evaluateOfferTrust({
        store: item.store,
        seller: item.store,
        url: item.url,
      });

    assert(
      trust.knownStore === true &&
      trust.verifiedStore === true &&
      trust.betaEligible === true,
      `Store ufficiale non idoneo alla beta: ${item.store}`
    );

    assert(
      trust.storeId ===
        item.expectedStoreId,
      `Store ID inatteso per ${item.store}: ${trust.storeId}`
    );

    assert(
      trust.directSeller === true,
      `${item.store} dovrebbe essere venditore diretto`
    );
  }
}


// ========================================
// P0 PRODUCTION — GALAXY S26
// ========================================

async function testGalaxyS26ProductionIngest() {
  const data =
    await search(
      "Galaxy S26 256 GB White"
    );

  assert(
    data.status ===
      "specific",
    `Galaxy S26 dovrebbe essere specific, ricevuto ${data.status}`
  );

  assert(
    data.results.length ===
      2,
    `Attesi 2 prezzi Galaxy S26, ricevuti ${data.results.length}`
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-mediaworld-s26-256-white",
    `Miglior prezzo Galaxy S26 inatteso: ${data.bestOffer?.id}`
  );

  assert(
    data.recommendation
      ?.finalCost ===
      852.99,
    `Costo finale Galaxy S26 inatteso: ${data.recommendation?.finalCost}`
  );
}


// ========================================
// P0 PRODUCTION — PIXEL 11
// ========================================

async function testPixel11ProductionIngest() {
  const data =
    await search(
      "Pixel 11 256 GB Nero Ossidiana"
    );

  assert(
    data.status ===
      "specific",
    `Pixel 11 dovrebbe essere specific, ricevuto ${data.status}`
  );

  assert(
    data.results.length ===
      3,
    `Attesi 3 listing Pixel 11, ricevuti ${data.results.length}`
  );

  assert(
    data.results.some(
      offer =>
        offer.id ===
        "test-euronics-pixel11-256-obsidian-pickup" &&
        offer.pricing
          ?.conditional ===
        true
    ),
    "Il prezzo Euronics deve restare condizionato"
  );

  assert(
    data.bestOffer
      ?.id ===
      "test-unieuro-pixel11-256-obsidian",
    `Miglior prezzo provvisorio Pixel 11 inatteso: ${data.bestOffer?.id}`
  );

  assert(
    data.recommendation
      ?.finalCost ===
      null,
    "Pixel 11 non deve dichiarare un costo finale finché la spedizione Unieuro è sconosciuta"
  );

  assert(
    data.bestOffer
      ?.costComparison
      ?.mode ===
      "listed_price_provisional",
    `Modalità Pixel 11 inattesa: ${data.bestOffer?.costComparison?.mode}`
  );
}


// ========================================
// MIDRANGE SMARTPHONE PRODUCTION
// ========================================

async function testMidrangeSmartphoneProductionBlock() {
  const iphone17e =
    await search(
      "iPhone 17e 256 GB Bianco"
    );

  assert(
    iphone17e.context
      ?.hardRequirements
      ?.anc !== true,
    "Il colore Bianco non deve essere interpretato come requisito ANC"
  );

  assert(
    iphone17e.results.length === 3,
    `Attesi 3 prezzi iPhone 17e, ricevuti ${iphone17e.results.length}`
  );

  assert(
    iphone17e.bestOffer?.id ===
      "test-apple-iphone17e-256-white",
    `Miglior iPhone 17e inatteso: ${iphone17e.bestOffer?.id}`
  );

  assert(
    iphone17e.recommendation?.finalCost === 729,
    `Costo finale iPhone 17e inatteso: ${iphone17e.recommendation?.finalCost}`
  );

  const iphone16 =
    await search(
      "iPhone 16 128 GB Nero"
    );

  assert(
    iphone16.results.length === 2,
    `Attesi 2 prezzi iPhone 16, ricevuti ${iphone16.results.length}`
  );

  assert(
    iphone16.bestOffer?.id ===
      "test-euronics-iphone16-128-black",
    `Miglior iPhone 16 inatteso: ${iphone16.bestOffer?.id}`
  );

  assert(
    iphone16.recommendation?.finalCost === 974.9,
    `Costo finale iPhone 16 inatteso: ${iphone16.recommendation?.finalCost}`
  );

  const a57 =
    await search(
      "Galaxy A57 5G 256 GB Awesome Gray"
    );

  assert(
    a57.results.length === 3,
    `Attesi 3 prezzi A57, ricevuti ${a57.results.length}`
  );

  assert(
    a57.bestOffer?.id ===
      "test-mediaworld-a57-256-gray",
    `Miglior A57 inatteso: ${a57.bestOffer?.id}`
  );

  assert(
    a57.recommendation?.finalCost === 483.98,
    `Costo finale A57 inatteso: ${a57.recommendation?.finalCost}`
  );

  const pixel =
    await search(
      "Pixel 10a 128 GB"
    );

  assert(
    pixel.results.length === 3,
    `Attesi 3 prezzi Pixel 10a, ricevuti ${pixel.results.length}`
  );

  assert(
    pixel.bestOffer?.id ===
      "test-unieuro-pixel10a-128-obsidian",
    `Miglior Pixel 10a provvisorio inatteso: ${pixel.bestOffer?.id}`
  );

  assert(
    pixel.recommendation?.finalCost === null,
    "Pixel 10a non deve dichiarare un costo finale con spedizione Unieuro sconosciuta"
  );

  const redmi =
    await search(
      "REDMI Note 17 5G 256 GB Black"
    );

  assert(
    redmi.results.length === 3,
    `Attesi 3 prezzi REDMI Note 17 5G, ricevuti ${redmi.results.length}`
  );

  assert(
    redmi.bestOffer?.id ===
      "test-unieuro-redminote17-5g-256-black",
    `Miglior prezzo provvisorio REDMI Note 17 inatteso: ${redmi.bestOffer?.id}`
  );

  assert(
    redmi.recommendation?.finalCost === null,
    "REDMI Note 17 non deve dichiarare un costo finale con spedizione Unieuro sconosciuta"
  );

  assert(
    redmi.bestOffer
      ?.costComparison
      ?.mode ===
      "listed_price_provisional",
    `Modalità REDMI Note 17 inattesa: ${redmi.bestOffer?.costComparison?.mode}`
  );
}


// ========================================
// PRODUCT KNOWLEDGE — PROTOCOL SAFETY
// ========================================

async function testKnowledgeProtocolSafety() {
  const v5 = {
    productId:
      "camera-v5",
    familyId:
      "camera-v5",
    knowledge: {
      scores: {
        camera: 147,
      },
      scoreMeta: {
        camera: {
          protocol:
            "DXOMARK Camera v5",
        },
      },
      evidence: [],
    },
  };

  const v5b = {
    productId:
      "camera-v5-b",
    familyId:
      "camera-v5-b",
    knowledge: {
      scores: {
        camera: 145,
      },
      scoreMeta: {
        camera: {
          protocol:
            "DXOMARK Camera v5",
        },
      },
      evidence: [],
    },
  };

  const v6 = {
    productId:
      "camera-v6",
    familyId:
      "camera-v6",
    knowledge: {
      scores: {
        camera: 134,
      },
      scoreMeta: {
        camera: {
          protocol:
            "DXOMARK Camera v6",
        },
      },
      evidence: [],
    },
  };

  const sameProtocol =
    normalizeCriterionScores(
      [
        v5,
        v5b,
      ],
      "camera"
    );

  assert(
    sameProtocol.size === 2,
    "Score con lo stesso protocollo devono restare comparabili"
  );

  const mixedProtocol =
    normalizeCriterionScores(
      [
        v5,
        v6,
      ],
      "camera"
    );

  assert(
    mixedProtocol.size === 0,
    "DaniSua non deve normalizzare Camera v5 e Camera v6 sulla stessa scala"
  );

  const versionedAndUnknown =
    normalizeCriterionScores(
      [
        v5,
        {
          productId:
            "camera-unknown",
          familyId:
            "camera-unknown",
          knowledge: {
            scores: {
              camera: 150,
            },
            scoreMeta: {},
            evidence: [],
          },
        },
      ],
      "camera"
    );

  assert(
    versionedAndUnknown.size === 0,
    "Uno score versionato non deve essere confrontato con uno score senza protocollo"
  );
}


// ========================================
// EU BATTERY — STANDARDIZED RECOMMENDATION
// ========================================

async function testStandardizedBatteryRecommendation() {
  const data =
    await search(
      "smartphone con buona batteria sotto 400 euro"
    );

  assert(
    data.intent ===
      "RECOMMENDATION",
    `Intent batteria inatteso: ${data.intent}`
  );

  assert(
    data.canRecommend === true,
    "La richiesta batteria sotto 400 euro dovrebbe essere raccomandabile"
  );

  assert(
    data.bestOffer
      ?.familyId ===
      "redmi-note-17-5g",
    `Famiglia batteria attesa redmi-note-17-5g, ricevuta ${data.bestOffer?.familyId}`
  );

  assert(
    data.recommendation
      ?.rankingEvidence
      ?.some(
        item =>
          item.criterion ===
            "battery" &&
          item.score === 68 &&
          item.unit ===
            "h" &&
          item.protocol ===
            "EU 2023/1669 battery endurance per cycle (hours)"
      ),
    "La raccomandazione batteria deve usare l'autonomia UE standardizzata"
  );

  assert(
    data.recommendation
      ?.finalCost ===
      null,
    "Il costo finale REDMI deve restare provvisorio finché la spedizione Unieuro è sconosciuta"
  );

  assert(
    data.recommendation
      ?.message
      ?.includes(
        "batteria: 68 h"
      ),
    "La spiegazione deve mostrare l'autonomia standardizzata in ore"
  );
}


// ========================================
// SEARCH V2 — LINGUAGGIO NATURALE BATTERIA
// ========================================

async function testNaturalBatteryLanguage() {
  const cases = [
    "telefono che duri tutto il giorno sotto 400 euro",
    "smartphone che non voglio ricaricare continuamente sotto 400 euro",
    "telefono con molta batteria sotto 400 euro",
    "smartphone que dure todo el dia sotto 400 euro",
  ];

  for (const query of cases) {
    const data =
      await search(
        query
      );

    assert(
      data.intent ===
        "RECOMMENDATION",
      `Intent batteria naturale inatteso per "${query}": ${data.intent}`
    );

    assert(
      data.context
        ?.objectives
        ?.some(
          item =>
            item.criterion ===
              "battery"
        ),
      `Obiettivo batteria non rilevato per "${query}"`
    );

    assert(
      data.productQuery ===
        "smartphone",
      `La query di catalogo dovrebbe restare generica per "${query}", ricevuto ${data.productQuery}`
    );

    assert(
      data.bestOffer
        ?.familyId ===
        "redmi-note-17-5g",
      `Famiglia batteria inattesa per "${query}": ${data.bestOffer?.familyId}`
    );

    assert(
      data.recommendation
        ?.rankingEvidence
        ?.some(
          item =>
            item.criterion ===
              "battery" &&
            item.score === 68 &&
            item.unit === "h"
        ),
      `Evidenza batteria UE mancante per "${query}"`
    );
  }
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
      "RECOMMENDATION — laptop sotto 1000 € senza dati comparabili",

    run:
      testLaptopUnder1000KnowledgeInsufficient,
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

  {
    name:
      "AUDIO — Sony WH-1000XM6",

    run:
      testSonyXM6,
  },

  {
    name:
      "TABLET — iPad Air M4 multi-store",

    run:
      testIPadAirM4,
  },

  {
    name:
      "LAPTOP — MacBook Neo multi-store",

    run:
      testMacBookNeo,
  },

  {
    name:
      "GAMING — Switch 2 base price-first",

    run:
      testSwitch2PriceFirst,
  },

  {
    name:
      "GAMING — Switch 2 Mario Kart bundle",

    run:
      testSwitch2MarioKartBundle,
  },

  {
    name:
      "FINAL COST — spedizione cambia il vincitore",

    run:
      testFinalCostCanChangeWinner,
  },

  {
    name:
      "FINAL COST — spedizione sconosciuta resta provvisoria",

    run:
      testUnknownShippingIsProvisional,
  },

  {
    name:
      "FINAL COST — vincitore garantito con shipping parziale",

    run:
      testKnownFinalCostCanStillBeGuaranteed,
  },

  {
    name:
      "FINAL COST — Galaxy S26 Ultra metadata",

    run:
      testGalaxyFinalCostMetadata,
  },

  {
    name:
      "FINAL COST — iPad verified shipping",

    run:
      testIPadUnknownShippingIsHonest,
  },

  {
    name:
      "FRESHNESS — stale non può vincere",

    run:
      testFreshnessGuard,
  },

  {
    name:
      "FEED — JSON exact product match",

    run:
      testFeedImporterExactMatch,
  },

  {
    name:
      "FEED — CSV ambiguous variant review",

    run:
      testFeedImporterAmbiguousVariant,
  },

  {
    name:
      "OBSERVABILITY — request ID e health",

    run:
      testRequestTracing,
  },

  {
    name:
      "OBSERVABILITY — 404 safe",

    run:
      testSafeNotFound,
  },

  {
    name:
      "OBSERVABILITY — CORS error safe",

    run:
      testSafeCorsError,
  },

  {
    name:
      "SEARCH V2 — bisogno naturale senza modello",

    run:
      testNaturalNeedDoesNotAskForModel,
  },

  {
    name:
      "SEARCH V2 — prodotto specifico mantiene BEST_OFFER",

    run:
      testExactPriceSearchStillUsesBestOffer,
  },

  {
    name:
      "TRUST — store smartphone ufficiali",

    run:
      testOfficialSmartphoneStoresTrust,
  },

  {
    name:
      "P0 PRODUCTION — Galaxy S26",

    run:
      testGalaxyS26ProductionIngest,
  },

  {
    name:
      "P0 PRODUCTION — Pixel 11",

    run:
      testPixel11ProductionIngest,
  },

  {
    name:
      "MIDRANGE — smartphone production block",

    run:
      testMidrangeSmartphoneProductionBlock,
  },

  {
    name:
      "KNOWLEDGE — benchmark protocol safety",

    run:
      testKnowledgeProtocolSafety,
  },

  {
    name:
      "EU BATTERY — standardized recommendation",

    run:
      testStandardizedBatteryRecommendation,
  },

  {
    name:
      "SEARCH V2 — natural battery language",

    run:
      testNaturalBatteryLanguage,
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