const localSource = require("./local");
const databaseSource = require("./database");

const {
  attachTrust,
} = require("../utils/trustPolicy");

const {
  validateOffers,
} = require("../utils/offerContract");

const {
  filterOffersByMarketCurrency,
} = require("../utils/marketPolicy");

const {
  evaluateOfferFreshness,
  evaluateOfferReliability,
  summarizeOfferFreshness,
} = require("../utils/freshness");


// ========================================
// DANISUA — SOURCE REGISTRY
//
// Fonti attive oggi:
//
// 1. local
//    JSON di test / sviluppo
//
// 2. database
//    offerte persistite che hanno già
//    attraversato ingestion + matching
//
// FUTURO:
//
// Awin / eBay non devono essere aggiunti
// qui finché non conosciamo il loro
// formato reale.
//
// Il percorso previsto per i feed è:
//
// feed
//   ↓
// mapper
//   ↓
// normalizers
//   ↓
// staging
//   ↓
// matching
//   ↓
// SQLite
//   ↓
// databaseSource
//   ↓
// registry
// ========================================


// ========================================
// FONTI DISPONIBILI
// ========================================

const SOURCE_CONFIG = [
  {
    source:
      localSource,

    enabled:
      true,
  },

  {
    source:
      databaseSource,

    enabled:
      true,
  },
];


// ========================================
// VALIDARE UNA FONTE
// ========================================

function isValidSource(
  source
) {
  return Boolean(
    source &&
    typeof source.name ===
      "string" &&
    source.name.trim() &&
    typeof source.search ===
      "function"
  );
}


// ========================================
// FONTI ATTIVE
// ========================================

function getEnabledSources() {
  return SOURCE_CONFIG
    .filter(
      item =>
        item.enabled ===
          true &&
        isValidSource(
          item.source
        )
    )
    .map(
      item =>
        item.source
    );
}


// ========================================
// STATO RUNTIME FONTE
// ========================================

function getRuntimeStatus(
  source
) {
  if (
    !source ||
    typeof source.getStatus !==
      "function"
  ) {
    return null;
  }


  try {
    return (
      source.getStatus() ||
      null
    );
  } catch (error) {
    return {
      available:
        false,

      error:
        error?.message ||
        String(
          error ||
          "Unknown error"
        ),
    };
  }
}


// ========================================
// STATO FONTI
// ========================================

function getSourcesStatus() {
  return SOURCE_CONFIG.map(
    item => {
      const source =
        item.source;


      const runtime =
        getRuntimeStatus(
          source
        );


      return {
        name:
          source?.name ||
          "unknown",

        enabled:
          item.enabled ===
          true,

        valid:
          isValidSource(
            source
          ),

        ...(runtime
          ? {
              runtime,
            }
          : {}),
      };
    }
  );
}


// ========================================
// NORMALIZZARE RISULTATI
// ========================================

function normalizeSourceResults(
  sourceName,
  results
) {
  if (
    !Array.isArray(
      results
    )
  ) {
    return [];
  }


  return results
    .filter(Boolean)
    .map(
      item => ({
        ...item,

        // Una fonte DB può contenere
        // l'origine commerciale reale,
        // ad esempio "awin-unieuro".
        //
        // Non la sostituiamo con
        // "database".
        source:
          item.source ||
          sourceName,
      })
    );
}


// ========================================
// RIASSUNTO ERRORI CONTRATTO
// ========================================

function summarizeContractErrors(
  rejected
) {
  const summary = {};


  if (
    !Array.isArray(
      rejected
    )
  ) {
    return summary;
  }


  for (
    const item of rejected
  ) {
    const errors =
      Array.isArray(
        item.errors
      )
        ? item.errors
        : [];


    for (
      const error of errors
    ) {
      summary[error] =
        (
          summary[error] ||
          0
        ) +
        1;
    }
  }


  return summary;
}


// ========================================
// AGGIUNGERE TRUST
// ========================================

function applyTrustPolicy(
  offers
) {
  if (
    !Array.isArray(
      offers
    )
  ) {
    return [];
  }


  return offers
    .map(
      offer =>
        attachTrust(
          offer
        )
    )
    .filter(Boolean);
}


// ========================================
// FRESHNESS / RELIABILITY POLICY
//
// Ogni fonte attraversa qui la stessa
// valutazione. In questo modo una offerta
// dal database non può aggirare il guard
// solo perché il source non aveva già
// allegato freshness.
// ========================================

