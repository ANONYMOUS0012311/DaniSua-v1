const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const sourceRegistry = require("./sources/registry");

const {
  logInfo,
  logError,
} = require("./utils/logger");

const {
  getUniqueFamilies,
  getLowestOffer,
  isDefaultComparableOffer,
  getKnownFinalCost,
  getOfferDecisionCost,
  getOfferSelection,
  getFamilyScore,
  rankByCriterion,
  rankByObjectives,
  rankQualityAndPrice,
} = require("./utils/rankProducts");

const {
  analyzeRecommendationNeed,
  detectUseCase,
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


const REQUEST_ID_PATTERN =
  /^[A-Za-z0-9._:-]{1,80}$/;


function getRequestId(req) {
  const incoming =
    req.get(
      "x-request-id"
    );

  if (
    incoming &&
    REQUEST_ID_PATTERN.test(
      incoming
    )
  ) {
    return incoming;
  }

  return crypto
    .randomUUID();
}


app.use(
  (
    req,
    res,
    next
  ) => {
    const requestId =
      getRequestId(
        req
      );

    const startedAt =
      process
        .hrtime
        .bigint();

    req.requestId =
      requestId;

    res.setHeader(
      "X-Request-Id",
      requestId
    );

    res.on(
      "finish",
      () => {
        const durationNs =
          process
            .hrtime
            .bigint() -
          startedAt;

        const durationMs =
          Number(
            durationNs /
            1000000n
          );

        logInfo(
          "http_request",
          {
            requestId,
            method:
              req.method,
            path:
              req.path,
            status:
              res.statusCode,
            durationMs,
          }
        );
      }
    );

    next();
  }
);


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


        const error =
          new Error(
            "Origin not allowed by DaniSua CORS policy"
          );

        error.status =
          403;

        error.code =
          "cors_origin_denied";

        return callback(
          error
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
    .trim()
    .replace(/\bmiglore\b/g, "migliore")
    .replace(/\bmigliroe\b/g, "migliore")
    .replace(/\bmiglor\b/g, "miglior");
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
        "iphone",
        "galaxy",
      ],
    },

    {
      value: "auriculares",
      aliases: [
        "cuffie",
        "auricolari",
        "headphone",
        "headphones",
        "airpods",
        "xm5",
        "xm6",
        "wh 1000xm",
      ],
    },

    {
      value: "portatil",
      aliases: [
        "portatile",
        "portatili",
        "laptop",
        "notebook",
        "macbook",
      ],
    },

    {
      value: "tablet",
      aliases: [
        "tablet",
        "tablets",
        "ipad",
      ],
    },

    {
      value: "consola",
      aliases: [
        "console",
        "playstation",
        "ps5",
        "xbox",
        "nintendo",
        "switch",
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
// RICHIESTA GENERICA DI CATEGORIA
// ========================================

const CATEGORY_GENERIC_ALIASES = {
  smartphone: [
    "smartphone",
    "telefono",
    "telefoni",
    "cellulare",
    "cellulari",
  ],
  auriculares: [
    "cuffie",
    "auricolari",
    "headphone",
    "headphones",
  ],
  portatil: [
    "portatile",
    "portatili",
    "laptop",
    "notebook",
  ],
  tablet: [
    "tablet",
    "tablets",
  ],
  consola: [
    "console",
    "consola",
  ],
};


function isGenericCategoryProductQuery(
  productQuery,
  category
) {
  if (!category) {
    return false;
  }

  const q =
    normalizeText(
      productQuery
    );

  if (!q) {
    return true;
  }

  const aliases =
    CATEGORY_GENERIC_ALIASES[
      category
    ] || [];

  return aliases.some(
    alias =>
      q ===
      normalizeText(alias)
  );
}


// ========================================
// SEGNALI NORMALIZZATI
// ========================================

function containsNormalizedSignal(
  normalizedQuery,
  signal
) {
  const query =
    normalizeText(
      normalizedQuery
    );

  const normalizedSignal =
    normalizeText(
      signal
    );

  if (
    !query ||
    !normalizedSignal
  ) {
    return false;
  }

  return (
    ` ${query} `
      .includes(
        ` ${normalizedSignal} `
      )
  );
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
        "telecamera",
        "telecamere",
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
        signal =>
          containsNormalizedSignal(
            q,
            signal
          )
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
// REQUISITI HARD
// ========================================

function detectHardRequirements(query) {
  const q =
    normalizeText(query);

  const requirements = {};

  const ancSignals = [
    "anc",
    "cancellazione rumore",
    "cancellazione del rumore",
    "cancellazione attiva del rumore",
  ];

  if (
    ancSignals.some(
      signal =>
        containsNormalizedSignal(
          q,
          signal
        )
    )
  ) {
    requirements.anc = true;
  }

  return requirements;
}


function filterOffersByHardRequirements(
  offers,
  hardRequirements
) {
  if (!Array.isArray(offers)) {
    return [];
  }

  return offers.filter(
    offer => {
      if (
        hardRequirements?.anc === true &&
        offer?.attributes?.anc !== true
      ) {
        return false;
      }

      return true;
    }
  );
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

  const budget =
    extractBudget(query);

  const qualityObjectives =
    detectQualityObjectives(query);

  const category =
    detectCategory(query);

  const useCase =
    detectUseCase(
      query,
      category
    );

  const productQuery =
    cleanProductQuery(
      query
    );

  const genericCategoryRequest =
    isGenericCategoryProductQuery(
      productQuery,
      category
    );

  if (
    priceObjective &&
    qualityObjectives.length > 0
  ) {
    return "BEST_PRODUCT";
  }

  if (priceObjective) {
    return genericCategoryRequest
      ? "RECOMMENDATION"
      : "BEST_OFFER";
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
    "mi interessa",
    "per me",
  ];

  const explicitRecommendation =
    recommendationSignals.some(
      signal => q.includes(signal)
    );

  if (explicitRecommendation) {
    return "RECOMMENDATION";
  }

  if (
    genericCategoryRequest &&
    (
      useCase ||
      qualityObjectives.length > 0 ||
      budget !== null
    )
  ) {
    return "RECOMMENDATION";
  }

  if (budget !== null) {
    return "BEST_OFFER";
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

  // DANISUA_HARD_REQUIREMENT_QUERY_CLEANER
  const hardRequirementPhrases = [
    "cancellazione attiva del rumore",
    "cancellazione del rumore",
    "cancellazione rumore",
  ];

  for (const phrase of hardRequirementPhrases) {
    q = q.replaceAll(
      phrase,
      " "
    );
  }

  q = q.replace(
    /\banc\b/g,
    " "
  );


  // DANISUA_QUALITY_QUERY_CLEANER
  q = q.replace(
    /\b(?:con\s+)?(?:(?:il|lo|la|i|gli|le)\s+)?(?:miglior|migliore|migliori|best|mejor)\s+(?:telecamera|telecamere|fotocamera|fotocamere|camera|foto|fotografia|fotografie|batteria|autonomia|prestazioni|performance|display|schermo|audio|suono|comfort|comodita|portabilita|peso)\b/g,
    " "
  );

  q = q.replace(
    /\b(?:telecamera|telecamere|fotocamera|fotocamere|camera|foto|fotografia|fotografie|batteria|autonomia|prestazioni|performance|display|schermo|audio|suono|comfort|comodita|portabilita|peso)\s+(?:miglior|migliore|migliori|best|mejor)\b/g,
    " "
  );

  q = q.replace(
    /\b(?:sotto|entro|massimo|max)\s+\d+(?:[.,]\d+)?\s*(?:euro|eur)?\b/g,
    " "
  );

  q = q.replace(
    /\bfino\s+a\s+\d+(?:[.,]\d+)?\s*(?:euro|eur)?\b/g,
    " "
  );

  // DANISUA_SEARCH_V2_NEED_CLEANER
  // Le parole che descrivono l'uso guidano il
  // ranking, ma non devono restringere la ricerca
  // testuale del catalogo.
  const needPhrases = [
    "fare foto",
    "fare video",
    "foto",
    "fotografia",
    "fotografie",
    "video",
    "universita",
    "universitario",
    "universitaria",
    "studio",
    "studiare",
    "studenti",
    "studente",
    "lezioni",
    "gaming",
    "giocare",
    "videogiochi",
    "giochi",
    "lavoro",
    "lavorare",
    "ufficio",
    "professionale",
    "professionista",
    "viaggio",
    "viaggiare",
    "aereo",
    "treno",
    "musica",
    "ascoltare musica",
    "uso quotidiano",
    "tutti i giorni",
    "uso normale",
    "quotidiano",
    "batteria",
    "autonomia",
    "prestazioni",
    "performance",
    "potente",
    "potenza",
    "veloce",
    "velocita",
    "display",
    "schermo",
    "audio",
    "suono",
    "comfort",
    "comodita",
    "portabilita",
    "peso",
    "aggiornamenti",
    "software",
  ];

  for (const phrase of needPhrases) {
    q = q.replaceAll(
      phrase,
      " "
    );
  }


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
      "con",
      "l",
      "d",
      "buona",
      "buono",
      "ottima",
      "ottimo",
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
  const cleaned =
    cleanProductQuery(
      rawQuery
    );

  if (
    (
      intent === "BEST_PRODUCT" ||
      intent === "RECOMMENDATION"
    ) &&
    category
  ) {
    return isGenericCategoryProductQuery(
      cleaned,
      category
    )
      ? category
      : (
          cleaned ||
          category
        );
  }

  return cleaned;
}

// ========================================
// IDENTITÀ VARIANTE
// ========================================

function getProductKey(product) {
  if (product?.productId) {
    return String(product.productId);
  }

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
// LINEA / FAMIGLIA GENERICA
// ========================================

function queryTargetsProductLine(
  query,
  products
) {
  if (
    !Array.isArray(products) ||
    products.length === 0
  ) {
    return false;
  }

  const lineIds =
    uniqueValues(
      products,
      "productLineId"
    );

  if (lineIds.length !== 1) {
    return false;
  }

  const lineNames =
    uniqueValues(
      products,
      "productLineName"
    );

  const brands =
    uniqueValues(
      products,
      "brand"
    );

  const q =
    normalizeText(query);

  const candidates = [
    lineIds[0],
    lineNames[0] || null,
    brands.length === 1 &&
    lineNames.length === 1
      ? brands[0] + " " + lineNames[0]
      : null,
  ]
    .filter(Boolean)
    .map(normalizeText);

  return candidates.includes(q);
}


function queryTargetsCommonFamily(
  query,
  products
) {
  if (
    !Array.isArray(products) ||
    products.length === 0
  ) {
    return false;
  }

  const familyIds =
    uniqueValues(
      products,
      "familyId"
    );

  if (familyIds.length !== 1) {
    return false;
  }

  const familyNames =
    uniqueValues(
      products,
      "familyName"
    );

  const models =
    uniqueValues(
      products,
      "model"
    );

  const brands =
    uniqueValues(
      products,
      "brand"
    );

  const name =
    familyNames.length === 1
      ? familyNames[0]
      : (
          models.length === 1
            ? models[0]
            : null
        );

  if (!name) {
    return false;
  }

  const q =
    normalizeText(query);

  const candidates = [
    name,
    brands.length === 1
      ? brands[0] + " " + name
      : null,
  ]
    .filter(Boolean)
    .map(normalizeText);

  return candidates.includes(q);
}


// ========================================
// FAMIGLIA UNICA
// ========================================

function hasSingleFamily(
  products
) {
  return (
    Array.isArray(products) &&
    products.length > 0 &&
    uniqueValues(
      products,
      "familyId"
    ).length === 1
  );
}


function buildFamilyPriceReady(
  products
) {
  return {
    status:
      "family_price_ready",
    canRecommend: true,
    scope:
      "family",
    message:
      "Ho trovato più varianti compatibili dello stesso modello. Se non hai specificato una preferenza come il colore, privilegio il prezzo totale.",
    missing: [],
    options: {},
    selectedProducts:
      products,
  };
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
      scope: "exact_product",
      message:
        "Ho identificato il prodotto. Posso confrontare i prezzi disponibili tra i negozi.",
      missing: [],
      options: {},
      selectedProducts:
        groups[0],
    };
  }

  if (
    queryTargetsProductLine(
      query,
      products
    )
  ) {
    return {
      status: "product_line_ready",
      canRecommend: true,
      scope: "product_line",
      message:
        "Richiesta generica sulla linea: confronto le opzioni compatibili e privilegio il prezzo totale.",
      missing: [],
      options: {},
      selectedProducts:
        products,
    };
  }

  if (
    queryTargetsCommonFamily(
      query,
      products
    )
  ) {
    return {
      status: "family_price_ready",
      canRecommend: true,
      scope: "family",
      message:
        "Hai indicato il modello ma non una variante precisa: confronto le varianti compatibili e privilegio il prezzo.",
      missing: [],
      options: {},
      selectedProducts:
        products,
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
        scope: "exact_product",
        message:
          "Ho identificato il prodotto. Posso confrontare i prezzi disponibili tra i negozi.",
        missing: [],
        options: {},
        selectedProducts:
          finalGroups[0],
      };
    }

    if (
      hasSingleFamily(
        storageProducts
      )
    ) {
      return buildFamilyPriceReady(
        storageProducts
      );
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
      scope: "exact_product",
      message:
        "Ho identificato il prodotto. Posso confrontare i prezzi disponibili tra i negozi.",
      missing: [],
      options: {},
      selectedProducts:
        finalGroups[0],
    };
  }

  if (
    hasSingleFamily(
      modelProducts
    )
  ) {
    return buildFamilyPriceReady(
      modelProducts
    );
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
        "Non ho trovato prezzi disponibili per questo prodotto.",
      missing: [],
      options: {},
      selectedProducts: [],
    };
  }

  if (
    queryTargetsProductLine(
      query,
      products
    )
  ) {
    return {
      status: "best_offer_ready",
      canRecommend: true,
      scope: "product_line",
      message:
        "Confronto i modelli compatibili della linea e cerco il prezzo totale più basso.",
      missing: [],
      options: {},
      selectedProducts:
        products,
    };
  }

  if (
    queryTargetsCommonFamily(
      query,
      products
    )
  ) {
    return {
      status: "best_offer_ready",
      canRecommend: true,
      scope: "family",
      message:
        "Confronto le varianti compatibili del modello e cerco il prezzo totale più basso.",
      missing: [],
      options: {},
      selectedProducts:
        products,
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
      "Ho identificato il prodotto e posso cercare il prezzo più conveniente tra le varianti disponibili.",
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

      const decisionCost =
        getOfferDecisionCost(
          bestOffer
        );

      return (
        bestOffer &&
        typeof decisionCost ===
          "number" &&
        Number.isFinite(
          decisionCost
        ) &&
        decisionCost <=
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
// Un criterio può avere copertura:
// - completa: tutte le famiglie hanno dati
// - parziale: alcune famiglie hanno dati
// - assente: nessuna famiglia ha dati
//
// La copertura parziale NON trasforma i
// prodotti senza dati in prodotti peggiori.
// Vengono esclusi solo dal ranking e la
// risposta lo dichiara esplicitamente.
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
  const partialObjectives = [];

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
      partial:
        scoredFamilies > 0 &&
        scoredFamilies <
          families.length,
    };

    if (scoredFamilies > 0) {
      supportedObjectives.push({
        criterion,
        weight:
          objective.weight || 1,
      });

      if (
        scoredFamilies <
        families.length
      ) {
        partialObjectives.push(
          coverage
        );
      }
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
    partialObjectives,
  };
}


function getRankableFamiliesForObjectives(
  families,
  objectives
) {
  if (
    !Array.isArray(families) ||
    families.length === 0
  ) {
    return [];
  }

  const criteria =
    (objectives || [])
      .map(
        objective =>
          objective?.criterion
      )
      .filter(Boolean);

  if (criteria.length === 0) {
    return [];
  }

  return families.filter(
    family =>
      criteria.every(
        criterion =>
          getFamilyScore(
            family,
            criterion
          ) !== null
      )
  );
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

  const rankableFamilies =
    getRankableFamiliesForObjectives(
      families,
      dataCoverage
        .supportedObjectives
    );

  const rankableOffers =
    offersForFamilies(
      eligibleOffers,
      rankableFamilies
    );

  const enrichedCoverage = {
    ...dataCoverage,
    rankableFamilies:
      rankableFamilies.length,
    excludedFamilies:
      Math.max(
        0,
        families.length -
          rankableFamilies.length
      ),
  };

  if (
    enrichedCoverage
      .supportedObjectives
      .length === 0 ||
    rankableFamilies.length === 0
  ) {
    return {
      status:
        "knowledge_insufficient",
      canRecommend: false,
      message:
        "Ho capito le tue esigenze e ho trovato prodotti compatibili, ma non ho ancora dati verificati sufficienti per confrontarli in modo affidabile.",
      need,
      dataCoverage:
        enrichedCoverage,
      selectedOffers:
        eligibleOffers,
      compatibleOffers:
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
      rankableOffers,
      {
        budget: null,
        objectives:
          enrichedCoverage
            .supportedObjectives,
        priceObjective:
          false,
      }
    );

  return {
    ...productAnalysis,
    compatibleOffers:
      eligibleOffers,
    need,
    dataCoverage:
      enrichedCoverage,
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

  return getOfferSelection(
    products
  ).bestOffer;
}


// ========================================
// METADATI COSTO FINALE
// ========================================

function buildCostRecommendationMeta(
  bestOffer,
  offers
) {
  const comparableOffers =
    Array.isArray(offers)
      ? offers.filter(
          offer =>
            isDefaultComparableOffer(
              offer
            )
        )
      : [];

  const selection =
    getOfferSelection(
      comparableOffers
    );

  const selected =
    bestOffer ||
    selection.bestOffer;

  const finalCost =
    selected
      ?.costComparison
      ?.finalCost ??
    getKnownFinalCost(
      selected
    );

  const confirmedFinalCost =
    selected
      ?.costComparison
      ?.confirmedFinalCost ===
        true;

  const shippingKnown =
    typeof selected
      ?.shipping_price ===
      "number" &&
    Number.isFinite(
      selected.shipping_price
    );

  const unknownShippingOffers =
    comparableOffers.filter(
      offer =>
        getKnownFinalCost(
          offer
        ) === null
    ).length;

  let savingsVsNextOffer = 0;

  if (
    confirmedFinalCost &&
    comparableOffers.length > 1 &&
    unknownShippingOffers === 0
  ) {
    const totals =
      comparableOffers
        .map(
          offer =>
            getKnownFinalCost(
              offer
            )
        )
        .filter(
          value =>
            typeof value ===
              "number" &&
            Number.isFinite(
              value
            )
        )
        .sort(
          (a, b) =>
            a - b
        );

    if (
      totals.length > 1
    ) {
      savingsVsNextOffer =
        Number(
          (
            totals[1] -
            totals[0]
          ).toFixed(2)
        );
    }
  }

  return {
    price:
      selected
        ?.offer_price ??
      null,

    shippingPrice:
      shippingKnown
        ? selected
            .shipping_price
        : null,

    finalCost:
      confirmedFinalCost &&
      typeof finalCost ===
        "number"
        ? finalCost
        : null,

    shippingKnown,

    finalCostConfirmed:
      confirmedFinalCost,

    comparisonMode:
      selected
        ?.costComparison
        ?.mode ||
      selection.mode,

    unknownShippingOffers,

    savingsVsNextOffer:
      savingsVsNextOffer > 0
        ? savingsVsNextOffer
        : 0,
  };
}


function buildCostComparisonMessage(
  meta,
  comparedOffers
) {
  if (
    comparedOffers <= 1
  ) {
    return meta
      .finalCostConfirmed
        ? "Ho trovato una sola offerta: il costo finale verificato include anche la spedizione."
        : "Ho trovato una sola offerta, ma la spedizione non è ancora disponibile: il costo finale resta da verificare.";
  }

  if (
    meta.finalCostConfirmed &&
    meta.unknownShippingOffers ===
      0
  ) {
    return `Questa è l'offerta con il costo finale più basso tra ${comparedOffers} offerte comparabili, includendo la spedizione.`;
  }

  if (
    meta.finalCostConfirmed
  ) {
    return "Questa offerta ha un costo finale verificato che resta più basso anche rispetto al prezzo base delle offerte con spedizione non disponibile.";
  }

  return "Questa offerta ha il prezzo indicato più basso, ma non posso confermare il costo finale perché la spedizione non è disponibile per tutte le offerte.";
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

  const cost =
    buildCostRecommendationMeta(
      bestOffer,
      comparableOffers
    );

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
    ...cost,
    message:
      buildCostComparisonMessage(
        cost,
        comparableOffers.length
      ),
  };
}


// ========================================
// RACCOMANDAZIONE GENERICA PRICE-FIRST
// ========================================

function buildGenericPriceRecommendation(
  bestOffer,
  offers,
  scope
) {
  if (!bestOffer) {
    return null;
  }

  const scopePhrase =
    scope === "product_line"
      ? "sulla linea"
      : "sul modello";

  const cost =
    buildCostRecommendationMeta(
      bestOffer,
      offers
    );

  return {
    reason:
      "generic_price_first",
    comparisonScope:
      scope,
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
      productLineId:
        bestOffer.productLineId ||
        null,
      model:
        bestOffer.model ||
        null,
      color:
        bestOffer.color ||
        null,
    },
    ...cost,
    message:
      "Richiesta generica " +
      scopePhrase +
      ". " +
      buildCostComparisonMessage(
        cost,
        offers.length
      ),
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

  const cost =
    buildCostRecommendationMeta(
      bestOffer,
      offers
    );

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

    ...cost,

    message:
      buildCostComparisonMessage(
        cost,
        offers.length
      ),
  };
}


// ========================================
// SPIEGAZIONE RACCOMANDAZIONE
// ========================================

const CRITERION_LABELS = {
  camera: "fotocamera",
  battery: "batteria",
  performance: "prestazioni",
  display: "display",
  software: "software",
  value: "rapporto qualità/prezzo",
  sound: "audio",
  anc: "cancellazione del rumore",
  comfort: "comfort",
  portability: "portabilità",
  overall: "valutazione generale",
};

function getKnowledgeSource(knowledge, sourceId) {
  if (!sourceId || !Array.isArray(knowledge?.sources)) {
    return null;
  }
  return knowledge.sources.find(source => source?.id === sourceId) || null;
}

function buildRankingEvidence(winner, bestOffer) {
  const knowledge = bestOffer?.knowledge;
  const used = Array.isArray(winner?.ranking?.usedCriteria)
    ? winner.ranking.usedCriteria
    : [];
  if (!knowledge || used.length === 0) {
    return [];
  }
  return used.map(item => {
    const criterion = item?.criterion;
    if (!criterion) {
      return null;
    }
    const meta = knowledge?.scoreMeta?.[criterion] || null;
    const evidence = Array.isArray(knowledge?.evidence)
      ? knowledge.evidence.find(entry =>
          entry?.criterion === criterion &&
          entry?.rankingEligible !== false &&
          (typeof item.rawScore !== "number" || entry?.score === item.rawScore)
        )
      : null;
    const sourceId = meta?.sourceId || evidence?.sourceId || null;
    const source = getKnowledgeSource(knowledge, sourceId);
    return {
      criterion,
      label: CRITERION_LABELS[criterion] || criterion,
      score: typeof item.rawScore === "number" ? item.rawScore : null,
      normalizedScore: typeof item.normalizedScore === "number" ? item.normalizedScore : null,
      protocol: meta?.protocol || evidence?.protocol || null,
      sourceId,
      sourceName: source?.name || null,
      sourceUrl: source?.url || null,
    };
  }).filter(Boolean);
}

function buildVerifiedFactHighlights(bestOffer) {
  const knowledge = bestOffer?.knowledge;
  const facts = knowledge?.facts;
  if (!facts || typeof facts !== "object") {
    return [];
  }
  const highlights = [];
  const push = (key, label, value) => {
    if (value === null || value === undefined || value === "") {
      return;
    }
    highlights.push({ key, label, value: String(value), usedForRanking: false });
  };
  if (typeof facts?.camera?.mainMp === "number") {
    push("camera", "Fotocamera principale", facts.camera.mainMp + " MP");
  }
  if (typeof facts?.battery?.capacityMah === "number") {
    push("battery", "Batteria", facts.battery.capacityMah + " mAh");
  }
  const supportYears = facts?.software?.supportYears ??
    facts?.software?.minimumSupportYears ??
    facts?.software?.securityUpdateYears ?? null;
  if (typeof supportYears === "number") {
    push("software", "Supporto software dichiarato", supportYears + " anni");
  }
  const refreshRate = facts?.display?.refreshHz ?? facts?.display?.refreshHzMax ?? null;
  if (typeof refreshRate === "number") {
    push("display", "Refresh rate display", "fino a " + refreshRate + " Hz");
  }
  if (facts?.performance?.chip) {
    push("performance", "Chip", facts.performance.chip);
  }
  return highlights.slice(0, 4);
}

function getRecommendationConfidence(partialCriteria, missingCriteria, excludedFamilies) {
  if (missingCriteria.length === 0 && partialCriteria.length === 0 && excludedFamilies === 0) {
    return "high";
  }
  return "medium";
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

  const cost =
    buildCostRecommendationMeta(
      bestOffer,
      winner.offers ||
        [
          bestOffer,
        ]
    );

  const rankingEvidence =
    buildRankingEvidence(
      winner,
      bestOffer
    );

  const verifiedFacts =
    buildVerifiedFactHighlights(
      bestOffer
    );

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

    rankingEvidence,

    verifiedFacts,

    store:
      bestOffer.store,

    price:
      bestOffer.offer_price,

    currency:
      bestOffer.currency ||
      "EUR",

    ...cost,

    message:
      "Questo modello risulta il più adatto secondo i criteri disponibili. " +
      buildCostComparisonMessage(
        cost,
        winner.offers
          ?.length ||
        1
      ),
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

  const partialCriteria =
    analysis
      ?.dataCoverage
      ?.partialObjectives
      ?.map(
        item =>
          item.criterion
      ) || [];

  const excludedFamilies =
    analysis
      ?.dataCoverage
      ?.excludedFamilies ||
    0;

  const offerCost =
    buildCostRecommendationMeta(
      bestOffer,
      winner.offers ||
        [
          bestOffer,
        ]
    );

  const rankingEvidence =
    buildRankingEvidence(
      winner,
      bestOffer
    );

  const verifiedFacts =
    buildVerifiedFactHighlights(
      bestOffer
    );

  const confidence =
    getRecommendationConfidence(
      partialCriteria,
      missingCriteria,
      excludedFamilies
    );

  let message =
    `Per l'uso "${analysis.need?.useCase?.label || "generale"}", questo è il modello che risulta più adatto usando i dati comparabili disponibili.`;

  if (rankingEvidence.length > 0) {
    const evidenceText =
      rankingEvidence
        .map(item =>
          item.score !== null
            ? item.label + ": " + item.score +
              (item.protocol ? " (" + item.protocol + ")" : "")
            : item.label
        )
        .join(", ");

    message +=
      " Il ranking ha usato dati comparabili verificati: " + evidenceText + ".";
  }

  if (verifiedFacts.length > 0) {
    const factsText =
      verifiedFacts
        .map(item => item.label + ": " + item.value)
        .join(", ");

    message +=
      " Dati verificati sul prodotto, non usati come punteggio: " + factsText + ".";
  }

  if (
    partialCriteria.length > 0 &&
    excludedFamilies > 0
  ) {
    message +=
      ` Per ${partialCriteria.join(", ")}, ho classificato solo i modelli con dati verificati comparabili; ${excludedFamilies} ${excludedFamilies === 1 ? "famiglia compatibile non è stata classificata" : "famiglie compatibili non sono state classificate"} per mancanza di dati sufficienti.`;
  }

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

    partialCriteria,

    excludedFamilies,

    confidence,

    rankingEvidence,

    verifiedFacts,

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

    ...offerCost,

    message:
      message +
      " " +
      buildCostComparisonMessage(
        offerCost,
        winner.offers
          ?.length ||
        1
      ),
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
      requestId:
        req.requestId ||
        null,
      sources:
        sourceRegistry
          .getSourcesStatus(),
      runtime: {
        node:
          process.version,
        environment:
          process.env.NODE_ENV ||
          "development",
        uptimeSeconds:
          Math.floor(
            process.uptime()
          ),
      },
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
    res,
    next
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

      const hardRequirements =
        detectHardRequirements(
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

      const rawResults =
        sourceSearch.results;

      const results =
        filterOffersByHardRequirements(
          rawResults,
          hardRequirements
        );

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
            (
              analysis.scope ===
                "product_line" ||
              analysis.scope ===
                "family"
            )
              ? buildGenericPriceRecommendation(
                  bestOffer,
                  comparableResults,
                  analysis.scope
                )
              : buildEquivalentRecommendation(
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
            hardRequirements,
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
            hardRequirements,
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
            hardRequirements,
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
            hardRequirements,

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
      return next(
        error
      );
    }
  }
);


// ========================================
// 404
// ========================================

app.use(
  (
    req,
    res
  ) => {
    res
      .status(404)
      .json({
        error:
          "Risorsa non trovata.",
        requestId:
          req.requestId ||
          null,
      });
  }
);


// ========================================
// ERROR HANDLER
// ========================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    if (
      res.headersSent
    ) {
      return next(
        error
      );
    }

    const status =
      Number.isInteger(
        error?.status
      ) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 500;

    logError(
      "http_error",
      error,
      {
        requestId:
          req.requestId ||
          null,
        method:
          req.method,
        path:
          req.path,
        status,
      }
    );

    const message =
      status === 403
        ? "Richiesta non autorizzata."
        : "Errore interno del server.";

    return res
      .status(status)
      .json({
        error:
          message,
        requestId:
          req.requestId ||
          null,
      });
  }
);


// ========================================
// START
// ========================================

app.listen(
  PORT,
  HOST,

  () => {
    logInfo(
      "server_started",
      {
        host:
          HOST,
        port:
          PORT,
        environment:
          process.env.NODE_ENV ||
          "development",
        node:
          process.version,
      }
    );
  }
);

