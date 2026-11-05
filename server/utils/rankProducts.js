// rankProducts.js
// Motore di ranking DaniSua
//
// Livelli:
// FAMILY  -> modello, es. iPhone 15 Pro
// VARIANT -> es. iPhone 15 Pro 128 GB
// OFFER   -> es. Amazon / MediaWorld


// ========================================
// NUMERO VALIDO
// ========================================

function isFiniteNumber(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}


// ========================================
// CHIAVE GENERICA
// ========================================

function getEntityKey(entity) {
  if (!entity) {
    return null;
  }

  return (
    entity.familyId ||
    entity.productId ||
    null
  );
}


// ========================================
// VARIANTI UNICHE
//
// Raggruppa le offerte per productId.
// ========================================

function getUniqueProducts(offers) {
  if (!Array.isArray(offers)) {
    return [];
  }

  const map = new Map();

  for (const offer of offers) {
    if (!offer?.productId) {
      continue;
    }

    if (!map.has(offer.productId)) {
      map.set(
        offer.productId,
        {
          productId:
            offer.productId,

          familyId:
            offer.familyId ||
            offer.productId,

          title:
            offer.title || "",

          brand:
            offer.brand || "",

          model:
            offer.model || null,

          category:
            offer.category || null,

          storage:
            offer.storage || null,

          ram:
            offer.ram || null,

          color:
            offer.color || null,

          attributes:
            offer.attributes || {},

          knowledge:
            offer.knowledge || {
              scores: {},
              scoreMeta: {},
              facts: {},
              evidence: [],
              sources: [],
              updatedAt: null,
            },

          offers: [],
        }
      );
    }

    map
      .get(offer.productId)
      .offers
      .push(offer);
  }

  return Array.from(
    map.values()
  );
}


// ========================================
// FAMIGLIE UNICHE
//
// Esempio:
//
// apple-iphone-15-pro
// ├── 128 GB
// └── 256 GB
// ========================================

function getUniqueFamilies(offers) {
  if (!Array.isArray(offers)) {
    return [];
  }

  const familyMap =
    new Map();

  for (const offer of offers) {
    if (!offer?.productId) {
      continue;
    }

    const familyId =
      offer.familyId ||
      offer.productId;

    if (
      !familyMap.has(
        familyId
      )
    ) {
      familyMap.set(
        familyId,
        {
          familyId,

          brand:
            offer.brand || "",

          model:
            offer.model || null,

          category:
            offer.category || null,

          title:
            [
              offer.brand,
              offer.model,
            ]
              .filter(Boolean)
              .join(" "),

          offers: [],

          variantsMap:
            new Map(),
        }
      );
    }

    const family =
      familyMap.get(
        familyId
      );

    family.offers.push(
      offer
    );

    if (
      !family.variantsMap.has(
        offer.productId
      )
    ) {
      family.variantsMap.set(
        offer.productId,
        {
          productId:
            offer.productId,

          familyId,

          title:
            offer.title || "",

          brand:
            offer.brand || "",

          model:
            offer.model || null,

          category:
            offer.category || null,

          storage:
            offer.storage || null,

          ram:
            offer.ram || null,

          color:
            offer.color || null,

          attributes:
            offer.attributes || {},

          knowledge:
            offer.knowledge || {
              scores: {},
              scoreMeta: {},
              facts: {},
              evidence: [],
              sources: [],
              updatedAt: null,
            },

          offers: [],
        }
      );
    }

    family
      .variantsMap
      .get(
        offer.productId
      )
      .offers
      .push(offer);
  }

  return Array.from(
    familyMap.values()
  ).map(
    family => ({
      familyId:
        family.familyId,

      title:
        family.title,

      brand:
        family.brand,

      model:
        family.model,

      category:
        family.category,

      variants:
        Array.from(
          family
            .variantsMap
            .values()
        ),

      offers:
        family.offers,
    })
  );
}


// ========================================
// OFFERTA COMPARABILE DI DEFAULT
//
// Un prezzo condizionato (permuta,
// abbonamento, finanziamento obbligatorio,
// coupon non verificato al checkout, ecc.)
// non deve battere un prezzo standard
// nella classifica normale.
// ========================================

function isDefaultComparableOffer(offer) {
  if (!offer || typeof offer !== "object") {
    return false;
  }

  if (
    offer.pricing &&
    typeof offer.pricing === "object" &&
    offer.pricing.conditional === true
  ) {
    return false;
  }

  if (
    offer.freshness &&
    offer.freshness
      .eligibleForRecommendation ===
      false
  ) {
    return false;
  }

  return isFiniteNumber(
    offer.offer_price
  );
}


