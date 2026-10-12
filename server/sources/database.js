const fs = require("fs");
const path = require("path");

const {
  openDatabase,
  listOffers,
  closeDatabase,
} = require("../db/database");


// ========================================
// DANISUA — DATABASE SOURCE
//
// Legge solamente offerte che hanno già
// superato:
//
// contract
// trust
// product matching
//
// Nessun dato viene inventato.
// ========================================


// ========================================
// DATABASE PATH
// ========================================

function getDatabasePath() {
  if (
    process.env.DANISUA_DB_PATH
  ) {
    return path.resolve(
      process.env.DANISUA_DB_PATH
    );
  }


  return path.join(
    __dirname,
    "..",
    "..",
    "data",
    "danisua.sqlite"
  );
}


// ========================================
// NORMALIZE TEXT
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
// SEARCH MATCH
// ========================================

function matchesQuery(
  offer,
  query
) {
  const normalizedQuery =
    normalizeText(query);


  if (!normalizedQuery) {
    return true;
  }


  const searchable =
    normalizeText(
      [
        offer.title,
        offer.store,
        offer.productId,
        offer.familyId,
        offer.payload?.brand,
        offer.payload?.model,
        offer.payload?.storage,
      ]
        .filter(Boolean)
        .join(" ")
    );


  const terms =
    normalizedQuery
      .split(" ")
      .filter(Boolean);


  return terms.every(
    term =>
      searchable.includes(
        term
      )
  );
}


// ========================================
// TO DANISUA OFFER
// ========================================

function toSourceOffer(
  row
) {
  return {
    ...(row.payload || {}),

    id:
      row.id,

    source:
      row.source,

    store:
      row.store,

    productId:
      row.productId,

    familyId:
      row.familyId,

    title:
      row.title,

    offer_price:
      row.offer_price,

    currency:
      row.currency,

    old_price:
      row.old_price,

    shipping_price:
      row.shipping_price,

    stock:
      row.stock,

    url:
      row.url,

    updatedAt:
      row.updatedAt,

    productMatch: {
      confidence:
        row.matchConfidence,

      reason:
        row.matchReason,

      decision:
        "AUTO_MATCH",
    },
  };
}


// ========================================
// SEARCH
// ========================================

async function search(
  query = "",
  {
    limit = 100,
  } = {}
) {
  const databasePath =
    getDatabasePath();


  // Non creiamo automaticamente una DB
  // vuota durante una semplice ricerca.
  if (
    !fs.existsSync(
      databasePath
    )
  ) {
    return [];
  }


  let db = null;


  try {
    db =
      openDatabase(
        databasePath
      );


    return listOffers(
      db
    )
      .map(
        toSourceOffer
      )
      .filter(
        offer =>
          matchesQuery(
            offer,
            query
          )
      )
      .slice(
        0,
        limit
      );

  } finally {

    if (db) {
      closeDatabase(
        db
      );
    }
  }
}


// ========================================
// STATUS
// ========================================

function getStatus() {
  const databasePath =
    getDatabasePath();


  return {
    name:
      "database",

    enabled:
      true,

    available:
      fs.existsSync(
        databasePath
      ),

    databasePath,
  };
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  name:
    "database",

  search,
  getStatus,

  getDatabasePath,
  normalizeText,
  matchesQuery,
  toSourceOffer,
};