const fs = require("fs");
const path = require("path");


// ========================================
// DANISUA — PRODUCT MATCHER
//
// offerta esterna
//      ↓
// PRODUCT FAMILY
//      ↓
// VARIANT
//
// Principio:
//
// meglio NEEDS_REVIEW
// che associare un'offerta
// al prodotto sbagliato.
//
// Quando più modelli compaiono nel titolo,
// vince il modello più specifico.
// Esempio:
//
// "iPhone 15 Pro"
// non deve essere confuso con
// "iPhone 15".
// ========================================


// ========================================
// CATALOGO
// ========================================

function loadProducts() {
  const filePath =
    path.join(
      __dirname,
      "..",
      "..",
      "data",
      "products.json"
    );

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  const data =
    JSON.parse(raw);

  return Array.isArray(data)
    ? data
    : [];
}


// ========================================
// NORMALIZZAZIONE
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


function compactText(value) {
  return normalizeText(value)
    .replace(/\s+/g, "");
}


function unique(values) {
  return Array.from(
    new Set(
      values.filter(Boolean)
    )
  );
}


// ========================================
// TESTO COMPLETO DEL CANDIDATO
// ========================================

function getCandidateText(
  candidate
) {
  const attributeValues =
    candidate &&
    candidate.attributes &&
    typeof candidate.attributes ===
      "object"
      ? Object.values(
          candidate.attributes
        )
      : [];


  return normalizeText(
    [
      candidate?.title,
      candidate?.brand,
      candidate?.model,
      candidate?.storage,
      candidate?.ram,
      candidate?.color,
      ...attributeValues,
    ]
      .filter(Boolean)
      .join(" ")
  );
}


// ========================================
// ATTRIBUTI DI UNA VARIANTE
// ========================================

function getProductAttributes(
  product
) {
  const attributes = {
    ...(product?.attributes &&
    typeof product.attributes ===
      "object"
      ? product.attributes
      : {}),
  };


  if (
    product?.storage &&
    !attributes.storage
  ) {
    attributes.storage =
      product.storage;
  }


  if (
    product?.ram &&
    !attributes.ram
  ) {
    attributes.ram =
      product.ram;
  }


  if (
    product?.color &&
    !attributes.color
  ) {
    attributes.color =
      product.color;
  }


  return attributes;
}


// ========================================
// FAMILY
// ========================================

function groupByFamily(
  products
) {
  const map =
    new Map();


  for (
    const product of products
  ) {
    const familyId =
      product.familyId ||
      product.productId ||
      product.id;


    if (!familyId) {
      continue;
    }


    if (!map.has(familyId)) {
      map.set(
        familyId,
        []
      );
    }


    map.get(
      familyId
    ).push(
      product
    );
  }


  return map;
}


// ========================================
// ATTRIBUTI CHE DISTINGUONO
// LE VARIANTI
// ========================================

function getDiscriminatingAttributes(
  variants
) {
  const keys =
    new Set();


  for (
    const variant of variants
  ) {
    const attributes =
      getProductAttributes(
        variant
      );


    Object.keys(
      attributes
    ).forEach(
      key =>
        keys.add(key)
    );
  }


  const discriminating = [];


  for (
    const key of keys
  ) {
    const values =
      unique(
        variants.map(
          variant => {
            const attributes =
              getProductAttributes(
                variant
              );

            return normalizeText(
              attributes[key]
            );
          }
        )
      );


    if (
      values.length >
      1
    ) {
      discriminating.push(
        key
      );
    }
  }


  return discriminating;
}


// ========================================
// SPECIFICITÀ MODELLO
//
// Più il modello è specifico,
// più alto è il punteggio.
//
// "iphone 15 pro"
// > "iphone 15"
// ========================================

function getModelSpecificity(
  model
) {
  const normalized =
    normalizeText(
      model
    );


  if (!normalized) {
    return 0;
  }


  const tokens =
    normalized
      .split(" ")
      .filter(Boolean);


  return (
    tokens.length * 100 +
    normalized.length
  );
}


// ========================================
// FAMILY IDENTITY SCORE
//
// 0 = non compatibile
//
// Se candidate.model esiste,
// richiediamo corrispondenza esatta.
//
// Se candidate.model non esiste,
// usiamo il titolo e scegliamo poi
// il modello più specifico.
// ========================================

function getFamilyIdentityScore(
  candidate,
  representative
) {
  const candidateText =
    getCandidateText(
      candidate
    );


  const candidateBrand =
    normalizeText(
      candidate?.brand
    );

  const candidateModel =
    normalizeText(
      candidate?.model
    );

  const productBrand =
    normalizeText(
      representative?.brand
    );

  const productModel =
    normalizeText(
      representative?.model
    );


  if (!productModel) {
    return 0;
  }


  // ------------------------------------
  // BRAND ESPLICITAMENTE DIVERSO
  // ------------------------------------

  if (
    candidateBrand &&
    productBrand &&
    candidateBrand !==
      productBrand
  ) {
    return 0;
  }


  // ------------------------------------
  // MODELLO STRUTTURATO PRESENTE
  //
  // Se la fonte ci dà un campo model,
  // richiediamo corrispondenza esatta.
  // ------------------------------------

  if (candidateModel) {
    if (
      candidateModel !==
      productModel
    ) {
      return 0;
    }


    return (
      10000 +
      getModelSpecificity(
        productModel
      )
    );
  }


  // ------------------------------------
  // SOLO TESTO / TITOLO
  // ------------------------------------

  if (
    !candidateText.includes(
      productModel
    )
  ) {
    return 0;
  }


  return (
    1000 +
    getModelSpecificity(
      productModel
    )
  );
}