// ========================================
// COSTO FINALE / SPEDIZIONE
// ========================================

function roundMoney(value) {
  return Number(
    value.toFixed(2)
  );
}


function getKnownFinalCost(offer) {
  if (
    !isDefaultComparableOffer(
      offer
    )
  ) {
    return null;
  }

  if (
    !isFiniteNumber(
      offer.shipping_price
    ) ||
    offer.shipping_price < 0
  ) {
    return null;
  }

  return roundMoney(
    offer.offer_price +
    offer.shipping_price
  );
}


function getOfferDecisionCost(offer) {
  if (!offer) {
    return null;
  }

  const finalCost =
    offer
      ?.costComparison
      ?.finalCost;

  if (
    isFiniteNumber(
      finalCost
    )
  ) {
    return finalCost;
  }

  const directFinalCost =
    getKnownFinalCost(
      offer
    );

  if (
    isFiniteNumber(
      directFinalCost
    )
  ) {
    return directFinalCost;
  }

  return isFiniteNumber(
    offer.offer_price
  )
    ? offer.offer_price
    : null;
}


function decorateSelectedOffer(
  offer,
  comparison
) {
  if (!offer) {
    return null;
  }

  return {
    ...offer,

    costComparison: {
      mode:
        comparison.mode,

      finalCost:
        comparison.finalCost,

      shippingKnown:
        comparison.shippingKnown,

      confirmedFinalCost:
        comparison.confirmedFinalCost,

      comparedOffers:
        comparison.comparedOffers,

      unknownShippingOffers:
        comparison
          .unknownShippingOffers,
    },
  };
}


function getOfferSelection(offers) {
  const validOffers =
    Array.isArray(offers)
      ? offers.filter(
          offer =>
            isDefaultComparableOffer(
              offer
            )
        )
      : [];

  if (
    validOffers.length === 0
  ) {
    return {
      bestOffer: null,
      mode:
        "no_comparable_offer",
      finalCost: null,
      shippingKnown: false,
      confirmedFinalCost: false,
      comparedOffers: 0,
      unknownShippingOffers: 0,
    };
  }

  const known = [];
  const unknown = [];

  for (
    const offer of
    validOffers
  ) {
    const finalCost =
      getKnownFinalCost(
        offer
      );

    if (
      isFiniteNumber(
        finalCost
      )
    ) {
      known.push({
        offer,
        finalCost,
      });
    } else {
      unknown.push(
        offer
      );
    }
  }

  const lowestListed =
    validOffers.reduce(
      (best, offer) =>
        offer.offer_price <
        best.offer_price
          ? offer
          : best
    );

  if (
    known.length === 0
  ) {
    const comparison = {
      mode:
        "listed_price_shipping_unknown",
      finalCost: null,
      shippingKnown: false,
      confirmedFinalCost: false,
      comparedOffers:
        validOffers.length,
      unknownShippingOffers:
        unknown.length,
    };

    return {
      ...comparison,
      bestOffer:
        decorateSelectedOffer(
          lowestListed,
          comparison
        ),
    };
  }

  const lowestKnown =
    known.reduce(
      (best, item) =>
        item.finalCost <
        best.finalCost
          ? item
          : best
    );

  if (
    unknown.length === 0
  ) {
    const comparison = {
      mode:
        "final_cost_confirmed",
      finalCost:
        lowestKnown.finalCost,
      shippingKnown: true,
      confirmedFinalCost: true,
      comparedOffers:
        validOffers.length,
      unknownShippingOffers: 0,
    };

    return {
      ...comparison,
      bestOffer:
        decorateSelectedOffer(
          lowestKnown.offer,
          comparison
        ),
    };
  }

  const lowestUnknown =
    unknown.reduce(
      (best, offer) =>
        offer.offer_price <
        best.offer_price
          ? offer
          : best
    );

  if (
    lowestKnown.finalCost <=
    lowestUnknown.offer_price
  ) {
    const comparison = {
      mode:
        "final_cost_confirmed_with_unknown_shipping",
      finalCost:
        lowestKnown.finalCost,
      shippingKnown: true,
      confirmedFinalCost: true,
      comparedOffers:
        validOffers.length,
      unknownShippingOffers:
        unknown.length,
    };

    return {
      ...comparison,
      bestOffer:
        decorateSelectedOffer(
          lowestKnown.offer,
          comparison
        ),
    };
  }

  const comparison = {
    mode:
      "listed_price_provisional",
    finalCost: null,
    shippingKnown: false,
    confirmedFinalCost: false,
    comparedOffers:
      validOffers.length,
    unknownShippingOffers:
      unknown.length,
  };

  return {
    ...comparison,
    bestOffer:
      decorateSelectedOffer(
        lowestUnknown,
        comparison
      ),
  };
}


