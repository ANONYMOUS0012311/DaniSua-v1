const express = require("express");
const cors = require("cors");

const sourceRegistry = require("./sources/registry");

const {
  getUniqueFamilies,
  getLowestOffer,
  getFamilyScore,
  rankByCriterion,
  rankByObjectives,
  rankQualityAndPrice,
} = require("./utils/rankProducts");

const {
  analyzeRecommendationNeed,
} = require("./utils/recommendationEngine");

const app = express();


// ========================================
// RUNTIME CONFIG
// ========================================

const PORT =
  Number(
    process.env.PORT
  ) ||
  3000;


const HOST =
  process.env.HOST ||
  "0.0.0.0";


// ========================================
// CORS
// ========================================

const DEFAULT_ALLOWED_ORIGINS = [
  "https://danisua.netlify.app",
];


const ENV_ALLOWED_ORIGINS =
  String(
    process.env.CORS_ORIGINS ||
    ""
  )
    .split(",")
    .map(
      origin =>
        origin.trim()
    )
    .filter(Boolean);


const ALLOWED_ORIGINS =
  new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...ENV_ALLOWED_ORIGINS,
  ]);


function isLocalDevelopmentOrigin(
  origin
) {
  if (!origin) {
    return false;
  }


  try {
    const url =
      new URL(origin);


    return (
      url.hostname ===
        "localhost" ||
      url.hostname ===
        "127.0.0.1"
    );

  } catch {
    return false;
  }
}


function isAllowedOrigin(
  origin
) {
  if (!origin) {
    return true;
  }


  if (
    ALLOWED_ORIGINS.has(
      origin
    )
  ) {
    return true;
  }


  if (
    process.env.NODE_ENV !==
      "production" &&
    isLocalDevelopmentOrigin(
      origin
    )
  ) {
    return true;
  }


  return false;
}