function applyFreshnessPolicy(
  offers,
  options = {}
) {
  if (!Array.isArray(offers)) {
    return [];
  }

  const reliabilityOptions = {
    ...options,

    // I fixture locali storici non hanno
    // timestamp. Manteniamo la possibilità
    // di testarli fuori produzione senza
    // indebolire la policy reale.
    allowUnknownForRecommendation:
      options
        .allowUnknownForRecommendation ??
      (
        process.env.NODE_ENV !==
        "production"
      ),
  };

  return offers
    .filter(Boolean)
    .map(
      offer => ({
        ...offer,

        freshness:
          evaluateOfferFreshness(
            offer,
            options
          ),

        reliability:
          evaluateOfferReliability(
            offer,
            reliabilityOptions
          ),
      })
    );
}


// ========================================
// FILTRO BETA
// ========================================

function filterTrustedBetaOffers(
  offers
) {
  if (
    !Array.isArray(
      offers
    )
  ) {
    return [];
  }


  return offers.filter(
    offer =>
      offer.trust
        ?.betaEligible ===
      true
  );
}


// ========================================
// RIMUOVERE DUPLICATI ESATTI
//
// Questa NON è ancora entity matching.
//
// Se la stessa offerta appare sia in una
// fonte diretta sia nel DB con stessa
// source + id, viene mantenuta una volta.
// ========================================

function deduplicateOffers(
  offers
) {
  const map =
    new Map();


  for (
    const offer of offers
  ) {
    if (!offer) {
      continue;
    }


    const source =
      offer.source ||
      "unknown";


    const id =
      offer.id ||
      [
        offer.store,
        offer.productId,
        offer.offer_price,
        offer.url,
      ]
        .filter(Boolean)
        .join("|");


    const key =
      `${source}:${id}`;


    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        offer
      );
    }
  }


  return Array.from(
    map.values()
  );
}


// ========================================
// CERCARE SU TUTTE LE FONTI
// ========================================

async function searchAll(
  query,
  {
    limitPerSource = 100,
    totalLimit = 300,
    betaOnly = true,
  } = {}
) {
  const sources =
    getEnabledSources();


  // ====================================
  // NESSUNA FONTE
  // ====================================

  if (
    sources.length ===
    0
  ) {
    return {
      results: [],

      diagnostics: {
        sourcesQueried:
          [],

        sourcesSucceeded:
          [],

        sourcesFailed:
          [],

        totalRaw:
          0,

        totalValid:
          0,

        totalRejectedByContract:
          0,

        contractErrors:
          {},

        totalAfterTrust:
          0,

        totalRejectedByTrust:
          0,

        totalAfterDeduplication:
          0,

        returned:
          0,

        betaOnly,
      },
    };
  }


  // ====================================
  // CERCARE IN PARALLELO
  //
  // Una fonte può fallire senza
  // bloccare tutte le altre.
  // ====================================

  const settled =
    await Promise.allSettled(
      sources.map(
        source =>
          source.search(
            query,
            {
              limit:
                limitPerSource,
            }
          )
      )
    );


  const combinedResults = [];

  const sourcesSucceeded = [];

  const sourcesFailed = [];


  // ====================================
  // RACCOGLIERE RISULTATI
  // ====================================

  settled.forEach(
    (
      result,
      index
    ) => {
      const source =
        sources[index];


      if (
        result.status ===
        "fulfilled"
      ) {
        const normalized =
          normalizeSourceResults(
            source.name,
            result.value
          );


        combinedResults.push(
          ...normalized
        );


        sourcesSucceeded.push({
          name:
            source.name,

          count:
            normalized.length,
        });


        return;
      }


      sourcesFailed.push({
        name:
          source.name,

        error:
          result.reason
            ?.message ||
          String(
            result.reason ||
            "Unknown error"
          ),
      });
    }
  );


  // ====================================
  // OFFER CONTRACT
  //
  // Anche le offerte lette dal database
  // vengono validate nuovamente.
  //
  // Il DB non è considerato una scorciatoia
  // per aggirare le regole DaniSua.
  // ====================================

  const contractValidation =
    validateOffers(
      combinedResults
    );


  const validResults =
    contractValidation.accepted;


  const rejectedByContract =
    contractValidation.rejected;


  const contractErrors =
    summarizeContractErrors(
      rejectedByContract
    );


  // ====================================
  // MARKET POLICY
  //
  // Italia beta: non confrontiamo valori
  // numerici appartenenti a valute diverse.
  // Il default è EUR ed è configurabile.
  // ====================================

  const marketValidation =
    filterOffersByMarketCurrency(
      validResults
    );

  const marketResults =
    marketValidation.accepted;

  const rejectedByMarketCurrency =
    marketValidation.rejected;


  // ====================================
  // TRUST POLICY
  //
  // Anche qui rivalutiamo la trust policy
  // prima di mostrare l'offerta.
  // ====================================

  const withTrust =
    applyTrustPolicy(
      marketResults
    );


  // ====================================
  // FILTRO BETA
  // ====================================

  const trustedResults =
    betaOnly
      ? filterTrustedBetaOffers(
          withTrust
        )
      : withTrust;


  const rejectedByTrust =
    withTrust.length -
    trustedResults.length;


  // ====================================
  // FRESHNESS / RELIABILITY
  // ====================================

  const evaluatedResults =
    applyFreshnessPolicy(
      trustedResults
    );


  const freshnessSummary =
    summarizeOfferFreshness(
      evaluatedResults,
      {
        allowUnknown: false,
      }
    );


  // ====================================
  // DEDUPLICAZIONE
  // ====================================

  const deduplicated =
    deduplicateOffers(
      evaluatedResults
    );


  // ====================================
  // LIMITE TOTALE
  // ====================================

  const results =
    deduplicated.slice(
      0,
      totalLimit
    );


  // ====================================
  // RISPOSTA
  // ====================================

  return {
    results,

    diagnostics: {
      sourcesQueried:
        sources.map(
          source =>
            source.name
        ),

      sourcesSucceeded,

      sourcesFailed,

      totalRaw:
        combinedResults.length,

      totalValid:
        validResults.length,

      totalRejectedByContract:
        rejectedByContract.length,

      contractErrors,

      marketCurrency:
        marketValidation
          .marketCurrency,

      totalAfterMarket:
        marketResults.length,

      totalRejectedByMarketCurrency:
        rejectedByMarketCurrency.length,

      totalAfterTrust:
        trustedResults.length,

      totalRejectedByTrust:
        rejectedByTrust,

      freshness:
        freshnessSummary,

      totalAfterDeduplication:
        deduplicated.length,

      returned:
        results.length,

      betaOnly,
    },
  };
}


