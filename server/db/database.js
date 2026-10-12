const {
  DatabaseSync,
} = require("node:sqlite");


// ========================================
// DANISUA - DATABASE LAYER
//
// Questo modulo contiene solamente
// operazioni di persistenza.
//
// La logica di business per risolvere
// una review rimane fuori da SQLite.
// ========================================


// ========================================
// OPEN DATABASE
// ========================================

function openDatabase(
  databasePath
) {
  if (
    !databasePath ||
    typeof databasePath !== "string"
  ) {
    throw new Error(
      "databasePath is required"
    );
  }


  const db =
    new DatabaseSync(
      databasePath
    );


  initializeDatabase(
    db
  );


  return db;
}


// ========================================
// SCHEMA
// ========================================

function initializeDatabase(
  db
) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,

      source TEXT NOT NULL,
      store TEXT NOT NULL,

      product_id TEXT NOT NULL,
      family_id TEXT NOT NULL,

      title TEXT NOT NULL,

      offer_price REAL NOT NULL,
      currency TEXT NOT NULL,

      old_price REAL,
      shipping_price REAL,
      stock INTEGER,

      url TEXT NOT NULL,

      updated_at TEXT,

      trust_tier TEXT,
      match_confidence REAL,
      match_reason TEXT,

      payload_json TEXT NOT NULL,

      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS review_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      offer_id TEXT,
      source TEXT NOT NULL,
      store TEXT,

      title TEXT,

      reason TEXT NOT NULL,
      family_id TEXT,

      confidence REAL,

      candidates_json TEXT,
      payload_json TEXT NOT NULL,

      status TEXT NOT NULL
        DEFAULT 'pending',

      created_at TEXT NOT NULL,
      resolved_at TEXT,

      resolved_product_id TEXT,
      resolution_note TEXT
    );


    CREATE INDEX IF NOT EXISTS
      idx_offers_product_id
      ON offers(product_id);


    CREATE INDEX IF NOT EXISTS
      idx_offers_family_id
      ON offers(family_id);


    CREATE INDEX IF NOT EXISTS
      idx_offers_store
      ON offers(store);


    CREATE INDEX IF NOT EXISTS
      idx_review_queue_status
      ON review_queue(status);
  `);


  // ====================================
  // SAFE MIGRATION
  //
  // Se una DB precedente esiste già,
  // aggiungiamo le nuove colonne senza
  // cancellare i dati esistenti.
  // ====================================

  ensureReviewQueueColumn(
    db,
    "resolved_product_id",
    "TEXT"
  );


  ensureReviewQueueColumn(
    db,
    "resolution_note",
    "TEXT"
  );
}


// ========================================
// SAFE COLUMN MIGRATION
// ========================================

function ensureReviewQueueColumn(
  db,
  columnName,
  columnDefinition
) {
  const columns =
    db.prepare(`
      PRAGMA table_info(review_queue)
    `)
      .all();


  const exists =
    columns.some(
      column =>
        column.name ===
        columnName
    );


  if (exists) {
    return;
  }


  const allowedColumns = {
    resolved_product_id:
      "TEXT",

    resolution_note:
      "TEXT",
  };


  if (
    allowedColumns[
      columnName
    ] !==
    columnDefinition
  ) {
    throw new Error(
      `Unsupported migration column: ${columnName}`
    );
  }


  db.exec(`
    ALTER TABLE review_queue
    ADD COLUMN ${columnName} ${columnDefinition}
  `);
}


// ========================================
// HELPERS
// ========================================

function nowIso() {
  return new Date()
    .toISOString();
}


function nullableStock(
  stock
) {
  if (stock === true) {
    return 1;
  }


  if (stock === false) {
    return 0;
  }


  return null;
}


function parseStock(
  value
) {
  if (value === 1) {
    return true;
  }


  if (value === 0) {
    return false;
  }


  return null;
}


function parseJson(
  value,
  fallback = null
) {
  if (
    typeof value !== "string" ||
    !value
  ) {
    return fallback;
  }


  try {
    return JSON.parse(
      value
    );
  } catch {
    return fallback;
  }
}


// ========================================
// UPSERT READY OFFER
// ========================================

function upsertOffer(
  db,
  offer
) {
  if (
    !offer ||
    typeof offer !== "object"
  ) {
    throw new Error(
      "offer is required"
    );
  }


  if (!offer.id) {
    throw new Error(
      "offer.id is required"
    );
  }


  if (!offer.productId) {
    throw new Error(
      "offer.productId is required"
    );
  }


  if (!offer.familyId) {
    throw new Error(
      "offer.familyId is required"
    );
  }


  const timestamp =
    nowIso();


  const statement =
    db.prepare(`
      INSERT INTO offers (
        id,
        source,
        store,
        product_id,
        family_id,
        title,
        offer_price,
        currency,
        old_price,
        shipping_price,
        stock,
        url,
        updated_at,
        trust_tier,
        match_confidence,
        match_reason,
        payload_json,
        created_at,
        last_seen_at
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )

      ON CONFLICT(id)
      DO UPDATE SET
        source =
          excluded.source,

        store =
          excluded.store,

        product_id =
          excluded.product_id,

        family_id =
          excluded.family_id,

        title =
          excluded.title,

        offer_price =
          excluded.offer_price,

        currency =
          excluded.currency,

        old_price =
          excluded.old_price,

        shipping_price =
          excluded.shipping_price,

        stock =
          excluded.stock,

        url =
          excluded.url,

        updated_at =
          excluded.updated_at,

        trust_tier =
          excluded.trust_tier,

        match_confidence =
          excluded.match_confidence,

        match_reason =
          excluded.match_reason,

        payload_json =
          excluded.payload_json,

        last_seen_at =
          excluded.last_seen_at
    `);


  statement.run(
    offer.id,
    offer.source,
    offer.store,
    offer.productId,
    offer.familyId,
    offer.title,
    offer.offer_price,
    offer.currency,
    offer.old_price ??
      null,
    offer.shipping_price ??
      null,
    nullableStock(
      offer.stock
    ),
    offer.url,
    offer.updatedAt ??
      null,
    offer.trust
      ?.trustTier ??
      null,
    offer.productMatch
      ?.confidence ??
      null,
    offer.productMatch
      ?.reason ??
      null,
    JSON.stringify(
      offer
    ),
    timestamp,
    timestamp
  );


  return getOfferById(
    db,
    offer.id
  );
}


// ========================================
// GET OFFER
// ========================================

function getOfferById(
  db,
  offerId
) {
  const row =
    db.prepare(`
      SELECT *
      FROM offers
      WHERE id = ?
    `)
      .get(
        offerId
      );


  if (!row) {
    return null;
  }


  return mapOfferRow(
    row
  );
}


// ========================================
// MAP OFFER ROW
// ========================================

function mapOfferRow(
  row
) {
  return {
    id:
      row.id,

    source:
      row.source,

    store:
      row.store,

    productId:
      row.product_id,

    familyId:
      row.family_id,

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
      parseStock(
        row.stock
      ),

    url:
      row.url,

    updatedAt:
      row.updated_at,

    trustTier:
      row.trust_tier,

    matchConfidence:
      row.match_confidence,

    matchReason:
      row.match_reason,

    payload:
      parseJson(
        row.payload_json,
        {}
      ),

    createdAt:
      row.created_at,

    lastSeenAt:
      row.last_seen_at,
  };
}


// ========================================
// LIST OFFERS
// ========================================

function listOffers(
  db
) {
  return db.prepare(`
    SELECT *
    FROM offers
    ORDER BY id
  `)
    .all()
    .map(
      mapOfferRow
    );
}


// ========================================
// ENQUEUE REVIEW
// ========================================

function enqueueReview(
  db,
  reviewItem
) {
  if (
    !reviewItem ||
    typeof reviewItem !== "object"
  ) {
    throw new Error(
      "reviewItem is required"
    );
  }


  const offer =
    reviewItem.offer ||
    {};


  const match =
    reviewItem.match ||
    {};


  if (!offer.source) {
    throw new Error(
      "review offer.source is required"
    );
  }


  const statement =
    db.prepare(`
      INSERT INTO review_queue (
        offer_id,
        source,
        store,
        title,
        reason,
        family_id,
        confidence,
        candidates_json,
        payload_json,
        status,
        created_at
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        'pending',
        ?
      )
    `);


  const result =
    statement.run(
      offer.id ??
        null,

      offer.source,

      offer.store ??
        null,

      offer.title ??
        null,

      match.reason ||
        "needs_review",

      match.familyId ??
        null,

      match.confidence ??
        null,

      JSON.stringify(
        match.candidates ||
        []
      ),

      JSON.stringify(
        reviewItem
      ),

      nowIso()
    );


  return Number(
    result.lastInsertRowid
  );
}


// ========================================
// MAP REVIEW ROW
// ========================================

function mapReviewRow(
  row
) {
  if (!row) {
    return null;
  }


  return {
    id:
      Number(
        row.id
      ),

    offerId:
      row.offer_id,

    source:
      row.source,

    store:
      row.store,

    title:
      row.title,

    reason:
      row.reason,

    familyId:
      row.family_id,

    confidence:
      row.confidence,

    candidates:
      parseJson(
        row.candidates_json,
        []
      ),

    payload:
      parseJson(
        row.payload_json,
        {}
      ),

    status:
      row.status,

    createdAt:
      row.created_at,

    resolvedAt:
      row.resolved_at,

    resolvedProductId:
      row.resolved_product_id,

    resolutionNote:
      row.resolution_note,
  };
}


// ========================================
// GET REVIEW
// ========================================

function getReviewById(
  db,
  reviewId
) {
  const row =
    db.prepare(`
      SELECT *
      FROM review_queue
      WHERE id = ?
    `)
      .get(
        reviewId
      );


  return mapReviewRow(
    row
  );
}


// ========================================
// LIST PENDING REVIEWS
// ========================================

function listPendingReviews(
  db
) {
  return db.prepare(`
    SELECT *
    FROM review_queue
    WHERE status = 'pending'
    ORDER BY id
  `)
    .all()
    .map(
      mapReviewRow
    );
}


// ========================================
// MARK REVIEW RESOLVED
// ========================================

function markReviewResolved(
  db,
  reviewId,
  {
    productId,
    note = null,
  } = {}
) {
  if (!productId) {
    throw new Error(
      "productId is required"
    );
  }


  const timestamp =
    nowIso();


  const result =
    db.prepare(`
      UPDATE review_queue

      SET
        status = 'resolved',
        resolved_at = ?,
        resolved_product_id = ?,
        resolution_note = ?

      WHERE
        id = ?
        AND status = 'pending'
    `)
      .run(
        timestamp,
        productId,
        note,
        reviewId
      );


  if (
    Number(
      result.changes
    ) !==
    1
  ) {
    throw new Error(
      "Review not found or already resolved"
    );
  }


  return getReviewById(
    db,
    reviewId
  );
}


// ========================================
// CLOSE DATABASE
// ========================================

function closeDatabase(
  db
) {
  if (
    db &&
    typeof db.close ===
      "function"
  ) {
    db.close();
  }
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  openDatabase,
  initializeDatabase,

  upsertOffer,
  getOfferById,
  listOffers,

  enqueueReview,
  getReviewById,
  listPendingReviews,
  markReviewResolved,

  closeDatabase,
};