app.use(
  cors({
    origin:
      (
        origin,
        callback
      ) => {
        if (
          isAllowedOrigin(
            origin
          )
        ) {
          return callback(
            null,
            true
          );
        }


        return callback(
          new Error(
            "Origin not allowed by DaniSua CORS policy"
          )
        );
      },

    methods: [
      "GET",
      "POST",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);


app.use(
  express.json({
    limit:
      "1mb",
  })
);


// ========================================
// NORMALIZZAZIONE
// ========================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// ========================================
// VALORI UNICI
// ========================================

function uniqueValues(products, field) {
  return [
    ...new Set(
      products
        .map(product => product[field])
        .filter(Boolean)
        .map(String)
    ),
  ];
}


// ========================================
// QUERY CONTIENE VALORE?
// ========================================

function queryContains(query, value) {
  if (!query || !value) {
    return false;
  }

  return normalizeText(query).includes(
    normalizeText(value)
  );
}


function matchSpecificModels(
  query,
  models
) {
  const normalizedQuery =
    normalizeText(query);

  const exact =
    models.filter(
      model =>
        normalizedQuery ===
        normalizeText(model)
    );

  if (exact.length > 0) {
    return exact;
  }

  const partial =
    models.filter(
      model =>
        queryContains(
          query,
          model
        )
    );

  if (partial.length <= 1) {
    return partial;
  }

  const longest =
    Math.max(
      ...partial.map(
        model =>
          normalizeText(model).length
      )
    );

  return partial.filter(
    model =>
      normalizeText(model).length ===
      longest
  );
}


// ========================================
// OBIETTIVO PREZZO
// ========================================

function hasPriceObjective(query) {
  const q = normalizeText(query);

  const signals = [
    "piu economico",
    "piu economica",
    "meno caro",
    "meno cara",
    "prezzo piu basso",
    "miglior prezzo",
    "migliore prezzo",
    "migliore offerta",
    "offerta migliore",
    "piu conveniente",
    "offerta piu conveniente",
    "cheapest",
    "lowest price",
    "mas barato",
    "mejor oferta",
  ];

  return signals.some(
    signal => q.includes(signal)
  );
}


// ========================================
// CATEGORIA
// ========================================

function detectCategory(query) {
  const q = normalizeText(query);

  const categories = [
    {
      value: "smartphone",
      aliases: [
        "smartphone",
        "telefono",
        "telefoni",
        "cellulare",
        "cellulari",
      ],
    },

    {
      value: "auriculares",
      aliases: [
        "cuffie",
        "auricolari",
        "headphone",
        "headphones",
      ],
    },

    {
      value: "portatil",
      aliases: [
        "portatile",
        "portatili",
        "laptop",
        "notebook",
      ],
    },

    {
      value: "consola",
      aliases: [
        "console",
        "playstation",
        "ps5",
        "xbox",
      ],
    },
  ];

  for (const category of categories) {
    if (
      category.aliases.some(
        alias => q.includes(alias)
      )
    ) {
      return category.value;
    }
  }

  return null;
}


// ========================================
// OBIETTIVI QUALITÀ
// ========================================

function detectQualityObjectives(query) {
  const q = normalizeText(query);

  const rules = [
    {
      criterion: "camera",
      signals: [
        "fotocamera",
        "fotocamere",
        "camera",
        "foto",
        "fotografia",
        "fotografie",
      ],
    },

    {
      criterion: "battery",
      signals: [
        "batteria",
        "autonomia",
      ],
    },

    {
      criterion: "performance",
      signals: [
        "prestazioni",
        "performance",
        "potente",
        "potenza",
        "veloce",
        "velocita",
      ],
    },

    {
      criterion: "display",
      signals: [
        "display",
        "schermo",
      ],
    },

    {
      criterion: "software",
      signals: [
        "software",
        "aggiornamenti",
      ],
    },

    {
      criterion: "sound",
      signals: [
        "audio",
        "suono",
        "qualita audio",
      ],
    },

    {
      criterion: "anc",
      signals: [
        "anc",
        "cancellazione rumore",
        "cancellazione del rumore",
      ],
    },

    {
      criterion: "comfort",
      signals: [
        "comfort",
        "comode",
        "comodi",
        "comodita",
      ],
    },

    {
      criterion: "portability",
      signals: [
        "leggero",
        "leggera",
        "portabilita",
        "peso",
      ],
    },

    {
      criterion: "value",
      signals: [
        "qualita prezzo",
        "rapporto qualita prezzo",
      ],
    },
  ];

  const objectives = [];

  for (const rule of rules) {
    const found =
      rule.signals.some(
        signal => q.includes(signal)
      );

    if (found) {
      objectives.push({
        criterion: rule.criterion,
        weight: 1,
      });
    }
  }

  return objectives;
}


// ========================================
// INTENZIONE
// ========================================

function detectIntent(query) {
  const q = normalizeText(query);

  if (!q) {
    return "PRODUCT_SEARCH";
  }

  const priceObjective =
    hasPriceObjective(query);

  const qualityObjectives =
    detectQualityObjectives(query);

  if (
    priceObjective &&
    qualityObjectives.length > 0
  ) {
    return "BEST_PRODUCT";
  }

  if (priceObjective) {
    return "BEST_OFFER";
  }

  const recommendationSignals = [
    "mi serve",
    "ho bisogno",
    "consigliami",
    "cosa mi consigli",
    "cosa consigli",
    "aiutami a scegliere",
    "non so quale scegliere",
    "cerco qualcosa",
    "vorrei qualcosa",
  ];

  if (
    recommendationSignals.some(
      signal => q.includes(signal)
    )
  ) {
    return "RECOMMENDATION";
  }

  const bestProductSignals = [
    "miglior",
    "migliore",
    "migliori",
    "best",
    "mejor",
  ];

  if (
    bestProductSignals.some(
      signal => q.includes(signal)
    )
  ) {
    return "BEST_PRODUCT";
  }

  return "PRODUCT_SEARCH";
}


// ========================================
// BUDGET
// ========================================

function extractBudget(query) {
  const q = normalizeText(query);

  const patterns = [
    /sotto\s+(\d+(?:[.,]\d+)?)\s*(?:euro|eur)?/,
    /entro\s+(\d+(?:[.,]\d+)?)\s*(?:euro|eur)?/,
    /massimo\s+(\d+(?:[.,]\d+)?)\s*(?:euro|eur)?/,
    /max\s+(\d+(?:[.,]\d+)?)\s*(?:euro|eur)?/,
    /fino\s+a\s+(\d+(?:[.,]\d+)?)\s*(?:euro|eur)?/,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);

    if (match) {
      const value = Number(
        match[1].replace(",", ".")
      );

      if (Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}


// ========================================
// PULIRE QUERY
// ========================================

function cleanProductQuery(query) {
  let q = normalizeText(query);

  const removablePhrases = [
    "piu economico",
    "piu economica",
    "meno caro",
    "meno cara",
    "prezzo piu basso",
    "miglior prezzo",
    "migliore prezzo",
    "migliore offerta",
    "offerta migliore",
    "offerta piu conveniente",
    "piu conveniente",

    "qual e il miglior",
    "qual e la migliore",
    "qual e il migliore",
    "quale e il miglior",
    "quale e la migliore",

    "mi serve",
    "ho bisogno",
    "consigliami",
    "cosa mi consigli",
    "cosa consigli",
    "aiutami a scegliere",
    "non so quale scegliere",
    "cerco qualcosa",
    "vorrei qualcosa",
  ];

  for (const phrase of removablePhrases) {
    q = q.replaceAll(
      phrase,
      " "
    );
  }

  q = q.replace(
    /\b(?:sotto|entro|massimo|max)\s+\d+(?:[.,]\d+)?\s*(?:euro|eur)?\b/g,
    " "
  );

  q = q.replace(
    /\bfino\s+a\s+\d+(?:[.,]\d+)?\s*(?:euro|eur)?\b/g,
    " "
  );

  const stopWords =
    new Set([
      "voglio",
      "vorrei",
      "trova",
      "trovami",
      "cerca",
      "cercami",
      "dammi",
      "mostrami",
      "per",
      "favore",
      "il",
      "lo",
      "la",
      "i",
      "gli",
      "le",
      "un",
      "uno",
      "una",
      "del",
      "della",
      "dei",
      "delle",
      "di",
    ]);

  return q
    .split(" ")
    .filter(Boolean)
    .filter(
      word => !stopWords.has(word)
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}


// ========================================
// QUERY CATALOGO
// ========================================

function buildCatalogQuery(
  rawQuery,
  intent,
  category
) {
  if (
    (
      intent === "BEST_PRODUCT" ||
      intent === "RECOMMENDATION"
    ) &&
    category
  ) {
    return category;
  }

  return cleanProductQuery(
    rawQuery
  );
}


// ========================================
// IDENTITÀ VARIANTE
// ========================================

function getProductKey(product) {
  return [
    normalizeText(product.brand),
    normalizeText(product.model),
    normalizeText(product.storage),
    normalizeText(product.ram),
    normalizeText(product.condition),
  ].join("|");
}


// ========================================
// OFFERTE EQUIVALENTI
// ========================================

function groupEquivalentProducts(
  products
) {
  const groups =
    new Map();

  for (const product of products) {
    const key =
      getProductKey(product);

    if (!groups.has(key)) {
      groups.set(
        key,
        []
      );
    }

    groups
      .get(key)
      .push(product);
  }

  return Array.from(
    groups.values()
  );
}


// ========================================
// PRODUCT SEARCH
// ========================================

function analyzeProductSearch(
  query,
  products
) {
  if (
    !query ||
    !query.trim()
  ) {
    return {
      status: "empty",
      canRecommend: false,
      message:
        "Scrivi il prodotto che stai cercando.",
      missing: [],
      options: {},
      selectedProducts: [],
    };
  }

  if (
    !Array.isArray(products) ||
    products.length === 0
  ) {
    return {
      status: "not_found",
      canRecommend: false,
      message:
        "Non ho trovato prodotti corrispondenti alla ricerca.",
      missing: [],
      options: {},
      selectedProducts: [],
    };
  }

  const groups =
    groupEquivalentProducts(
      products
    );

  if (groups.length === 1) {
    return {
      status: "specific",
      canRecommend: true,
      message:
        "Ho identificato il prodotto. Posso confrontare le offerte disponibili.",
      missing: [],
      options: {},
      selectedProducts:
        groups[0],
    };
  }

  const models =
    uniqueValues(
      products,
      "model"
    );

  const matchingModels =
    matchSpecificModels(query, models);

  if (
    matchingModels.length !== 1
  ) {
    return {
      status:
        "needs_clarification",
      canRecommend: false,
      message:
        "La ricerca è troppo generica. Specifica il modello che stai cercando.",
      missing: [
        "model"
      ],
      options: {
        models,
      },
      selectedProducts: [],
    };
  }

  const selectedModel =
    matchingModels[0];

  const modelProducts =
    products.filter(
      product =>
        normalizeText(
          product.model
        ) ===
        normalizeText(
          selectedModel
        )
    );

  const storages =
    uniqueValues(
      modelProducts,
      "storage"
    );

  if (storages.length > 1) {
    const matchingStorages =
      storages.filter(
        storage =>
          queryContains(
            query,
            storage
          )
      );

    if (
      matchingStorages.length !== 1
    ) {
      return {
        status:
          "needs_clarification",
        canRecommend: false,
        message:
          `Ho trovato diverse versioni di ${selectedModel}. Quale capacitÃ  vuoi?`,
        missing: [
          "storage"
        ],
        options: {
          model:
            selectedModel,
          storages,
        },
        selectedProducts: [],
      };
    }

    const selectedStorage =
      matchingStorages[0];

    const storageProducts =
      modelProducts.filter(
        product =>
          normalizeText(
            product.storage
          ) ===
          normalizeText(
            selectedStorage
          )
      );

    const finalGroups =
      groupEquivalentProducts(
        storageProducts
      );

    if (
      finalGroups.length === 1
    ) {
      return {
        status: "specific",
        canRecommend: true,
        message:
          "Ho identificato il prodotto. Posso confrontare le offerte disponibili.",
        missing: [],
        options: {},
        selectedProducts:
          finalGroups[0],
      };
    }
  }

  const finalGroups =
    groupEquivalentProducts(
      modelProducts
    );

  if (
    finalGroups.length === 1
  ) {
    return {
      status: "specific",
      canRecommend: true,
      message:
        "Ho identificato il prodotto. Posso confrontare le offerte disponibili.",
      missing: [],
      options: {},
      selectedProducts:
        finalGroups[0],
    };
  }

  return {
    status:
      "needs_clarification",
    canRecommend: false,
    message:
      "Ho trovato più versioni del prodotto. Specifica meglio la configurazione.",
    missing: [
      "configuration"
    ],
    options: {},
    selectedProducts: [],
  };
}


// ========================================
// BEST OFFER
// ========================================

function analyzeBestOffer(
  query,
  products
) {
  if (
    !Array.isArray(products) ||
    products.length === 0
  ) {
    return {
      status: "not_found",
      canRecommend: false,
      message:
        "Non ho trovato offerte per questo prodotto.",
      missing: [],
      options: {},
      selectedProducts: [],
    };
  }

  const models =
    uniqueValues(
      products,
      "model"
    );

  let selectedProducts =
    products;

  if (models.length > 1) {
    const matchingModels =
      matchSpecificModels(query, models);

    if (
      matchingModels.length !== 1
    ) {
      return {
        status:
          "needs_clarification",
        canRecommend: false,
        message:
          "Ho trovato diversi modelli. Quale vuoi acquistare?",
        missing: [
          "model"
        ],
        options: {
          models,
        },
        selectedProducts: [],
      };
    }

    const selectedModel =
      matchingModels[0];

    selectedProducts =
      products.filter(
        product =>
          normalizeText(
            product.model
          ) ===
          normalizeText(
            selectedModel
          )
      );
  }

  return {
    status:
      "best_offer_ready",
    canRecommend: true,
    message:
      "Ho identificato il prodotto e posso cercare l'offerta più economica tra le varianti disponibili.",
    missing: [],
    options: {},
    selectedProducts,
  };
}


// ========================================
// FILTRARE FAMIGLIE PER BUDGET
// ========================================

function filterFamiliesByBudget(
  families,
  budget
) {
  if (
    typeof budget !== "number" ||
    !Number.isFinite(budget)
  ) {
    return families;
  }

  return families.filter(
    family => {
      const bestOffer =
        getLowestOffer(
          family
        );

      return (
        bestOffer &&
        typeof bestOffer
          .offer_price === "number" &&
        bestOffer.offer_price <=
          budget
      );
    }
  );
}


// ========================================
// OFFERTE DELLE FAMIGLIE
// ========================================

function offersForFamilies(
  offers,
  families
) {
  const ids =
    new Set(
      families.map(
        family =>
          family.familyId
      )
    );

  return offers.filter(
    offer =>
      ids.has(
        offer.familyId ||
        offer.productId
      )
  );
}


// ========================================
// BEST PRODUCT
// ========================================

function analyzeBestProduct(
  offers,
  {
    budget = null,
    objectives = [],
    priceObjective = false,
  } = {}
) {
  if (
    !Array.isArray(offers) ||
    offers.length === 0
  ) {
    return {
      status: "not_found",
      canRecommend: false,
      message:
        "Non ho trovato prodotti compatibili con questa ricerca.",
      selectedOffers: [],
      ranking: {
        level: "family",
        mode: null,
        criteria: [],
        candidates: 0,
        ranked: [],
      },
    };
  }

  let families =
    getUniqueFamilies(
      offers
    );

  families =
    filterFamiliesByBudget(
      families,
      budget
    );

  if (
    families.length === 0
  ) {
    return {
      status:
        "no_products_in_budget",
      canRecommend: false,
      message:
        budget !== null
          ? `Non ho trovato prodotti disponibili entro ${budget} €.`
          : "Non ho trovato prodotti compatibili.",
      selectedOffers: [],
      ranking: {
        level: "family",
        mode: null,
        criteria:
          objectives.map(
            item =>
              item.criterion
          ),
        candidates: 0,
        ranked: [],
      },
    };
  }

  const selectedOffers =
    offersForFamilies(
      offers,
      families
    );

  let ranked = [];
  let mode = null;

  if (
    priceObjective &&
    objectives.length === 1
  ) {
    mode =
      "quality_and_price";

    ranked =
      rankQualityAndPrice(
        families,
        {
          criterion:
            objectives[0]
              .criterion,
          qualityWeight:
            0.7,
          priceWeight:
            0.3,
        }
      );
  }

  else if (
    objectives.length > 1
  ) {
    mode =
      "multi_criteria";

    ranked =
      rankByObjectives(
        families,
        objectives
      );
  }

  else if (
    objectives.length === 1
  ) {
    mode =
      "single_criterion";

    ranked =
      rankByCriterion(
        families,
        objectives[0]
          .criterion
      );
  }

  else {
    mode =
      "overall";

    ranked =
      rankByCriterion(
        families,
        "overall"
      );
  }

  if (
    ranked.length === 0
  ) {
    return {
      status:
        "knowledge_insufficient",
      canRecommend: false,
      message:
        "Ho trovato prodotti compatibili, ma non ho ancora dati verificati sufficienti per stabilire quale sia il migliore.",
      selectedOffers,
      ranking: {
        level: "family",
        mode,
        criteria:
          objectives.length > 0
            ? objectives.map(
                item =>
                  item.criterion
              )
            : [
                "overall"
              ],
        priceObjective,
        candidates:
          families.length,
        ranked: [],
      },
    };
  }

  const winner =
    ranked[0];

  const bestOffer =
    getLowestOffer(
      winner
    );

  return {
    status:
      "best_product_ready",
    canRecommend:
      Boolean(bestOffer),
    message:
      "Ho confrontato i modelli utilizzando i criteri disponibili e ho poi cercato la variante con l'offerta più conveniente.",
    selectedOffers,
    winner,
    bestOffer,
    ranking: {
      level:
        "family",
      mode,
      criteria:
        objectives.length > 0
          ? objectives.map(
              item =>
                item.criterion
            )
          : [
              "overall"
            ],
      priceObjective,
      candidates:
        families.length,
      ranked:
        ranked.map(
          family => {
            const familyBestOffer =
              getLowestOffer(
                family
              );

            return {
              familyId:
                family.familyId,
              title:
                family.title,
              score:
                family.ranking
                  ?.score ??
                null,
              criterion:
                family.ranking
                  ?.criterion ??
                null,
              selectedVariant:
                familyBestOffer
                  ?.productId ??
                null,
              lowestPrice:
                familyBestOffer
                  ?.offer_price ??
                null,
              currency:
                familyBestOffer
                  ?.currency ??
                "EUR",
            };
          }
        ),
    },
  };
}


// ========================================
// COPERTURA DATI RECOMMENDATION
//
// Usiamo un criterio solo se tutte le
// famiglie candidate hanno uno score
// comparabile per quel criterio.
//
// In questo modo non eliminiamo in
// silenzio prodotti solo perché mancano
// dati.
// ========================================

function analyzeRecommendationCoverage(
  offers,
  objectives
) {
  const families =
    getUniqueFamilies(
      offers
    );

  const supportedObjectives = [];
  const unsupportedObjectives = [];

  for (
    const objective of
    objectives || []
  ) {
    const criterion =
      objective.criterion;

    if (!criterion) {
      continue;
    }

    const scoredFamilies =
      families.filter(
        family =>
          getFamilyScore(
            family,
            criterion
          ) !== null
      ).length;

    const coverage = {
      criterion,
      weight:
        objective.weight || 1,
      source:
        objective.source ||
        null,
      scoredFamilies,
      totalFamilies:
        families.length,
    };

    if (
      families.length > 0 &&
      scoredFamilies ===
        families.length
    ) {
      supportedObjectives.push({
        criterion,
        weight:
          objective.weight || 1,
      });
    } else {
      unsupportedObjectives.push(
        coverage
      );
    }
  }

  return {
    families:
      families.length,
    supportedObjectives,
    unsupportedObjectives,
  };
}


// ========================================
// RECOMMENDATION
// ========================================

function analyzeRecommendation(
  query,
  offers,
  {
    budget = null,
    category = null,
    explicitObjectives = [],
  } = {}
) {
  const need =
    analyzeRecommendationNeed(
      query,
      {
        category,
        explicitObjectives,
      }
    );

  if (!need.canRank) {
    return {
      status:
        need.status,
      canRecommend: false,
      message:
        need.message,
      need,
      dataCoverage: {
        families: 0,
        supportedObjectives: [],
        unsupportedObjectives: [],
      },
      selectedOffers: [],
      winner: null,
      bestOffer: null,
      ranking: null,
    };
  }

  if (
    !Array.isArray(offers) ||
    offers.length === 0
  ) {
    return {
      status: "not_found",
      canRecommend: false,
      message:
        "Non ho trovato prodotti disponibili per questa categoria.",
      need,
      dataCoverage: {
        families: 0,
        supportedObjectives: [],
        unsupportedObjectives: [],
      },
      selectedOffers: [],
      winner: null,
      bestOffer: null,
      ranking: null,
    };
  }

  let families =
    getUniqueFamilies(
      offers
    );

  families =
    filterFamiliesByBudget(
      families,
      budget
    );

  if (
    families.length === 0
  ) {
    return {
      status:
        "no_products_in_budget",
      canRecommend: false,
      message:
        budget !== null
          ? `Ho capito cosa ti serve, ma non ho trovato prodotti disponibili entro ${budget} €.`
          : "Non ho trovato prodotti compatibili.",
      need,
      dataCoverage: {
        families: 0,
        supportedObjectives: [],
        unsupportedObjectives: [],
      },
      selectedOffers: [],
      winner: null,
      bestOffer: null,
      ranking: {
        level: "family",
        mode:
          "recommendation",
        criteria:
          need.objectives.map(
            item =>
              item.criterion
          ),
        candidates: 0,
        ranked: [],
      },
    };
  }

  const eligibleOffers =
    offersForFamilies(
      offers,
      families
    );

  const dataCoverage =
    analyzeRecommendationCoverage(
      eligibleOffers,
      need.objectives
    );

  if (
    dataCoverage
      .supportedObjectives
      .length === 0
  ) {
    return {
      status:
        "knowledge_insufficient",
      canRecommend: false,
      message:
        "Ho capito le tue esigenze e ho trovato prodotti compatibili, ma non ho ancora dati verificati sufficienti per confrontarli in modo affidabile.",
      need,
      dataCoverage,
      selectedOffers:
        eligibleOffers,
      winner: null,
      bestOffer: null,
      ranking: {
        level: "family",
        mode:
          "recommendation",
        criteria:
          need.objectives.map(
            item =>
              item.criterion
          ),
        candidates:
          families.length,
        ranked: [],
      },
    };
  }

  const productAnalysis =
    analyzeBestProduct(
      eligibleOffers,
      {
        budget: null,
        objectives:
          dataCoverage
            .supportedObjectives,
        priceObjective:
          false,
      }
    );

  return {
    ...productAnalysis,
    need,
    dataCoverage,
  };
}


// ========================================
// PREZZO PIÙ BASSO
// ========================================

function pickBestOffer(
  products
) {
  if (
    !Array.isArray(products) ||
    products.length === 0
  ) {
    return null;
  }

  const validProducts =
    products.filter(
      product =>
        typeof product
          .offer_price ===
          "number" &&
        Number.isFinite(
          product.offer_price
        )
    );

  if (
    validProducts.length === 0
  ) {
    return null;
  }

  return validProducts.reduce(
    (best, product) =>
      product.offer_price <
      best.offer_price
        ? product
        : best
  );
}


// ========================================
// RACCOMANDAZIONE OFFERTE EQUIVALENTI
// ========================================

function buildEquivalentRecommendation(
  bestOffer,
  comparableOffers
) {
  if (!bestOffer) {
    return null;
  }

  const otherPrices =
    comparableOffers
      .filter(
        product =>
          product.id !==
          bestOffer.id
      )
      .map(
        product =>
          product.offer_price
      )
      .filter(
        price =>
          typeof price ===
            "number"
      );

  let savings = null;

  if (
    otherPrices.length > 0
  ) {
    const nextPrice =
      Math.min(
        ...otherPrices
      );

    savings =
      nextPrice -
      bestOffer.offer_price;
  }

  return {
    reason:
      "lowest_price_equivalent_offers",
    store:
      bestOffer.store,
    price:
      bestOffer.offer_price,
    currency:
      bestOffer.currency ||
      "EUR",
    comparedOffers:
      comparableOffers.length,
    savingsVsNextOffer:
      savings !== null &&
      savings > 0
        ? Number(
            savings.toFixed(2)
          )
        : 0,
    message:
      comparableOffers.length > 1
        ? `Questa è l'offerta con il prezzo più basso tra ${comparableOffers.length} offerte equivalenti trovate.`
        : "Ho trovato una sola offerta per questo prodotto.",
  };
}


// ========================================
// RACCOMANDAZIONE BEST OFFER
// ========================================

function buildBestOfferRecommendation(
  bestOffer,
  offers
) {
  if (!bestOffer) {
    return null;
  }

  const otherPrices =
    offers
      .filter(
        offer =>
          offer.id !==
          bestOffer.id
      )
      .map(
        offer =>
          offer.offer_price
      )
      .filter(
        price =>
          typeof price ===
            "number"
      );

  let savings = null;

  if (
    otherPrices.length > 0
  ) {
    const nextPrice =
      Math.min(
        ...otherPrices
      );

    savings =
      nextPrice -
      bestOffer.offer_price;
  }

  return {
    reason:
      "lowest_price_requested",
    store:
      bestOffer.store,
    price:
      bestOffer.offer_price,
    currency:
      bestOffer.currency ||
      "EUR",
    comparedOffers:
      offers.length,

    selectedVariant: {
      productId:
        bestOffer.productId ||
        null,
      familyId:
        bestOffer.familyId ||
        null,
      model:
        bestOffer.model ||
        null,
      storage:
        bestOffer.storage ||
        null,
      ram:
        bestOffer.ram ||
        null,
      color:
        bestOffer.color ||
        null,
    },

    savingsVsNextOffer:
      savings !== null &&
      savings > 0
        ? Number(
            savings.toFixed(2)
          )
        : 0,

    message:
      offers.length > 1
        ? `Ho confrontato ${offers.length} offerte e varianti disponibili e ho trovato il prezzo indicato più basso.`
        : "Ho trovato una sola offerta disponibile per questa ricerca.",
  };
}


// ========================================
// RACCOMANDAZIONE BEST PRODUCT
// ========================================

function buildBestProductRecommendation(
  winner,
  bestOffer,
  ranking
) {
  if (
    !winner ||
    !bestOffer
  ) {
    return null;
  }

  return {
    reason:
      "best_product",

    familyId:
      winner.familyId,

    title:
      winner.title,

    selectedVariant:
      bestOffer.productId,

    rankingScore:
      winner.ranking
        ?.score ??
      null,

    rankingMode:
      ranking?.mode ??
      null,

    criteria:
      ranking?.criteria ||
      [],

    store:
      bestOffer.store,

    price:
      bestOffer.offer_price,

    currency:
      bestOffer.currency ||
      "EUR",

    message:
      "Questo modello risulta il più adatto secondo i criteri disponibili. Ho poi selezionato la variante con l'offerta più conveniente trovata.",
  };
}


// ========================================
// RACCOMANDAZIONE BASATA SUL BISOGNO
// ========================================

function buildNeedRecommendation(
  analysis
) {
  const winner =
    analysis?.winner;

  const bestOffer =
    analysis?.bestOffer;

  if (
    !winner ||
    !bestOffer
  ) {
    return null;
  }

  const usedCriteria =
    analysis
      ?.dataCoverage
      ?.supportedObjectives
      ?.map(
        item =>
          item.criterion
      ) || [];

  const missingCriteria =
    analysis
      ?.dataCoverage
      ?.unsupportedObjectives
      ?.map(
        item =>
          item.criterion
      ) || [];

  let message =
    `Per l'uso "${analysis.need?.useCase?.label || "generale"}", questo è il modello che risulta più adatto usando i dati comparabili disponibili.`;

  if (
    missingCriteria.length > 0
  ) {
    message +=
      ` Non ho ancora dati comparabili sufficienti per: ${missingCriteria.join(", ")}.`;
  }

  return {
    reason:
      "needs_based_recommendation",

    useCase:
      analysis.need?.useCase ||
      null,

    familyId:
      winner.familyId,

    title:
      winner.title,

    selectedVariant:
      bestOffer.productId,

    usedCriteria,

    missingCriteria,

    rankingScore:
      winner.ranking
        ?.score ??
      null,

    store:
      bestOffer.store,

    price:
      bestOffer.offer_price,

    currency:
      bestOffer.currency ||
      "EUR",

    message,
  };
}


// ========================================
// HOME
// ========================================

app.get(
  "/",
  (req, res) => {
    res.send(
      "Servidor DaniSua funcionando"
    );
  }
);


// ========================================
// HEALTH
// ========================================

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      sources: sourceRegistry.getSourcesStatus(),
      time:
        new Date()
          .toISOString(),
    });
  }
);


// ========================================
// SEARCH
// ========================================

app.get(
  "/search",

  async (
    req,
    res
  ) => {
    try {
      const rawQuery =
        (
          req.query.q ||
          ""
        )
          .toString()
          .trim();

      const intent =
        detectIntent(
          rawQuery
        );

      const budget =
        extractBudget(
          rawQuery
        );

      const category =
        detectCategory(
          rawQuery
        );

      const objectives =
        detectQualityObjectives(
          rawQuery
        );

      const priceObjective =
        hasPriceObjective(
          rawQuery
        );

      const productQuery =
        buildCatalogQuery(
          rawQuery,
          intent,
          category
        );

      const sourceSearch =
        await sourceRegistry.searchAll(
          productQuery,
          {
            limitPerSource: 100,
            totalLimit: 300,
            betaOnly: true,
          }
        );

      const results =
        sourceSearch.results;

      const sourceDiagnostics =
        sourceSearch.diagnostics;


      // ==================================
      // PRODUCT SEARCH
      // ==================================

      if (
        intent ===
        "PRODUCT_SEARCH"
      ) {
        const analysis =
          analyzeProductSearch(
            productQuery,
            results
          );

        const comparableResults =
          Array.isArray(
            analysis
              .selectedProducts
          ) &&
          analysis
            .selectedProducts
            .length > 0
            ? analysis
                .selectedProducts
            : results;

        let bestOffer =
          null;

        let recommendation =
          null;

        if (
          analysis.canRecommend
        ) {
          bestOffer =
            pickBestOffer(
              comparableResults
            );

          recommendation =
            buildEquivalentRecommendation(
              bestOffer,
              comparableResults
            );
        }

        return res.json({
          query:
            rawQuery,

          productQuery,

          intent,

          context: {
            budget,
            category,
            objectives,
            priceObjective,
          },

          status:
            analysis.status,

          canRecommend:
            analysis.canRecommend,

          clarification: {
            needed:
              analysis.status ===
                "needs_clarification",

            message:
              analysis.message,

            missing:
              analysis.missing ||
              [],

            options:
              analysis.options ||
              {},
          },

          count:
            comparableResults.length,

          bestOffer,

          recommendation,

          ranking: null,

          results:
            comparableResults,
        });
      }


      // ==================================
      // BEST OFFER
      // ==================================

      if (
        intent ===
        "BEST_OFFER"
      ) {
        const analysis =
          analyzeBestOffer(
            productQuery,
            results
          );

        const comparableResults =
          Array.isArray(
            analysis
              .selectedProducts
          ) &&
          analysis
            .selectedProducts
            .length > 0
            ? analysis
                .selectedProducts
            : results;

        let bestOffer =
          null;

        let recommendation =
          null;

        if (
          analysis.canRecommend
        ) {
          bestOffer =
            pickBestOffer(
              comparableResults
            );

          recommendation =
            buildBestOfferRecommendation(
              bestOffer,
              comparableResults
            );
        }

        return res.json({
          query:
            rawQuery,

          productQuery,

          intent,

          context: {
            budget,
            category,
            objectives,
            priceObjective,
          },

          status:
            analysis.status,

          canRecommend:
            analysis.canRecommend,

          clarification: {
            needed:
              analysis.status ===
                "needs_clarification",

            message:
              analysis.message,

            missing:
              analysis.missing ||
              [],

            options:
              analysis.options ||
              {},
          },

          count:
            comparableResults.length,

          bestOffer,

          recommendation,

          ranking: null,

          results:
            comparableResults,
        });
      }


      // ==================================
      // BEST PRODUCT
      // ==================================

      if (
        intent ===
        "BEST_PRODUCT"
      ) {
        const analysis =
          analyzeBestProduct(
            results,
            {
              budget,
              objectives,
              priceObjective,
            }
          );

        const bestOffer =
          analysis.bestOffer ||
          null;

        const recommendation =
          analysis.canRecommend
            ? buildBestProductRecommendation(
                analysis.winner,
                bestOffer,
                analysis.ranking
              )
            : null;

        return res.json({
          query:
            rawQuery,

          productQuery,

          intent,

          context: {
            budget,
            category,
            objectives,
            priceObjective,
          },

          status:
            analysis.status,

          canRecommend:
            analysis.canRecommend,

          clarification: {
            needed: false,

            message:
              analysis.message,

            missing: [],

            options: {},
          },

          count:
            analysis
              .selectedOffers
              .length,

          bestOffer,

          recommendation,

          ranking:
            analysis.ranking,

          results:
            analysis.selectedOffers,
        });
      }


      // ==================================
      // RECOMMENDATION
      // ==================================

      if (
        intent ===
        "RECOMMENDATION"
      ) {
        const analysis =
          analyzeRecommendation(
            rawQuery,
            results,
            {
              budget,
              category,
              explicitObjectives:
                objectives,
            }
          );

        const recommendation =
          analysis.canRecommend
            ? buildNeedRecommendation(
                analysis
              )
            : null;

        const needsClarification =
          analysis.status ===
            "needs_category";

        return res.json({
          query:
            rawQuery,

          productQuery,

          intent,

          context: {
            budget,
            category,
            objectives,
            priceObjective,

            recommendationNeed:
              analysis.need ||
              null,

            dataCoverage:
              analysis.dataCoverage ||
              null,
          },

          status:
            analysis.status,

          canRecommend:
            analysis.canRecommend,

          clarification: {
            needed:
              needsClarification,

            message:
              analysis.message,

            missing:
              needsClarification
                ? [
                    "category"
                  ]
                : [],

            options: {},
          },

          count:
            Array.isArray(
              analysis.selectedOffers
            )
              ? analysis
                  .selectedOffers
                  .length
              : 0,

          bestOffer:
            analysis.bestOffer ||
            null,

          recommendation,

          ranking:
            analysis.ranking ||
            null,

          results:
            analysis
              .selectedOffers ||
            [],
        });
      }


      // ==================================
      // FALLBACK
      // ==================================

      return res.json({
        query:
          rawQuery,

        productQuery,

        intent,

        context: {
          budget,
          category,
          objectives,
          priceObjective,
        },

        status:
          "unsupported_intent",

        canRecommend: false,

        clarification: {
          needed: false,

          message:
            "Non sono riuscito a interpretare correttamente la richiesta.",

          missing: [],

          options: {},
        },

        count: 0,

        bestOffer: null,

        recommendation: null,

        ranking: null,

        results: [],
      });

    } catch (error) {
      console.error(
        "Error en /search:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "No se pudo completar la bÃºsqueda.",

          details:
            error.message,
        });
    }
  }
);


// ========================================
// START
// ========================================

app.listen(
  PORT,
  HOST,

  () => {
    console.log(
      `Servidor DaniSua corriendo en ${HOST}:${PORT}`
    );
  }
);