// ========================================
// COMPATIBILITÀ FAMILY
// ========================================

function familyIdentityMatches(
  candidate,
  representative
) {
  return (
    getFamilyIdentityScore(
      candidate,
      representative
    ) >
    0
  );
}


// ========================================
// GTIN MATCH
// ========================================

function findByGtin(
  candidate,
  products
) {
  const gtin =
    compactText(
      candidate?.gtin
    );


  if (!gtin) {
    return null;
  }


  const matches =
    products.filter(
      product =>
        compactText(
          product.gtin
        ) ===
        gtin
    );


  if (
    matches.length ===
    1
  ) {
    return matches[0];
  }


  return null;
}


// ========================================
// PRODUCT ID MATCH
// ========================================

function findByProductId(
  candidate,
  products
) {
  const requestedId =
    candidate?.productId;


  if (!requestedId) {
    return null;
  }


  return (
    products.find(
      product =>
        product.productId ===
          requestedId ||
        product.id ===
          requestedId
    ) ||
    null
  );
}


// ========================================
// MATCH ATTRIBUTO
// ========================================

function candidateContainsValue(
  candidate,
  key,
  value
) {
  const normalizedValue =
    normalizeText(
      value
    );


  if (!normalizedValue) {
    return false;
  }


  const candidateAttributes =
    candidate?.attributes &&
    typeof candidate.attributes ===
      "object"
      ? candidate.attributes
      : {};


  const directValue =
    candidateAttributes[key] ??
    candidate?.[key];


  if (
    directValue !== null &&
    directValue !== undefined &&
    directValue !== ""
  ) {
    return (
      normalizeText(
        directValue
      ) ===
      normalizedValue
    );
  }


  return getCandidateText(
    candidate
  ).includes(
    normalizedValue
  );
}


// ========================================
// ATTRIBUTO ESPLICITO
// ========================================

function candidateHasExplicitAttribute(
  candidate,
  key
) {
  const attributes =
    candidate?.attributes &&
    typeof candidate.attributes ===
      "object"
      ? candidate.attributes
      : {};


  const value =
    attributes[key] ??
    candidate?.[key];


  return Boolean(
    value !== null &&
    value !== undefined &&
    String(value).trim()
  );
}


// ========================================
// RISOLVERE VARIANTE
// ========================================

function resolveVariant(
  candidate,
  variants
) {
  if (
    variants.length ===
    1
  ) {
    return {
      status:
        "matched",

      product:
        variants[0],

      confidence:
        0.92,

      reason:
        "single_variant_family",
    };
  }


  const discriminatingAttributes =
    getDiscriminatingAttributes(
      variants
    );


  const scored =
    variants.map(
      variant => {
        const attributes =
          getProductAttributes(
            variant
          );

        let matches = 0;
        let conflicts = 0;


        for (
          const key of
          discriminatingAttributes
        ) {
          const value =
            attributes[key];


          if (
            value === null ||
            value === undefined
          ) {
            continue;
          }


          if (
            candidateContainsValue(
              candidate,
              key,
              value
            )
          ) {
            matches += 1;

            continue;
          }


          if (
            candidateHasExplicitAttribute(
              candidate,
              key
            )
          ) {
            conflicts += 1;
          }
        }


        return {
          product:
            variant,

          matches,

          conflicts,
        };
      }
    );


  const valid =
    scored
      .filter(
        item =>
          item.conflicts ===
            0 &&
          item.matches >
            0
      )
      .sort(
        (a, b) =>
          b.matches -
          a.matches
      );


  // ====================================
  // VARIANTE NON DISTINTA
  // ====================================

  if (
    valid.length ===
    0
  ) {
    return {
      status:
        "needs_review",

      product:
        null,

      confidence:
        0.7,

      reason:
        "variant_not_disambiguated",
    };
  }


  // ====================================
  // DUE VARIANTI CON STESSA EVIDENZA
  // ====================================

  if (
    valid.length >
      1 &&
    valid[0].matches ===
      valid[1].matches
  ) {
    return {
      status:
        "needs_review",

      product:
        null,

      confidence:
        0.75,

      reason:
        "multiple_variant_candidates",
    };
  }


  const winner =
    valid[0];


  const maxEvidence =
    Math.max(
      1,
      discriminatingAttributes.length
    );


  const confidence =
    Math.min(
      0.99,
      0.85 +
      (
        winner.matches /
        maxEvidence
      ) *
        0.14
    );


  return {
    status:
      "matched",

    product:
      winner.product,

    confidence,

    reason:
      "variant_attributes_match",
  };
}


