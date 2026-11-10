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
  filterBetaEligibleOffers,
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
      null,
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
    {
      store: "Comet",
      url: "https://www.comet.it/smartphone-e-telefonia/",
      expectedStoreId: "comet-it",
    },
    {
      store: "Expert",
      url: "https://www.expert.it/it/it/exp/shop/",
      expectedStoreId: "expert-it",
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
      3,
    `Attesi 3 prezzi Galaxy S26 White, ricevuti ${data.results.length}`
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
    `Attesi 3 listing verificati Pixel 11, ricevuti ${data.results.length}`
  );

  assert(
    data.results.every(
      offer =>
        offer.id !==
        "test-euronics-pixel11-256-obsidian-pickup"
    ),
    "Il listing Euronics con seller Dimo non verificato deve essere escluso"
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
      "test-euronics-iphone17e-256-white",
    `Miglior iPhone 17e inatteso: ${iphone17e.bestOffer?.id}`
  );

  assert(
    iphone17e.recommendation?.finalCost === 736.9,
    `Costo finale iPhone 17e inatteso: ${iphone17e.recommendation?.finalCost}`
  );

  const iphone16 =
    await search(
      "iPhone 16 128 GB Nero"
    );

  assert(
    iphone16.results.length === 4,
    `Attesi 4 prezzi iPhone 16 Nero, ricevuti ${iphone16.results.length}`
  );

  assert(
    iphone16.bestOffer?.id ===
      "test-comet-iphone16-128-black",
    `Miglior iPhone 16 inatteso: ${iphone16.bestOffer?.id}`
  );

  assert(
    iphone16.recommendation?.finalCost === null,
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
    pixel.results.length === 4,
    `Attesi 4 prezzi Pixel 10a, ricevuti ${pixel.results.length}`
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
    redmi.results.length === 5,
    `Attesi 5 prezzi REDMI Note 17 5G, ricevuti ${redmi.results.length}`
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
// TRUST — SELLER IDENTITY ON RETAILER SITES
// ========================================

async function testRetailerThirdPartySellerGuard() {
  const cases = [
    { store: "MediaWorld", seller: "Beatrix20" },
    { store: "Unieuro", seller: "Unknown Seller" },
    { store: "Samsung", seller: "External Vendor" },
    { store: "Euronics", seller: null },
  ];

  for (const item of cases) {
    const offer = {
      ...item,
      id: "unverified-seller",
      offer_price: 100,
      url: "https://www.mediaworld.it/it/product/example",
    };
    const trust = evaluateOfferTrust(offer);
    assert(
      trust.knownStore === true &&
      trust.verifiedStore === true &&
      trust.betaEligible === false &&
      trust.directSeller === false &&
      trust.reason === "seller_requires_verification",
      `Seller terzo non bloccato: ${item.store} / ${item.seller}`
    );
    assert(
      filterBetaEligibleOffers([offer]).length === 0,
      `Offerta terza idonea alla beta: ${item.store}`
    );
  }

  for (const store of ["MediaWorld", "Unieuro", "Samsung", "Euronics"]) {
    const offer = {
      store,
      seller: store,
      url: "https://www.mediaworld.it/it/product/example",
    };
    const trust = evaluateOfferTrust(offer);
    assert(
      trust.betaEligible === true &&
      trust.directSeller === true,
      `Venditore diretto bloccato: ${store}`
    );
  }
}


// ========================================
// SMARTPHONE BATCH 3 — FIVE FAMILIES
// ========================================

async function testSmartphoneBatch3FiveFamilies() {
  const cases = [
    {
      query: "Galaxy A37 5G 128 GB Awesome Lavender",
      familyId: "samsung-galaxy-a37",
      expectedOffers: 1,
      expectedBest: "test-euronics-a37-128-lavender",
      expectedFinalCost: 342.9,
    },
    {
      query: "Xiaomi 17T 256 GB Blue",
      familyId: "xiaomi-17t",
      expectedOffers: 3,
      expectedBest: "test-euronics-xiaomi17t-256-blue",
      expectedFinalCost: 531.9,
    },
    {
      query: "REDMI Note 17 Pro 5G 256 GB Black",
      familyId: "redmi-note-17-pro-5g",
      expectedOffers: 5,
      expectedBest: "test-mediaworld-redminote17pro-5g-256-black",
      expectedFinalCost: 374.98,
    },
    {
      query: "Galaxy S26 FE 256 GB Graphite",
      familyId: "samsung-galaxy-s26-fe",
      expectedOffers: 3,
      expectedBest: "test-mediaworld-s26fe-256-graphite",
      expectedFinalCost: null,
    },
    {
      query: "Pixel 11 Pro 256 GB Nero Ossidiana",
      familyId: "google-pixel-11-pro",
      expectedOffers: 3,
      expectedBest: "test-mediaworld-pixel11pro-256-obsidian",
      expectedFinalCost: 1002.99,
    },
  ];

  for (const item of cases) {
    const data = await search(item.query);

    assert(
      [
        "specific",
        "family_price_ready",
      ].includes(
        data.status
      ),
      `${item.familyId}: status inatteso ${data.status}`
    );

    assert(
      data.results.length === item.expectedOffers,
      `${item.familyId}: attese ${item.expectedOffers} offerte, ricevute ${data.results.length}`
    );

    assert(
      data.bestOffer?.familyId === item.familyId,
      `${item.familyId}: famiglia bestOffer inattesa ${data.bestOffer?.familyId}`
    );

    assert(
      data.bestOffer?.id === item.expectedBest,
      `${item.familyId}: bestOffer inattesa ${data.bestOffer?.id}`
    );

    assert(
      data.recommendation?.finalCost === item.expectedFinalCost,
      `${item.familyId}: finalCost inatteso ${data.recommendation?.finalCost}`
    );
  }
}


// ========================================
// SMARTPHONE BATCH 4 — PREMIUM BREADTH
// ========================================

async function testSmartphoneBatch4PremiumBreadth() {
  const cases = [
    {
      query: "iPhone Air 256 GB Nero Siderale",
      familyId: "apple-iphone-air",
      expectedOffers: 3,
      expectedBest: "test-comet-iphone-air-256-black",
      expectedFinalCost: null,
    },
    {
      query: "Galaxy S26+ 256 GB",
      familyId: "samsung-galaxy-s26-plus",
      expectedOffers: 3,
      expectedBest: "test-euronics-s26plus-256-cobalt-violet",
      expectedFinalCost: 1176.9,
    },
    {
      query: "Pixel 11 Pro XL 256 GB Nero Ossidiana",
      familyId: "google-pixel-11-pro-xl",
      expectedOffers: 1,
      expectedBest: "test-euronics-pixel11proxl-256-obsidian",
      expectedFinalCost: null,
    },
    {
      query: "Xiaomi 17T Pro 256 GB",
      familyId: "xiaomi-17t-pro",
      expectedOffers: 1,
      expectedBest: "test-xiaomi-17tpro-256",
      expectedFinalCost: null,
    },
    {
      query: "REDMI Note 17 Pro Max 5G 256 GB Black",
      familyId: "redmi-note-17-pro-max-5g",
      expectedOffers: 1,
      expectedBest: "test-xiaomi-redminote17promax-5g-256-black",
      expectedFinalCost: null,
    },
  ];

  for (const item of cases) {
    const data = await search(item.query);

    assert(
      [
        "specific",
        "best_offer_ready",
        "family_price_ready",
      ].includes(
        data.status
      ),
      `${item.familyId}: status inatteso ${data.status}`
    );

    assert(
      data.results.length === item.expectedOffers,
      `${item.familyId}: attese ${item.expectedOffers} offerte verificate, ricevute ${data.results.length}`
    );

    assert(
      data.bestOffer?.familyId === item.familyId,
      `${item.familyId}: famiglia inattesa ${data.bestOffer?.familyId}`
    );

    assert(
      data.bestOffer?.id === item.expectedBest,
      `${item.familyId}: bestOffer inattesa ${data.bestOffer?.id}`
    );

    assert(
      data.recommendation?.finalCost === item.expectedFinalCost,
      `${item.familyId}: finalCost inatteso ${data.recommendation?.finalCost}`
    );
  }
}


// ========================================
// SMARTPHONE BATCH 5 — FLAGSHIPS + FOLDABLES
// ========================================

async function testSmartphoneBatch5FlagshipsFoldables() {
  const cases = [
    {
      query: "iPhone 18 Pro Max 256 GB Nero",
      familyId: "apple-iphone-18-pro-max",
      expectedOffers: 1,
      expectedBest: "test-apple-iphone18promax-256-black",
      expectedFinalCost: 1639,
    },
    {
      query: "iPhone Duo 256 GB Bianco Stellare",
      familyId: "apple-iphone-duo",
      expectedOffers: 1,
      expectedBest: "test-apple-iphoneduo-256-starlight",
      expectedFinalCost: 2369,
    },
    {
      query: "Galaxy Z Fold8 256 GB Graphite",
      familyId: "samsung-galaxy-z-fold8",
      expectedOffers: 1,
      expectedBest: "test-samsung-fold8-256-graphite",
      expectedFinalCost: 2099,
    },
    {
      query: "Galaxy Z Flip8 256 GB Graphite",
      familyId: "samsung-galaxy-z-flip8",
      expectedOffers: 1,
      expectedBest: "test-samsung-flip8-256-graphite",
      expectedFinalCost: 1379,
    },
    {
      query: "Xiaomi 17 Ultra 512 GB Black",
      familyId: "xiaomi-17-ultra",
      expectedOffers: 2,
      expectedBest: "test-xiaomi-17ultra-512-black-standard",
      expectedFinalCost: null,
    },
  ];

  for (const item of cases) {
    const data = await search(item.query);

    assert(
      ["specific", "best_offer_ready"].includes(data.status),
      `${item.familyId}: status inatteso ${data.status}`
    );

    assert(
      data.results.length === item.expectedOffers,
      `${item.familyId}: attese ${item.expectedOffers} offerte, ricevute ${data.results.length}`
    );

    assert(
      data.bestOffer?.familyId === item.familyId,
      `${item.familyId}: famiglia inattesa ${data.bestOffer?.familyId}`
    );

    assert(
      data.bestOffer?.id === item.expectedBest,
      `${item.familyId}: bestOffer inattesa ${data.bestOffer?.id}`
    );

    assert(
      data.recommendation?.finalCost === item.expectedFinalCost,
      `${item.familyId}: finalCost inatteso ${data.recommendation?.finalCost}`
    );
  }

  const xiaomi =
    await search(
      "Xiaomi 17 Ultra 512 GB Black"
    );

  assert(
    xiaomi.results.some(
      offer =>
        offer.id ===
          "test-xiaomi-17ultra-512-black-bf" &&
        offer.pricing?.conditional === true
    ),
    "La promo Xiaomi 17 Ultra con Mi Account deve restare esplicitamente condizionata"
  );

  assert(
    xiaomi.bestOffer?.id !==
      "test-xiaomi-17ultra-512-black-bf",
    "La promo condizionata Xiaomi non deve vincere il ranking standard"
  );
}


// ========================================
// SMARTPHONE FINAL TARGET — FIVE FAMILIES
// ========================================

async function testSmartphoneFinalTargetFive() {
  const cases = [
    {
      query: "HONOR Magic8 Pro 512 GB",
      familyId: "honor-magic8-pro",
      expectedOffers: 1,
      expectedBest: "test-honor-magic8pro-512",
      expectedFinalCost: 1099.9,
    },
    {
      query: "HONOR Magic8 Lite 256 GB Black",
      familyId: "honor-magic8-lite",
      expectedOffers: 3,
      expectedBest: "test-mediaworld-magic8lite-256-black",
      expectedFinalCost: 317.48,
    },
    {
      query: "HONOR 600 Pro 512 GB",
      familyId: "honor-600-pro",
      expectedOffers: 1,
      expectedBest: "test-honor-600pro-512",
      expectedFinalCost: null,
    },
    {
      query: "OPPO Find X10 256 GB Mist Grey",
      familyId: "oppo-find-x10",
      expectedOffers: 3,
      expectedBest: "test-unieuro-findx10-256-mistgrey",
      expectedFinalCost: null,
    },
    {
      query: "OPPO Reno16 Pro 5G 512 GB Pop White",
      familyId: "oppo-reno16-pro-5g",
      expectedOffers: 1,
      expectedBest: "test-euronics-reno16pro-512-popwhite",
      expectedFinalCost: 1007.89,
    },
  ];

  for (const item of cases) {
    const data = await search(item.query);

    assert(
      [
        "specific",
        "best_offer_ready",
        "family_price_ready",
      ].includes(data.status),
      `${item.familyId}: status inatteso ${data.status}`
    );

    assert(
      data.results.length === item.expectedOffers,
      `${item.familyId}: attese ${item.expectedOffers} offerte, ricevute ${data.results.length}`
    );

    assert(
      data.bestOffer?.familyId === item.familyId,
      `${item.familyId}: famiglia inattesa ${data.bestOffer?.familyId}`
    );

    assert(
      data.bestOffer?.id === item.expectedBest,
      `${item.familyId}: bestOffer inattesa ${data.bestOffer?.id}`
    );

    assert(
      data.recommendation?.finalCost === item.expectedFinalCost,
      `${item.familyId}: finalCost inatteso ${data.recommendation?.finalCost}`
    );
  }
}


// ========================================
// BETA CORE DEPTH — WAVE 1
// ========================================

async function testBetaCoreDepthWaveOne() {
  const cases = [
    {
      query: "iPhone 17 256 GB Nero",
      stores: ["Apple", "MediaWorld", "Unieuro", "Euronics"],
    },
    {
      query: "iPhone 17e 256 GB",
      stores: ["Apple", "Euronics", "Unieuro", "MediaWorld"],
    },
    {
      query: "Galaxy A57 5G 256 GB",
      stores: ["Samsung", "MediaWorld", "Euronics", "Unieuro"],
    },
    {
      query: "Pixel 10a 128 GB",
      stores: ["Euronics", "Unieuro", "MediaWorld", "Google Store"],
    },
    {
      query: "REDMI Note 17 5G 256 GB Black",
      stores: ["Xiaomi", "MediaWorld", "Unieuro", "Euronics"],
    },
    {
      query: "Pixel 11 Pro 256 GB Nero Ossidiana",
      stores: ["Google Store", "MediaWorld", "Euronics"],
    },
  ];

  for (const item of cases) {
    const data = await search(item.query);
    const stores =
      new Set(
        data.results.map(
          offer => offer.store
        )
      );

    for (const store of item.stores) {
      assert(
        stores.has(store),
        `${item.query}: manca lo store ${store}`
      );
    }
  }
}


// ========================================
// BETA CORE DEPTH — WAVE 2
// ========================================

async function testBetaCoreDepthWaveTwo() {
  const cases = [
    {
      query: "Galaxy S26 Ultra 256 GB",
      stores: ["Samsung", "MediaWorld", "Euronics", "Unieuro"],
    },
    {
      query: "Galaxy S26 256 GB",
      stores: ["Samsung", "MediaWorld", "Euronics", "Unieuro"],
    },
    {
      query: "Galaxy S26 FE 256 GB Graphite",
      stores: ["Samsung", "Euronics", "MediaWorld"],
    },
    {
      query: "Pixel 11 256 GB Nero Ossidiana",
      stores: ["MediaWorld", "Unieuro", "Google Store"],
    },
    {
      query: "iPhone 16 128 GB Nero",
      stores: ["Apple", "Euronics", "MediaWorld"],
    },
    {
      query: "Galaxy S26+ 256 GB",
      stores: ["Samsung", "Euronics"],
    },
  ];

  for (const item of cases) {
    const data = await search(item.query);
    const stores =
      new Set(
        data.results.map(
          offer => offer.store
        )
      );

    for (const store of item.stores) {
      assert(
        stores.has(store),
        `${item.query}: manca lo store ${store}`
      );
    }
  }
}


// ========================================
// BETA CORE DEPTH — WAVE 3
// ========================================

async function testBetaCoreDepthWaveThree() {
  const cases = [
    {
      query: "iPhone 16 128 GB Nero",
      stores: ["Apple", "Euronics", "MediaWorld", "Comet"],
    },
    {
      query: "Galaxy S26+ 256 GB",
      stores: ["Samsung", "Euronics", "Expert"],
    },
    {
      query: "OPPO Find X10 256 GB Mist Grey",
      stores: ["MediaWorld", "Euronics", "Unieuro"],
    },
  ];

  for (const item of cases) {
    const data = await search(item.query);
    const stores =
      new Set(
        data.results.map(
          offer => offer.store
        )
      );

    for (const store of item.stores) {
      assert(
        stores.has(store),
        `${item.query}: manca lo store ${store}`
      );
    }
  }
}


// ========================================
// BETA CORE DEPTH — WAVE 4
// ========================================

async function testBetaCoreDepthWaveFour() {
  const cases = [
    {
      query: "iPhone 18 Pro 256 GB Nero",
      stores: ["Apple", "Euronics", "Unieuro", "Comet"],
    },
    {
      query: "iPhone Air 256 GB Nero Siderale",
      stores: ["Apple", "Euronics", "Comet"],
    },
    {
      query: "Galaxy A37 5G 128 GB",
      stores: ["Euronics", "Comet", "Expert"],
    },
    {
      query: "Xiaomi 17T Pro",
      stores: ["Xiaomi", "MediaWorld", "Expert"],
    },
    {
      query: "Xiaomi 17T 256 GB",
      stores: ["Xiaomi", "Euronics", "MediaWorld", "Expert"],
    },
    {
      query: "REDMI Note 17 Pro 5G 256 GB Black",
      stores: ["Xiaomi", "Euronics", "MediaWorld", "Expert"],
    },
    {
      query: "HONOR Magic8 Lite 256 GB",
      stores: ["MediaWorld", "Euronics", "Expert"],
    },
  ];

  for (const item of cases) {
    const data = await search(item.query);
    const stores =
      new Set(
        data.results.map(
          offer => offer.store
        )
      );

    for (const store of item.stores) {
      assert(
        stores.has(store),
        `${item.query}: manca lo store ${store}`
      );
    }
  }
}


// ========================================
// PRICE-SHAPING VARIANTS — STORAGE DEPTH
// ========================================

async function testPriceShapingVariantDepth() {
  const iphone17Family =
    await search(
      "iPhone 17 più economico"
    );

  assert(
    iphone17Family
      .recommendation
      ?.selectedVariant
      ?.storage === "256 GB",
    `iPhone 17 generico deve scegliere la capacità più economica: ${iphone17Family.recommendation?.selectedVariant?.storage}`
  );

  assert(
    iphone17Family
      .variantCoverage
      ?.complete === true &&
    iphone17Family
      .recommendation
      ?.comparisonCompleteness ===
        "complete",
    "iPhone 17 coverage inattesa: " +
      JSON.stringify({
        variantCoverage:
          iphone17Family.variantCoverage,
        completeness:
          iphone17Family
            .recommendation
            ?.comparisonCompleteness,
        storages:
          iphone17Family.results
            ?.map(
              offer =>
                offer.storage
            ),
      })
  );

  const iphone17_512 =
    await search(
      "iPhone 17 512 GB più economico"
    );

  assert(
    iphone17_512
      .recommendation
      ?.selectedVariant
      ?.storage === "512 GB",
    `iPhone 17 512 deve restare vincolato a 512 GB: ${iphone17_512.recommendation?.selectedVariant?.storage}`
  );

  assert(
    iphone17_512.results.length > 0 &&
    iphone17_512.results.every(
      offer =>
        offer.storage === "512 GB"
    ),
    "La ricerca iPhone 17 512 GB non deve includere altre capacità"
  );

  const iphone16Family =
    await search(
      "iPhone 16 più economico"
    );

  assert(
    iphone16Family
      .recommendation
      ?.selectedVariant
      ?.storage === "128 GB",
    `iPhone 16 generico deve poter scegliere 128 GB: ${iphone16Family.recommendation?.selectedVariant?.storage}`
  );

  assert(
    iphone16Family
      .variantCoverage
      ?.complete === false &&
    iphone16Family
      .variantCoverage
      ?.missingStorages
      ?.includes("512 GB") &&
    iphone16Family
      .recommendation
      ?.comparisonCompleteness ===
        "partial",
    "iPhone 16 deve dichiarare confronto parziale finché manca il prezzo 512 GB"
  );

  const iphone16_256 =
    await search(
      "iPhone 16 256 GB più economico"
    );

  assert(
    iphone16_256
      .recommendation
      ?.selectedVariant
      ?.storage === "256 GB",
    `iPhone 16 256 deve restare vincolato a 256 GB: ${iphone16_256.recommendation?.selectedVariant?.storage}`
  );

  assert(
    iphone16_256.results.length > 0 &&
    iphone16_256.results.every(
      offer =>
        offer.storage === "256 GB"
    ),
    "La ricerca iPhone 16 256 GB non deve includere altre capacità"
  );
}


// ========================================
// PRICE-SHAPING CONFIGURATIONS — RAM + STORAGE
// ========================================

async function testPriceShapingRamStorageDepth() {
  const ultra =
    await search(
      "Galaxy S26 Ultra più economico"
    );

  assert(
    ultra
      .variantCoverage
      ?.complete === true &&
    ultra
      .variantCoverage
      ?.requiredConfigurationLabels
      ?.length === 3,
    "Galaxy S26 Ultra deve coprire 12+256, 12+512 e 16+1TB"
  );

  assert(
    ultra
      .recommendation
      ?.selectedVariant
      ?.storage === "256 GB",
    `Galaxy S26 Ultra più economico inatteso: ${ultra.recommendation?.selectedVariant?.storage}`
  );

  const s26fe =
    await search(
      "Galaxy S26 FE più economico"
    );

  assert(
    s26fe
      .variantCoverage
      ?.complete === true,
    "Galaxy S26 FE deve avere copertura completa 8+128 / 8+256"
  );

  assert(
    s26fe
      .recommendation
      ?.selectedVariant
      ?.storage === "256 GB",
    "DaniSua deve poter scegliere 256 GB quando l'offerta reale costa meno della 128 GB"
  );

  const redmi =
    await search(
      "REDMI Note 17 5G più economico"
    );

  assert(
    redmi
      .variantCoverage
      ?.complete === false &&
    redmi
      .variantCoverage
      ?.missingConfigurationLabels
      ?.includes(
        "8 GB + 256 GB"
      ),
    "REDMI Note 17 5G deve restare parziale finché 8+256 ha solo prezzo condizionato"
  );

  const redmi512 =
    await search(
      "REDMI Note 17 Pro 5G 512 GB più economico"
    );

  assert(
    redmi512
      .variantCoverage
      ?.constraints
      ?.storage === "512 GB" &&
    !redmi512
      .variantCoverage
      ?.constraints
      ?.ram,
    "512 GB non deve essere interpretato per errore come RAM 12 GB"
  );

  assert(
    redmi512
      .variantCoverage
      ?.requiredConfigurationLabels
      ?.length === 1 &&
    redmi512
      .variantCoverage
      ?.requiredConfigurationLabels
      ?.[0] ===
        "8 GB + 512 GB",
    "La ricerca 512 GB deve restringere la configurazione a 8 GB + 512 GB"
  );

  assert(
    redmi512.results.length > 0 &&
    redmi512.results.every(
      offer =>
        offer.storage ===
          "512 GB"
    ),
    "La ricerca REDMI 512 GB non deve mischiare altri tagli"
  );

  const a57 =
    await search(
      "Galaxy A57 più economico"
    );

  assert(
    a57
      .variantCoverage
      ?.complete === true,
    "Galaxy A57 deve coprire 8+128 e 8+256"
  );

  const pixel11 =
    await search(
      "Pixel 11 più economico"
    );

  assert(
    pixel11
      .variantCoverage
      ?.comparisonComplete === true &&
    pixel11
      .variantCoverage
      ?.marketComplete === true,
    "Pixel 11 deve essere completo dopo l'aggiunta del prezzo 512 GB verificato"
  );
}


// ========================================
// VARIANT MARKET COVERAGE — COMPLETE KNOWLEDGE
// ========================================

async function testVariantMarketCoverageCompleteKnowledge() {
  const iphone16 =
    await search(
      "iPhone 16 più economico"
    );

  assert(
    iphone16
      .variantCoverage
      ?.marketComplete === true &&
    iphone16
      .variantCoverage
      ?.comparisonComplete === false &&
    iphone16
      .variantCoverage
      ?.marketStateRecords
      ?.some(
        record =>
          record.status ===
            "no_verified_direct_offer" &&
          record.configuration
            ?.storage ===
            "512 GB"
      ),
    "iPhone 16 deve conoscere il mercato 512 GB senza inventare un prezzo comparabile"
  );

  const redmi =
    await search(
      "REDMI Note 17 Pro 5G più economico"
    );

  assert(
    redmi
      .variantCoverage
      ?.marketComplete === true &&
    redmi
      .variantCoverage
      ?.comparisonComplete === false &&
    redmi
      .variantCoverage
      ?.conditionalOnlyConfigurationLabels
      ?.includes(
        "12 GB + 256 GB"
      ) &&
    redmi
      .variantCoverage
      ?.conditionalOnlyConfigurationLabels
      ?.includes(
        "8 GB + 512 GB"
      ),
    "REDMI Note 17 Pro deve distinguere promo condizionate da prezzi standard"
  );

  const a37 =
    await search(
      "Galaxy A37 più economico"
    );

  assert(
    a37
      .variantCoverage
      ?.marketComplete === true &&
    a37
      .variantCoverage
      ?.comparisonComplete === true,
    "Galaxy A37 deve essere completo sia nel mercato sia nel confronto"
  );

  const pixelPro =
    await search(
      "Pixel 11 Pro più economico"
    );

  assert(
    pixelPro
      .variantCoverage
      ?.marketComplete === true &&
    pixelPro
      .variantCoverage
      ?.comparisonComplete === true,
    "Pixel 11 Pro deve coprire 256/512/1TB con prezzi standard"
  );

  const pixelProXL =
    await search(
      "Pixel 11 Pro XL più economico"
    );

  assert(
    pixelProXL
      .variantCoverage
      ?.marketComplete === true &&
    pixelProXL
      .variantCoverage
      ?.comparisonComplete === false &&
    pixelProXL
      .variantCoverage
      ?.marketStateRecords
      ?.some(
        record =>
          record.configuration
            ?.storage ===
            "1 TB"
      ),
    "Pixel 11 Pro XL deve conoscere lo stato 1TB anche senza prezzo standard verificato"
  );
}


// ========================================
// REMAINING SMARTPHONE FAMILIES — VARIANT DEPTH
// ========================================

async function testRemainingSmartphoneVariantDepth() {
  const cases = [
    {
      query: "iPhone 18 Pro più economico",
      required: ["256 GB", "512 GB", "1 TB", "2 TB"],
      expectedStorage: "256 GB",
    },
    {
      query: "iPhone 18 Pro Max più economico",
      required: ["256 GB", "512 GB", "1 TB", "2 TB"],
      expectedStorage: "256 GB",
    },
    {
      query: "iPhone Duo più economico",
      required: ["256 GB", "512 GB", "1 TB", "2 TB"],
      expectedStorage: "256 GB",
    },
    {
      query: "iPhone Air più economico",
      required: ["256 GB", "512 GB", "1 TB"],
      expectedStorage: "256 GB",
    },
    {
      query: "iPhone 17e più economico",
      required: ["256 GB", "512 GB"],
      expectedStorage: "256 GB",
    },
    {
      query: "Galaxy Z Fold8 più economico",
      required: ["12 GB + 256 GB", "12 GB + 512 GB", "16 GB + 1 TB"],
      expectedStorage: "256 GB",
    },
    {
      query: "Galaxy Z Flip8 più economico",
      required: ["12 GB + 256 GB", "12 GB + 512 GB"],
      expectedStorage: "512 GB",
    },
    {
      query: "HONOR Magic8 Pro più economico",
      required: ["16 GB + 512 GB"],
      expectedStorage: "512 GB",
    },
    {
      query: "HONOR 600 Pro più economico",
      required: ["12 GB + 512 GB"],
      expectedStorage: "512 GB",
    },
    {
      query: "OPPO Find X10 più economico",
      required: ["12 GB + 256 GB", "12 GB + 512 GB"],
      expectedStorage: "256 GB",
    },
    {
      query: "OPPO Reno16 Pro 5G più economico",
      required: ["12 GB + 512 GB"],
      expectedStorage: "512 GB",
    },
  ];

  for (const item of cases) {
    const data =
      await search(
        item.query
      );

    assert(
      data.variantCoverage
        ?.marketComplete ===
        true &&
      data.variantCoverage
        ?.comparisonComplete ===
        true,
      item.query +
        ": variant depth non completo " +
        JSON.stringify(
          data.variantCoverage
        )
    );

    assert(
      JSON.stringify(
        data.variantCoverage
          ?.requiredConfigurationLabels
      ) ===
      JSON.stringify(
        item.required
      ),
      item.query +
        ": configurazioni inattese " +
        JSON.stringify(
          data.variantCoverage
            ?.requiredConfigurationLabels
        )
    );

    assert(
      data.recommendation
        ?.selectedVariant
        ?.storage ===
        item.expectedStorage,
      item.query +
        ": storage selezionato inatteso " +
        data.recommendation
          ?.selectedVariant
          ?.storage
    );
  }

  const fold1tb =
    await search(
      "Galaxy Z Fold8 1 TB più economico"
    );

  assert(
    fold1tb.results.length > 0 &&
    fold1tb.results.every(
      offer =>
        offer.storage === "1 TB" &&
        offer.ram === "16 GB"
    ),
    "Galaxy Z Fold8 1 TB deve restare vincolato a 16 GB + 1 TB"
  );
}


// ========================================
// SEARCH UX — REAL USER SCENARIOS
// ========================================

async function testRealUserSearchScenarios() {
  const scenarios = [
    {
      id: "exact-galaxy-512",
      query: "Galaxy S26 Ultra 512 GB",
      check(data) {
        return (
          data.canRecommend === true &&
          data.bestOffer?.familyId ===
            "samsung-galaxy-s26-ultra" &&
          data.bestOffer?.storage ===
            "512 GB"
        );
      },
      expected:
        "Galaxy S26 Ultra 512 GB exacto",
    },
    {
      id: "iphone17-cheapest",
      query: "iPhone 17 più economico",
      check(data) {
        return (
          data.canRecommend === true &&
          data.bestOffer?.familyId ===
            "apple-iphone-17"
        );
      },
      expected:
        "iPhone 17 con mejor oferta válida",
    },
    {
      id: "camera-under-600",
      query:
        "smartphone per foto sotto 600 euro",
      check(data) {
        const objectives =
          data.context?.objectives || [];

        const budgetOkay =
          data.recommendation
            ?.finalCostConfirmed === true
            ? data.recommendation
                ?.finalCost <= 600
            : data.bestOffer
                ?.offer_price <= 600;

        return (
          data.canRecommend === true &&
          objectives.some(
            item =>
              item.criterion ===
                "camera"
          ) &&
          budgetOkay
        );
      },
      expected:
        "recomendación cámara dentro de 600 €",
    },
    {
      id: "camera-battery-under-800",
      query:
        "telefono con ottima fotocamera e buona batteria sotto 800 euro",
      check(data) {
        const criteria =
          (data.context?.objectives || [])
            .map(
              item =>
                item.criterion
            );

        const budgetOkay =
          data.recommendation
            ?.finalCostConfirmed === true
            ? data.recommendation
                ?.finalCost <= 800
            : data.bestOffer
                ?.offer_price <= 800;

        return (
          data.canRecommend === true &&
          criteria.includes("camera") &&
          criteria.includes("battery") &&
          budgetOkay
        );
      },
      expected:
        "multi-criterio cámara+batería dentro de 800 €",
    },
    {
      id: "samsung-battery",
      query:
        "voglio un Samsung con buona batteria",
      check(data) {
        if (
          data.canRecommend === true
        ) {
          return (
            data.bestOffer?.brand ===
              "Samsung"
          );
        }

        return (
          data.status ===
            "knowledge_insufficient" &&
          Array.isArray(
            data.results
          ) &&
          data.results.length > 0 &&
          data.results.every(
            offer =>
              offer.brand ===
                "Samsung"
          )
        );
      },
      expected:
        "Samsung respetado; recomendación si hay datos o aviso honesto si faltan",
    },
    {
      id: "cheap-but-good",
      query:
        "telefono economico ma buono",
      check(data) {
        return (
          data.status !==
            "unsupported_intent" &&
          (
            data.canRecommend ===
              true ||
            data.clarification
              ?.needed === true ||
            (
              data.status ===
                "knowledge_insufficient" &&
              Array.isArray(
                data.results
              ) &&
              data.results.length > 0
            )
          )
        );
      },
      expected:
        "respuesta útil; no inventar calidad si faltan datos comparables",
    },
    {
      id: "iphone-space-under-1000",
      query:
        "voglio un iPhone con molto spazio sotto 1000 euro",
      check(data) {
        return (
          data.canRecommend === false &&
          data.clarification
            ?.needed === true &&
          data.clarification
            ?.missing
            ?.includes(
              "storage"
            )
        );
      },
      expected:
        "aclaración de capacidad antes de adivinar cuánto es 'mucho espacio'",
    },
    {
      id: "pixel-vs-galaxy-camera",
      query:
        "Pixel 11 o Galaxy S26 per foto",
      check(data) {
        return (
          data.canRecommend === false &&
          data.clarification
            ?.needed === true &&
          data.clarification
            ?.missing
            ?.includes(
              "comparison"
            )
        );
      },
      expected:
        "manejo explícito y seguro de comparación entre dos familias",
    },
    {
      id: "gaming-under-800",
      query:
        "smartphone per gaming sotto 800 euro",
      check(data) {
        const objectives =
          data.context?.objectives || [];

        const budgetOkay =
          data.recommendation
            ?.finalCostConfirmed === true
            ? data.recommendation
                ?.finalCost <= 800
            : data.bestOffer
                ?.offer_price <= 800;

        return (
          data.canRecommend === true &&
          objectives.some(
            item =>
              item.criterion ===
                "performance"
          ) &&
          budgetOkay
        );
      },
      expected:
        "gaming → performance dentro de 800 €",
    },
    {
      id: "typo-samsung",
      query:
        "samsng con buona baterria sotto 500 euro",
      check(data) {
        return (
          data.status !==
            "unsupported_intent" &&
          (
            data.canRecommend ===
              true ||
            data.clarification
              ?.needed === true ||
            data.status ===
              "not_found"
          )
        );
      },
      expected:
        "degradación segura ante typo",
    },
    {
      id: "android-not-iphone",
      query:
        "non voglio iPhone, voglio Android con buona batteria sotto 700 euro",
      check(data) {
        if (
          data.canRecommend !== true
        ) {
          return false;
        }

        return (
          data.bestOffer?.brand !==
            "Apple" &&
          (
            data.recommendation
              ?.finalCostConfirmed ===
                true
              ? data.recommendation
                  ?.finalCost <= 700
              : data.bestOffer
                  ?.offer_price <= 700
          )
        );
      },
      expected:
        "exclusión iPhone + Android + batería + presupuesto",
    },
    {
      id: "refurbished-iphone",
      query:
        "iPhone 15 ricondizionato sotto 500 euro",
      check(data) {
        if (
          data.canRecommend === true
        ) {
          return (
            data.bestOffer
              ?.condition ===
              "refurbished"
          );
        }

        return (
          data.status ===
            "not_found" ||
          data.clarification
            ?.needed === true
        );
      },
      expected:
        "no mezclar nuevo con reacondicionado",
    },
  ];

  const failures = [];

  for (const scenario of scenarios) {
    const data =
      await search(
        scenario.query
      );

    const summary = {
      id:
        scenario.id,
      query:
        scenario.query,
      intent:
        data.intent,
      productQuery:
        data.productQuery ||
        null,
      status:
        data.status,
      canRecommend:
        data.canRecommend,
      clarification:
        data.clarification
          ?.needed === true,
      familyId:
        data.bestOffer
          ?.familyId ||
        null,
      productId:
        data.bestOffer
          ?.productId ||
        null,
      brand:
        data.bestOffer
          ?.brand ||
        null,
      model:
        data.bestOffer
          ?.model ||
        null,
      storage:
        data.bestOffer
          ?.storage ||
        null,
      condition:
        data.bestOffer
          ?.condition ||
        null,
      offerPrice:
        data.bestOffer
          ?.offer_price ??
        null,
      finalCost:
        data.recommendation
          ?.finalCost ??
        null,
      finalCostConfirmed:
        data.recommendation
          ?.finalCostConfirmed ===
        true,
      objectives:
        (
          data.context
            ?.objectives ||
          []
        )
          .map(
            item =>
              item.criterion
          ),
      budget:
        data.context?.budget ??
        null,
      recommendationReason:
        data.recommendation
          ?.reason ||
        null,
    };

    console.log(
      "UX_SCENARIO " +
      JSON.stringify(summary)
    );

    let passed = false;

    try {
      passed =
        scenario.check(data) ===
        true;
    } catch {
      passed = false;
    }

    if (!passed) {
      failures.push(
        {
          id:
            scenario.id,
          expected:
            scenario.expected,
          summary,
        }
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      "Scenari UX falliti: " +
      JSON.stringify(
        failures
      )
    );
  }
}


// ========================================
// PRODUCT KNOWLEDGE — SAMSUNG BATTERY
// ========================================

async function testSamsungBatteryKnowledge() {
  const data =
    await search(
      "voglio un Samsung con buona batteria"
    );

  assert(
    data.intent ===
      "RECOMMENDATION",
    `RECOMMENDATION atteso, ricevuto ${data.intent}`
  );

  assert(
    data.canRecommend === true &&
    data.status ===
      "best_product_ready",
    `Samsung batteria deve essere raccomandabile: ${data.status}`
  );

  assert(
    data.bestOffer
      ?.brand ===
      "Samsung",
    "La raccomandazione batteria deve restare Samsung"
  );

  assert(
    data.recommendation
      ?.usedCriteria
      ?.includes(
        "battery"
      ),
    "Il criterio batteria deve guidare la raccomandazione"
  );

  assert(
    data.ranking
      ?.ranked
      ?.length > 0,
    "Ranking Samsung batteria mancante"
  );

  const topScore =
    data.ranking
      ?.ranked?.[0]
      ?.score;

  assert(
    typeof topScore ===
      "number",
    "Score batteria Samsung mancante"
  );
}


// ========================================
// PRODUCT KNOWLEDGE — EU BATTERY WAVE 2
// ========================================

async function testEuBatteryKnowledgeWave2() {
  const iphone =
    await search(
      "voglio un iPhone con buona batteria"
    );

  assert(
    iphone.canRecommend === true &&
    iphone.status ===
      "best_product_ready",
    `iPhone batteria deve essere raccomandabile: ${iphone.status}`
  );

  assert(
    iphone.bestOffer
      ?.familyId ===
      "apple-iphone-18-pro-max",
    `iPhone batteria atteso 18 Pro Max, ricevuto ${iphone.bestOffer?.familyId}`
  );

  assert(
    iphone.recommendation
      ?.usedCriteria
      ?.includes(
        "battery"
      ),
    "Il ranking iPhone deve usare batteria"
  );

  const pixel =
    await search(
      "voglio un Pixel con buona batteria"
    );

  assert(
    pixel.canRecommend === true &&
    pixel.status ===
      "best_product_ready",
    `Pixel batteria deve essere raccomandabile: ${pixel.status}`
  );

  assert(
    pixel.bestOffer
      ?.familyId ===
      "google-pixel-10a",
    `Pixel batteria atteso Pixel 10a, ricevuto ${pixel.bestOffer?.familyId}`
  );

  assert(
    pixel.recommendation
      ?.usedCriteria
      ?.includes(
        "battery"
      ),
    "Il ranking Pixel deve usare batteria"
  );
}


// ========================================
// TESTS
// ========================================

const tests = [
  {
    name:
      "KNOWLEDGE — EU battery Apple + Google",

    run:
      testEuBatteryKnowledgeWave2,
  },


  {
    name:
      "KNOWLEDGE — Samsung battery recommendation",

    run:
      testSamsungBatteryKnowledge,
  },


  {
    name:
      "SEARCH UX — real user scenarios",

    run:
      testRealUserSearchScenarios,
  },


  {
    name:
      "REMAINING SMARTPHONES — variant depth complete",

    run:
      testRemainingSmartphoneVariantDepth,
  },


  {
    name:
      "VARIANT MARKET COVERAGE — complete knowledge",

    run:
      testVariantMarketCoverageCompleteKnowledge,
  },


  {
    name:
      "PRICE-SHAPING CONFIGURATIONS — RAM + storage",

    run:
      testPriceShapingRamStorageDepth,
  },


  {
    name:
      "PRICE-SHAPING VARIANTS — storage depth",

    run:
      testPriceShapingVariantDepth,
  },


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
      "TRUST — seller identity retailer guard",

    run:
      testRetailerThirdPartySellerGuard,
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
      "BETA CORE DEPTH — wave 4",

    run:
      testBetaCoreDepthWaveFour,
  },

  {
    name:
      "BETA CORE DEPTH — wave 3",

    run:
      testBetaCoreDepthWaveThree,
  },

  {
    name:
      "BETA CORE DEPTH — wave 2",

    run:
      testBetaCoreDepthWaveTwo,
  },

  {
    name:
      "BETA CORE DEPTH — wave 1",

    run:
      testBetaCoreDepthWaveOne,
  },

  {
    name:
      "SMARTPHONE FINAL TARGET — five families",

    run:
      testSmartphoneFinalTargetFive,
  },

  {
    name:
      "SMARTPHONE BATCH 5 — flagships + foldables",

    run:
      testSmartphoneBatch5FlagshipsFoldables,
  },

  {
    name:
      "SMARTPHONE BATCH 4 — premium breadth",

    run:
      testSmartphoneBatch4PremiumBreadth,
  },

  {
    name:
      "SMARTPHONE BATCH 3 — five families",

    run:
      testSmartphoneBatch3FiveFamilies,
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