// ========================================
// MIGLIORE OFFERTA
//
// Funziona sia con:
// - variante
// - famiglia
// ========================================

function getLowestOffer(entity) {
  if (
    !entity ||
    !Array.isArray(
      entity.offers
    )
  ) {
    return null;
  }

  return getOfferSelection(
    entity.offers
  ).bestOffer;
}


// ========================================
// SCORE DELLA VARIANTE
// ========================================

function getVariantScore(
  product,
  criterion
) {
  const value =
    product
      ?.knowledge
      ?.scores
      ?.[criterion];

  return isFiniteNumber(value)
    ? value
    : null;
}


// ========================================
// SCORE DELLA FAMIGLIA
//
// Regola prudente:
//
// Tutte le varianti devono avere
// uno score valido.
//
// Gli score devono inoltre essere uguali.
//
// Se differiscono, significa che il
// criterio può dipendere dalla variante.
//
// In quel caso NON inventiamo uno
// score unico per la famiglia.
// ========================================

function getFamilyScore(
  family,
  criterion
) {
  if (
    !family ||
    !Array.isArray(
      family.variants
    ) ||
    family.variants.length === 0
  ) {
    return null;
  }

  const scores =
    family.variants.map(
      variant =>
        getVariantScore(
          variant,
          criterion
        )
    );

  if (
    scores.some(
      score =>
        score === null
    )
  ) {
    return null;
  }

  const uniqueScores =
    [
      ...new Set(
        scores
      ),
    ];

  if (
    uniqueScores.length !== 1
  ) {
    return null;
  }

  return uniqueScores[0];
}


// ========================================
// SCORE GENERICO
//
// Capisce automaticamente se sta
// valutando una famiglia o variante.
// ========================================

function getScore(
  entity,
  criterion
) {
  if (!entity) {
    return null;
  }

  if (
    Array.isArray(
      entity.variants
    )
  ) {
    return getFamilyScore(
      entity,
      criterion
    );
  }

  return getVariantScore(
    entity,
    criterion
  );
}


// ========================================
// PROTOCOLLO SCORE / BENCHMARK
// ========================================

const INCOMPATIBLE_PROTOCOL =
  "__incompatible_protocol__";


function getVariantCriterionProtocol(
  product,
  criterion
) {
  const explicit =
    product
      ?.knowledge
      ?.scoreMeta
      ?.[criterion]
      ?.protocol;

  if (
    typeof explicit === "string" &&
    explicit.trim()
  ) {
    return explicit.trim();
  }

  const evidence =
    Array.isArray(
      product?.knowledge?.evidence
    )
      ? product.knowledge.evidence
      : [];

  const matching =
    evidence.find(
      item =>
        item?.criterion ===
          criterion &&
        item?.rankingEligible !==
          false &&
        typeof item?.protocol ===
          "string" &&
        item.protocol.trim()
    );

  return matching
    ?.protocol
    ?.trim() ||
    null;
}


function getFamilyCriterionProtocol(
  family,
  criterion
) {
  if (
    !family ||
    !Array.isArray(
      family.variants
    ) ||
    family.variants.length === 0
  ) {
    return null;
  }

  const scoredVariants =
    family.variants.filter(
      variant =>
        getVariantScore(
          variant,
          criterion
        ) !== null
    );

  if (
    scoredVariants.length === 0
  ) {
    return null;
  }

  const protocols =
    scoredVariants.map(
      variant =>
        getVariantCriterionProtocol(
          variant,
          criterion
        )
    );

  const knownProtocols =
    [
      ...new Set(
        protocols.filter(Boolean)
      ),
    ];

  if (
    knownProtocols.length > 1 ||
    (
      knownProtocols.length === 1 &&
      protocols.some(
        protocol => !protocol
      )
    )
  ) {
    return INCOMPATIBLE_PROTOCOL;
  }

  return knownProtocols[0] || null;
}


function getCriterionProtocol(
  entity,
  criterion
) {
  return Array.isArray(
    entity?.variants
  )
    ? getFamilyCriterionProtocol(
        entity,
        criterion
      )
    : getVariantCriterionProtocol(
        entity,
        criterion
      );
}


// ========================================
// NORMALIZZARE CRITERIO 0-100
// ========================================

