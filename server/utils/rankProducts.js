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

  const validOffers =
    entity.offers.filter(
      offer =>
        isFiniteNumber(
          offer.offer_price
        )
    );

  if (
    validOffers.length === 0
  ) {
    return null;
  }

  return validOffers.reduce(
    (best, offer) =>
      offer.offer_price <
      best.offer_price
        ? offer
        : best
  );
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
          aOffer.offer_price -
          bOffer.offer_price
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
          aOffer.offer_price -
          bOffer.offer_price
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
            item
              .bestOffer
              .offer_price
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
        item
          .bestOffer
          .offer_price
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
      item
        .bestOffer
        .offer_price;

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
          aOffer.offer_price -
          bOffer.offer_price
        );
      }
    );
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  getEntityKey,

  getUniqueProducts,

  getUniqueFamilies,

  getLowestOffer,

  getVariantScore,

  getFamilyScore,

  getScore,

  normalizeCriterionScores,

  rankByCriterion,

  rankByObjectives,

  calculatePriceScores,

  rankQualityAndPrice,
};