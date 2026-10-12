// recommendationEngine.js
//
// Motore RECOMMENDATION v1 di DaniSua.
//
// Obiettivo:
// trasformare una richiesta naturale del tipo:
//
// "Mi serve un portatile per l'università"
//
// in priorità strutturate che il motore
// di ranking possa utilizzare.


// ========================================
// NORMALIZZARE TESTO
// ========================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


// ========================================
// PROFILI DI UTILIZZO
//
// Questi pesi sono PROVVISORI.
// Servono per la prima architettura.
//
// In futuro potranno arrivare da:
// - configurazione
// - dati utenti
// - modelli AI
// - test reali
// ========================================

const USE_CASE_PROFILES = [
  // ------------------------------------
  // LAPTOP / PORTATILI
  // ------------------------------------

  {
    id: "laptop_university",

    category: "portatil",

    signals: [
      "universita",
      "universitario",
      "universitaria",
      "studio",
      "studiare",
      "studenti",
      "studente",
      "lezioni",
    ],

    label:
      "studio e università",

    objectives: [
      {
        criterion:
          "portability",

        weight: 1.2,
      },

      {
        criterion:
          "battery",

        weight: 1.2,
      },

      {
        criterion:
          "performance",

        weight: 0.8,
      },

      {
        criterion:
          "value",

        weight: 1,
      },
    ],
  },

  {
    id: "laptop_gaming",

    category: "portatil",

    signals: [
      "gaming",
      "giocare",
      "videogiochi",
      "giochi",
      "game",
    ],

    label:
      "gaming",

    objectives: [
      {
        criterion:
          "performance",

        weight: 1.5,
      },

      {
        criterion:
          "display",

        weight: 1,
      },

      {
        criterion:
          "battery",

        weight: 0.4,
      },

      {
        criterion:
          "portability",

        weight: 0.3,
      },
    ],
  },

  {
    id: "laptop_work",

    category: "portatil",

    signals: [
      "lavoro",
      "lavorare",
      "ufficio",
      "office",
      "professionale",
      "professionista",
    ],

    label:
      "lavoro",

    objectives: [
      {
        criterion:
          "performance",

        weight: 1,
      },

      {
        criterion:
          "battery",

        weight: 1,
      },

      {
        criterion:
          "portability",

        weight: 0.8,
      },

      {
        criterion:
          "value",

        weight: 0.8,
      },
    ],
  },


  // ------------------------------------
  // SMARTPHONE
  // ------------------------------------

  {
    id: "smartphone_photography",

    category: "smartphone",

    signals: [
      "foto",
      "fotografia",
      "fotografie",
      "fotocamera",
      "camera",
      "video",
      "instagram",
      "tiktok",
    ],

    label:
      "foto e video",

    objectives: [
      {
        criterion:
          "camera",

        weight: 1.5,
      },

      {
        criterion:
          "battery",

        weight: 0.8,
      },

      {
        criterion:
          "display",

        weight: 0.7,
      },

      {
        criterion:
          "performance",

        weight: 0.6,
      },
    ],
  },

  {
    id: "smartphone_general",

    category: "smartphone",

    signals: [
      "uso quotidiano",
      "tutti i giorni",
      "uso normale",
      "normale",
      "quotidiano",
    ],

    label:
      "uso quotidiano",

    objectives: [
      {
        criterion:
          "battery",

        weight: 1,
      },

      {
        criterion:
          "performance",

        weight: 0.8,
      },

      {
        criterion:
          "camera",

        weight: 0.8,
      },

      {
        criterion:
          "value",

        weight: 1,
      },
    ],
  },


  // ------------------------------------
  // CUFFIE
  // ------------------------------------

  {
    id: "headphones_travel",

    category: "auriculares",

    signals: [
      "viaggio",
      "viaggiare",
      "aereo",
      "treno",
      "rumore",
      "trasporto",
    ],

    label:
      "viaggi",

    objectives: [
      {
        criterion:
          "anc",

        weight: 1.5,
      },

      {
        criterion:
          "comfort",

        weight: 1,
      },

      {
        criterion:
          "battery",

        weight: 1,
      },

      {
        criterion:
          "sound",

        weight: 0.8,
      },
    ],
  },

  {
    id: "headphones_music",

    category: "auriculares",

    signals: [
      "musica",
      "ascoltare musica",
      "audio",
      "suono",
    ],

    label:
      "musica",

    objectives: [
      {
        criterion:
          "sound",

        weight: 1.5,
      },

      {
        criterion:
          "comfort",

        weight: 0.8,
      },

      {
        criterion:
          "battery",

        weight: 0.6,
      },
    ],
  },
];


// ========================================
// PROFILO DI DEFAULT PER CATEGORIA
//
// Utilizzato quando sappiamo la categoria
// ma non capiamo ancora l'uso.
// ========================================