function normalizeCriterionScores(
  entities,
  criterion
) {
  const valid =
    entities
      .map(entity => ({
        key:
          getEntityKey(
            entity
          ),

        rawScore:
          getScore(
            entity,
            criterion
          ),

        protocol:
          getCriterionProtocol(
            entity,
            criterion
          ),
      }))
      .filter(
        item =>
          item.key &&
          isFiniteNumber(
            item.rawScore
          )
      );

  const result =
    new Map();

  if (
    valid.length === 0
  ) {
    return result;
  }

  if (
    valid.some(
      item =>
        item.protocol ===
        INCOMPATIBLE_PROTOCOL
    )
  ) {
    return result;
  }

  const protocols =
    [
      ...new Set(
        valid
          .map(
            item =>
              item.protocol
          )
          .filter(Boolean)
      ),
    ];

  const hasUnknownProtocol =
    valid.some(
      item =>
        !item.protocol
    );

  if (
    protocols.length > 1 ||
    (
      protocols.length === 1 &&
      hasUnknownProtocol
    )
  ) {
    return result;
  }

  const values =
    valid.map(
      item =>
        item.rawScore
    );

  const min =
    Math.min(
      ...values
    );

  const max =
    Math.max(
      ...values
    );

  for (
    const item of
    valid
  ) {
    let normalized = 100;

    if (
      max !== min
    ) {
      normalized =
        (
          (
            item.rawScore -
            min
          ) /
          (
            max -
            min
          )
        ) *
        100;
    }

    result.set(
      item.key,

      Number(
        normalized.toFixed(2)
      )
    );
  }

  return result;
}

// ========================================
// RANKING PER UN CRITERIO
// ========================================