// ========================================
// RELIABILITY HEALTH SNAPSHOT
//
// Cache breve: /health viene chiamato spesso
// da Render. Evitiamo di rileggere tutte le
// fonti a ogni health check.
// ========================================

const RELIABILITY_HEALTH_CACHE_MS =
  60 * 1000;

let reliabilityHealthCache = {
  expiresAt: 0,
  value: null,
};


function summarizeReliabilityStates(
  offers
) {
  const summary = {
    total: 0,
    fresh: 0,
    review: 0,
    stale: 0,
    unknown: 0,
    invalid: 0,
    future: 0,
  };

  for (
    const offer of
    Array.isArray(offers)
      ? offers
      : []
  ) {
    const status =
      offer
        ?.reliability
        ?.status ||
      "unknown";

    summary.total += 1;

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          summary,
          status
        )
    ) {
      summary[
        status
      ] += 1;
    } else {
      summary.unknown += 1;
    }
  }

  return summary;
}


async function getReliabilityHealthSnapshot({
  now = Date.now(),
  force = false,
} = {}) {
  if (
    !force &&
    reliabilityHealthCache
      .value &&
    now <
      reliabilityHealthCache
        .expiresAt
  ) {
    return reliabilityHealthCache
      .value;
  }

  const search =
    await searchAll(
      "",
      {
        limitPerSource: 1000,
        totalLimit: 2000,
        betaOnly: true,
      }
    );

  const summary =
    summarizeReliabilityStates(
      search.results
    );

  const value = {
    available: true,

    ...summary,

    freshRatio:
      summary.total > 0
        ? Number(
            (
              summary.fresh /
              summary.total
            )
              .toFixed(
                4
              )
          )
        : null,

    requiresRefresh:
      summary.total -
      summary.fresh,

    sourceFailures:
      Array.isArray(
        search
          .diagnostics
          ?.sourcesFailed
      )
        ? search
            .diagnostics
            .sourcesFailed
            .length
        : 0,

    generatedAt:
      new Date(
        now
      )
        .toISOString(),
  };

  reliabilityHealthCache = {
    expiresAt:
      now +
      RELIABILITY_HEALTH_CACHE_MS,
    value,
  };

  return value;
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  getEnabledSources,
  getSourcesStatus,
  getRuntimeStatus,

  normalizeSourceResults,
  summarizeContractErrors,

  applyTrustPolicy,
  applyFreshnessPolicy,
  filterTrustedBetaOffers,

  deduplicateOffers,
  summarizeReliabilityStates,
  getReliabilityHealthSnapshot,
  searchAll,
};