const CATEGORY_DEFAULTS = {
  smartphone: {
    label:
      "uso generale",

    objectives: [
      {
        criterion:
          "overall",

        weight: 1,
      },
    ],
  },

  portatil: {
    label:
      "uso generale",

    objectives: [
      {
        criterion:
          "overall",

        weight: 1,
      },
    ],
  },

  auriculares: {
    label:
      "uso generale",

    objectives: [
      {
        criterion:
          "overall",

        weight: 1,
      },
    ],
  },

  consola: {
    label:
      "uso generale",

    objectives: [
      {
        criterion:
          "overall",

        weight: 1,
      },
    ],
  },
};


// ========================================
// TROVARE PROFILO
// ========================================

function detectUseCase(
  query,
  category
) {
  const q =
    normalizeText(query);

  if (!category) {
    return null;
  }

  const candidates =
    USE_CASE_PROFILES.filter(
      profile =>
        profile.category ===
        category
    );

  for (
    const profile of
    candidates
  ) {
    const matchedSignals =
      profile.signals.filter(
        signal =>
          q.includes(
            normalizeText(
              signal
            )
          )
      );

    if (
      matchedSignals.length >
      0
    ) {
      return {
        id:
          profile.id,

        category:
          profile.category,

        label:
          profile.label,

        objectives:
          profile.objectives.map(
            objective => ({
              ...objective,
            })
          ),

        matchedSignals,
      };
    }
  }

  return null;
}


// ========================================
// PROFILO DEFAULT
// ========================================

function getDefaultProfile(
  category
) {
  const profile =
    CATEGORY_DEFAULTS[
      category
    ];

  if (!profile) {
    return null;
  }

  return {
    id:
      `${category}_general`,

    category,

    label:
      profile.label,

    objectives:
      profile.objectives.map(
        objective => ({
          ...objective,
        })
      ),

    matchedSignals: [],
  };
}


// ========================================
// UNIRE OBIETTIVI
//
// Se la query contiene anche preferenze
// esplicite, per esempio:
//
// "portatile per università con buona batteria"
//
// possiamo aumentare il peso del criterio
// esplicitamente richiesto.
// ========================================

function mergeObjectives(
  baseObjectives,
  explicitObjectives
) {
  const map =
    new Map();

  for (
    const objective of
    baseObjectives || []
  ) {
    map.set(
      objective.criterion,
      {
        criterion:
          objective.criterion,

        weight:
          objective.weight || 1,

        source:
          "use_case",
      }
    );
  }

  for (
    const objective of
    explicitObjectives || []
  ) {
    const criterion =
      objective.criterion;

    if (!criterion) {
      continue;
    }

    const current =
      map.get(
        criterion
      );

    if (current) {
      map.set(
        criterion,
        {
          ...current,

          weight:
            Math.max(
              current.weight,
              1.5
            ),

          source:
            "use_case+explicit",
        }
      );
    } else {
      map.set(
        criterion,
        {
          criterion,

          weight: 1.5,

          source:
            "explicit",
        }
      );
    }
  }

  return Array.from(
    map.values()
  );
}


// ========================================
// ANALIZZARE RICHIESTA
// ========================================

function analyzeRecommendationNeed(
  query,
  {
    category = null,
    explicitObjectives = [],
  } = {}
) {
  if (!category) {
    return {
      status:
        "needs_category",

      canRank: false,

      message:
        "Devo capire quale tipo di prodotto stai cercando.",

      useCase: null,

      objectives: [],
    };
  }

  const detectedProfile =
    detectUseCase(
      query,
      category
    );

  const profile =
    detectedProfile ||
    getDefaultProfile(
      category
    );

  if (!profile) {
    return {
      status:
        "unsupported_category",

      canRank: false,

      message:
        "Non ho ancora un profilo di raccomandazione per questa categoria.",

      useCase: null,

      objectives:
        explicitObjectives,
    };
  }

  const objectives =
    mergeObjectives(
      profile.objectives,
      explicitObjectives
    );

  return {
    status:
      detectedProfile
        ? "use_case_detected"
        : "general_use",

    canRank: true,

    message:
      detectedProfile
        ? `Ho capito che il prodotto ti serve per ${profile.label}.`
        : "Ho identificato la categoria, ma non un utilizzo specifico. Userò criteri generali.",

    useCase: {
      id:
        profile.id,

      label:
        profile.label,

      matchedSignals:
        profile.matchedSignals,
    },

    objectives,
  };
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  USE_CASE_PROFILES,

  CATEGORY_DEFAULTS,

  detectUseCase,

  getDefaultProfile,

  mergeObjectives,

  analyzeRecommendationNeed,
};