function rankByCriterion(
  entities,
  criterion = "overall"
) {
  if (
    !Array.isArray(entities)
  ) {
    return [];
  }

  const normalizedScores =
    normalizeCriterionScores(
      entities,
      criterion
    );

  return entities
    .map(entity => {
      const key =
        getEntityKey(
          entity
        );

      const rawScore =
        getScore(
          entity,
          criterion
        );

      const normalizedScore =
        normalizedScores.get(
          key
        );

      if (
        rawScore === null ||
        !isFiniteNumber(
          normalizedScore
        )
      ) {
        return null;
      }

      return {
        ...entity,

        ranking: {
          criterion,

          score:
            rawScore,

          normalizedScore,
        },
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) => {
        const difference =
          b.ranking.score -
          a.ranking.score;

        if (
          difference !== 0
        ) {
          return difference;
        }

        const aOffer =
          getLowestOffer(a);

        const bOffer =
          getLowestOffer(b);

        if (
          !aOffer ||
          !bOffer
        ) {
          return 0;
        }

        return (
          getOfferDecisionCost(
            aOffer
          ) -
          getOfferDecisionCost(
            bOffer
          )
        );
      }
    );
}


// ========================================
// RANKING MULTICRITERIO
// ========================================

function rankByObjectives(
  entities,
  objectives
) {
  if (
    !Array.isArray(
      entities
    ) ||
    !Array.isArray(
      objectives
    ) ||
    objectives.length === 0
  ) {
    return [];
  }

  const validObjectives =
    objectives
      .filter(
        objective =>
          objective &&
          typeof objective.criterion ===
            "string"
      )
      .map(
        objective => ({
          criterion:
            objective.criterion,

          weight:
            isFiniteNumber(
              objective.weight
            ) &&
            objective.weight > 0
              ? objective.weight
              : 1,
        })
      );

  if (
    validObjectives.length === 0
  ) {
    return [];
  }

  const criterionMaps =
    new Map();

  for (
    const objective of
    validObjectives
  ) {
    criterionMaps.set(
      objective.criterion,

      normalizeCriterionScores(
        entities,
        objective.criterion
      )
    );
  }

  return entities
    .map(entity => {
      const key =
        getEntityKey(
          entity
        );

      let totalWeight = 0;
      let weightedScore = 0;

      const usedCriteria = [];

      for (
        const objective of
        validObjectives
      ) {
        const rawScore =
          getScore(
            entity,
            objective.criterion
          );

        const normalizedScore =
          criterionMaps
            .get(
              objective.criterion
            )
            ?.get(key);

        if (
          rawScore === null ||
          !isFiniteNumber(
            normalizedScore
          )
        ) {
          return null;
        }

        weightedScore +=
          normalizedScore *
          objective.weight;

        totalWeight +=
          objective.weight;

        usedCriteria.push({
          criterion:
            objective.criterion,

          rawScore,

          normalizedScore,

          weight:
            objective.weight,
        });
      }

      if (
        totalWeight === 0
      ) {
        return null;
      }

      const finalScore =
        weightedScore /
        totalWeight;

      return {
        ...entity,

        ranking: {
          criterion:
            "multi",

          score:
            Number(
              finalScore.toFixed(2)
            ),

          usedCriteria,
        },
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) => {
        const difference =
          b.ranking.score -
          a.ranking.score;

        if (
          difference !== 0
        ) {
          return difference;
        }

        const aOffer =
          getLowestOffer(a);

        const bOffer =
          getLowestOffer(b);

        if (
          !aOffer ||
          !bOffer
        ) {
          return 0;
        }

        return (
          getOfferDecisionCost(
            aOffer
          ) -
          getOfferDecisionCost(
            bOffer
          )
        );
      }
    );
}


// ========================================
// SCORE PREZZO
//
// 100 = più economico
// 0   = più caro
//
// Per una famiglia usa la variante
// disponibile meno cara.
// ========================================

function calculatePriceScores(
  entities
) {
  const entitiesWithPrice =
    entities
      .map(entity => ({
        entity,

        bestOffer:
          getLowestOffer(
            entity
          ),
      }))
      .filter(
        item =>
          item.bestOffer &&
          isFiniteNumber(
            getOfferDecisionCost(
              item.bestOffer
            )
          )
      );

  if (
    entitiesWithPrice.length === 0
  ) {
    return new Map();
  }

  const prices =
    entitiesWithPrice.map(
      item =>
        getOfferDecisionCost(
          item.bestOffer
        )
    );

  const minPrice =
    Math.min(
      ...prices
    );

  const maxPrice =
    Math.max(
      ...prices
    );

  const result =
    new Map();

  for (
    const item of
    entitiesWithPrice
  ) {
    const price =
      getOfferDecisionCost(
        item.bestOffer
      );

    let score = 100;

    if (
      maxPrice !== minPrice
    ) {
      score =
        100 -
        (
          (
            price -
            minPrice
          ) /
          (
            maxPrice -
            minPrice
          )
        ) *
          100;
    }

    result.set(
      getEntityKey(
        item.entity
      ),

      Number(
        score.toFixed(2)
      )
    );
  }

  return result;
}


// ========================================
// QUALITÀ + PREZZO
// ========================================

function rankQualityAndPrice(
  entities,
  {
    criterion = "overall",
    qualityWeight = 0.7,
    priceWeight = 0.3,
  } = {}
) {
  const qualityScores =
    normalizeCriterionScores(
      entities,
      criterion
    );

  const priceScores =
    calculatePriceScores(
      entities
    );

  return entities
    .map(entity => {
      const key =
        getEntityKey(
          entity
        );

      const rawQualityScore =
        getScore(
          entity,
          criterion
        );

      const qualityScore =
        qualityScores.get(
          key
        );

      const priceScore =
        priceScores.get(
          key
        );

      if (
        rawQualityScore === null ||
        !isFiniteNumber(
          qualityScore
        ) ||
        !isFiniteNumber(
          priceScore
        )
      ) {
        return null;
      }

      const finalScore =
        qualityScore *
          qualityWeight +
        priceScore *
          priceWeight;

      return {
        ...entity,

        ranking: {
          criterion:
            `${criterion}+price`,

          score:
            Number(
              finalScore.toFixed(2)
            ),

          rawQualityScore,

          qualityScore,

          priceScore,

          qualityWeight,

          priceWeight,
        },
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) => {
        const difference =
          b.ranking.score -
          a.ranking.score;

        if (
          difference !== 0
        ) {
          return difference;
        }

        const aOffer =
          getLowestOffer(a);

        const bOffer =
          getLowestOffer(b);

        if (
          !aOffer ||
          !bOffer
        ) {
          return 0;
        }

        return (
          getOfferDecisionCost(
            aOffer
          ) -
          getOfferDecisionCost(
            bOffer
          )
        );
      }
    );
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  getEntityKey,

  isDefaultComparableOffer,

  getKnownFinalCost,

  getOfferDecisionCost,

  getOfferSelection,

  getUniqueProducts,

  getUniqueFamilies,

  getLowestOffer,

  getVariantScore,

  getFamilyScore,

  getScore,

  getVariantCriterionProtocol,

  getFamilyCriterionProtocol,

  getCriterionProtocol,

  normalizeCriterionScores,

  rankByCriterion,

  rankByObjectives,

  calculatePriceScores,

  rankQualityAndPrice,
};