// ========================================
// MATCH PRINCIPALE
// ========================================

function matchProduct(
  candidate,
  products = loadProducts()
) {
  if (
    !candidate ||
    typeof candidate !==
      "object"
  ) {
    return {
      status:
        "unmatched",

      decision:
        "NO_MATCH",

      confidence:
        0,

      productId:
        null,

      familyId:
        null,

      reason:
        "invalid_candidate",

      candidates: [],
    };
  }


  // ====================================
  // 1. PRODUCT ID ESATTO
  // ====================================

  const exactProduct =
    findByProductId(
      candidate,
      products
    );


  if (exactProduct) {
    return {
      status:
        "matched",

      decision:
        "AUTO_MATCH",

      confidence:
        1,

      productId:
        exactProduct.productId ||
        exactProduct.id,

      familyId:
        exactProduct.familyId ||
        exactProduct.productId ||
        exactProduct.id,

      reason:
        "exact_product_id",

      candidates: [],
    };
  }


  // ====================================
  // 2. GTIN ESATTO
  // ====================================

  const gtinProduct =
    findByGtin(
      candidate,
      products
    );


  if (gtinProduct) {
    return {
      status:
        "matched",

      decision:
        "AUTO_MATCH",

      confidence:
        1,

      productId:
        gtinProduct.productId ||
        gtinProduct.id,

      familyId:
        gtinProduct.familyId ||
        gtinProduct.productId ||
        gtinProduct.id,

      reason:
        "exact_gtin",

      candidates: [],
    };
  }


  // ====================================
  // 3. FAMILY CANDIDATES
  // ====================================

  const families =
    groupByFamily(
      products
    );


  const matchingFamilies = [];


  for (
    const [
      familyId,
      variants,
    ] of families.entries()
  ) {
    if (
      variants.length ===
      0
    ) {
      continue;
    }


    const representative =
      variants[0];


    const score =
      getFamilyIdentityScore(
        candidate,
        representative
      );


    if (
      score >
      0
    ) {
      matchingFamilies.push({
        familyId,
        variants,
        score,
      });
    }
  }


  // ====================================
  // NESSUNA FAMILY
  // ====================================

  if (
    matchingFamilies.length ===
    0
  ) {
    return {
      status:
        "unmatched",

      decision:
        "NO_MATCH",

      confidence:
        0,

      productId:
        null,

      familyId:
        null,

      reason:
        "family_not_found",

      candidates: [],
    };
  }


  // ====================================
  // ORDINARE PER SPECIFICITÀ
  // ====================================

  matchingFamilies.sort(
    (a, b) =>
      b.score -
      a.score
  );


  const bestScore =
    matchingFamilies[0]
      .score;


  const bestFamilies =
    matchingFamilies.filter(
      family =>
        family.score ===
        bestScore
    );


  // ====================================
  // PARITÀ REALE FRA FAMILY
  // ====================================

  if (
    bestFamilies.length >
    1
  ) {
    return {
      status:
        "needs_review",

      decision:
        "NEEDS_REVIEW",

      confidence:
        0.6,

      productId:
        null,

      familyId:
        null,

      reason:
        "multiple_family_candidates",

      candidates:
        bestFamilies.map(
          item =>
            item.familyId
        ),
    };
  }


  // ====================================
  // 4. FAMILY VINCENTE
  // ====================================

  const family =
    bestFamilies[0];


  // ====================================
  // 5. VARIANT MATCH
  // ====================================

  const variantResult =
    resolveVariant(
      candidate,
      family.variants
    );


  if (
    variantResult.status !==
      "matched"
  ) {
    return {
      status:
        "needs_review",

      decision:
        "NEEDS_REVIEW",

      confidence:
        variantResult.confidence,

      productId:
        null,

      familyId:
        family.familyId,

      reason:
        variantResult.reason,

      candidates:
        family.variants.map(
          variant =>
            variant.productId ||
            variant.id
        ),
    };
  }


  const product =
    variantResult.product;


  return {
    status:
      "matched",

    decision:
      "AUTO_MATCH",

    confidence:
      variantResult.confidence,

    productId:
      product.productId ||
      product.id,

    familyId:
      product.familyId ||
      family.familyId,

    reason:
      variantResult.reason,

    candidates: [],
  };
}


// ========================================
// ARRICCHIRE OFFERTA
// ========================================

function attachProductMatch(
  offer,
  products = loadProducts()
) {
  const match =
    matchProduct(
      offer,
      products
    );


  if (
    match.status !==
    "matched"
  ) {
    return {
      offer,
      match,
    };
  }


  return {
    offer: {
      ...offer,

      productId:
        match.productId,

      familyId:
        match.familyId,

      productMatch: {
        confidence:
          match.confidence,

        reason:
          match.reason,

        decision:
          match.decision,
      },
    },

    match,
  };
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  loadProducts,
  normalizeText,
  getCandidateText,
  getProductAttributes,
  groupByFamily,
  getDiscriminatingAttributes,
  getModelSpecificity,
  getFamilyIdentityScore,
  familyIdentityMatches,
  resolveVariant,
  matchProduct,
  attachProductMatch,
};