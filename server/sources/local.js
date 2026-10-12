const fs = require("fs");
const path = require("path");


// ========================================
// LEER JSON
// ========================================

function readJsonFile(fileName) {
  const filePath = path.join(
    __dirname,
    "..",
    "..",
    "data",
    fileName
  );

  const raw = fs.readFileSync(
    filePath,
    "utf-8"
  );

  return JSON.parse(raw);
}


// ========================================
// CARGAR PRODUCTOS
// ========================================

function loadProducts() {
  return readJsonFile(
    "products.json"
  );
}


// ========================================
// CARGAR OFERTAS
// ========================================

function loadOffers() {
  return readJsonFile(
    "offers.json"
  );
}


// ========================================
// CARGAR CONOCIMIENTO
// ========================================

function loadProductKnowledge() {
  const data = readJsonFile(
    "product_knowledge.json"
  );

  if (Array.isArray(data)) {
    return data;
  }

  if (
    data &&
    Array.isArray(data.items)
  ) {
    return data.items;
  }

  return [];
}


// ========================================
// NORMALIZAR TEXTO
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
// ATRIBUTOS A TEXTO
// ========================================

function attributesToText(
  attributes
) {
  if (
    !attributes ||
    typeof attributes !==
      "object"
  ) {
    return "";
  }

  return Object.entries(
    attributes
  )
    .flatMap(
      ([key, value]) => [
        key,
        value,
      ]
    )
    .filter(Boolean)
    .join(" ");
}


// ========================================
// TEXTO DE BÚSQUEDA
// ========================================

function buildProductSearchText(
  product
) {
  return normalizeText(
    [
      product.title,
      product.brand,
      product.model,
      product.familyId,
      product.storage,
      product.ram,
      product.color,
      product.category,
      product.condition,
      attributesToText(
        product.attributes
      ),
    ]
      .filter(Boolean)
      .join(" ")
  );
}


// ========================================
// COMPROBAR BÚSQUEDA
// ========================================

function matchesQuery(
  product,
  query
) {
  const normalizedQuery =
    normalizeText(query);

  if (!normalizedQuery) {
    return true;
  }

  const searchText =
    buildProductSearchText(
      product
    );

  const words =
    normalizedQuery
      .split(" ")
      .filter(Boolean);

  return words.every(
    word =>
      searchText.includes(
        word
      )
  );
}


// ========================================
// UNIR PRODUCTO + CONOCIMIENTO + OFERTA
// ========================================

function joinProductData(
  product,
  offer,
  knowledge
) {
  return {
    // ------------------------------------
    // IDENTIDAD DE LA OFERTA
    // ------------------------------------

    id:
      offer.id,


    // ------------------------------------
    // IDENTIDAD DEL PRODUCTO / VARIANTE
    // ------------------------------------

    productId:
      product.id,

    familyId:
      product.familyId ||
      product.id,


    // ------------------------------------
    // DATOS DEL PRODUCTO
    // ------------------------------------

    title:
      product.title,

    brand:
      product.brand,

    model:
      product.model ??
      null,

    category:
      product.category ??
      null,

    storage:
      product.storage ??
      null,

    ram:
      product.ram ??
      null,

    color:
      product.color ??
      null,

    condition:
      product.condition ??
      "new",

    gtin:
      product.gtin ??
      null,

    attributes:
      product.attributes &&
      typeof product.attributes ===
        "object"
        ? product.attributes
        : {},


    // ------------------------------------
    // CONOCIMIENTO DEL PRODUCTO
    // ------------------------------------

    knowledge: {
      category:
        knowledge?.category ??
        product.category ??
        null,

      scores:
        knowledge?.scores ??
        {},

      evidence:
        Array.isArray(
          knowledge?.evidence
        )
          ? knowledge.evidence
          : [],

      sources:
        Array.isArray(
          knowledge?.sources
        )
          ? knowledge.sources
          : [],

      updatedAt:
        knowledge?.updatedAt ??
        null,
    },


    // ------------------------------------
    // DATOS COMERCIALES
    // ------------------------------------

    store:
      offer.store ||
      "Unknown",

    seller:
      offer.seller ||
      null,

    old_price:
      typeof offer.old_price ===
        "number"
        ? offer.old_price
        : null,

    offer_price:
      typeof offer.offer_price ===
        "number"
        ? offer.offer_price
        : null,

    currency:
      offer.currency ||
      "EUR",

    shipping_price:
      typeof offer.shipping_price ===
        "number"
        ? offer.shipping_price
        : null,

    stock:
      offer.stock !== false,

    url:
      offer.url ||
      "",

    image:
      offer.image ||
      "",

    updatedAt:
      offer.updatedAt ??
      null,
  };
}


// ========================================
// FUENTE LOCAL
// ========================================

module.exports = {
  name: "local",

  async search(
    query,
    { limit = 30 } = {}
  ) {
    const products =
      loadProducts();

    const offers =
      loadOffers();

    const knowledgeItems =
      loadProductKnowledge();


    // ====================================
    // ÍNDICE DE CONOCIMIENTO
    // productId -> knowledge
    // ====================================

    const knowledgeMap =
      new Map(
        knowledgeItems.map(
          item => [
            item.productId,
            item,
          ]
        )
      );


    // ====================================
    // BUSCAR PRODUCTOS
    // ====================================

    const matchedProducts =
      products.filter(
        product =>
          matchesQuery(
            product,
            query
          )
      );


    // ====================================
    // IDS DE PRODUCTOS ENCONTRADOS
    // ====================================

    const matchedProductIds =
      new Set(
        matchedProducts.map(
          product =>
            product.id
        )
      );


    // ====================================
    // OFERTAS RELACIONADAS
    // ====================================

    const matchedOffers =
      offers.filter(
        offer =>
          matchedProductIds.has(
            offer.productId
          )
      );


    // ====================================
    // ÍNDICE DE PRODUCTOS
    // ====================================

    const productMap =
      new Map(
        matchedProducts.map(
          product => [
            product.id,
            product,
          ]
        )
      );


    // ====================================
    // UNIR
    // PRODUCTO + CONOCIMIENTO + OFERTA
    // ====================================

    const results =
      matchedOffers
        .map(
          offer => {
            const product =
              productMap.get(
                offer.productId
              );

            if (!product) {
              return null;
            }

            const knowledge =
              knowledgeMap.get(
                product.id
              ) || null;

            return joinProductData(
              product,
              offer,
              knowledge
            );
          }
        )
        .filter(Boolean)

        // Solo ofertas con precio válido
        .filter(
          result =>
            typeof result.offer_price ===
              "number" &&
            Number.isFinite(
              result.offer_price
            )
        )

        // Solo productos disponibles
        .filter(
          result =>
            result.stock !== false
        );


    // ====================================
    // LÍMITE
    // ====================================

    return results.slice(
      0,
      limit
    );
  },
};