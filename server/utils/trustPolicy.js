const fs = require("fs");
const path = require("path");


// ========================================
// CARICARE REGISTRO NEGOZI
// ========================================

function loadStores() {
  const filePath =
    path.join(
      __dirname,
      "..",
      "..",
      "data",
      "stores.json"
    );

  const raw =
    fs.readFileSync(
      filePath,
      "utf-8"
    );

  const data =
    JSON.parse(raw);

  return Array.isArray(data)
    ? data
    : [];
}


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
// NORMALIZZARE DOMINIO
// ========================================

function normalizeDomain(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}


// ========================================
// OTTENERE DOMINIO DA URL
// ========================================

function getOfferDomain(offer) {
  if (!offer?.url) {
    return null;
  }

  try {
    const parsed =
      new URL(
        offer.url
      );

    return normalizeDomain(
      parsed.hostname
    );
  } catch {
    return normalizeDomain(
      offer.url
    );
  }
}


// ========================================
// NOMI / ALIAS DEL NEGOZIO
// ========================================

function getStoreNames(store) {
  if (!store) {
    return [];
  }

  return [
    store.name,
    ...(Array.isArray(store.aliases)
      ? store.aliases
      : []),
  ]
    .map(normalizeText)
    .filter(Boolean);
}


// ========================================
// TROVARE NEGOZIO
// ========================================

function findStoreRecord(
  offer,
  stores = loadStores()
) {
  if (!offer) {
    return null;
  }


  // ------------------------------------
  // 1. STORE ID
  // ------------------------------------

  if (offer.storeId) {
    const byId =
      stores.find(
        store =>
          store.id ===
          offer.storeId
      );

    if (byId) {
      return byId;
    }
  }


  // ------------------------------------
  // 2. NOME / ALIAS
  // ------------------------------------

  const offerStoreName =
    normalizeText(
      offer.store
    );

  if (offerStoreName) {
    const byName =
      stores.find(
        store =>
          getStoreNames(
            store
          ).includes(
            offerStoreName
          )
      );

    if (byName) {
      return byName;
    }
  }


  // ------------------------------------
  // 3. DOMINIO URL
  // ------------------------------------

  const offerDomain =
    getOfferDomain(
      offer
    );

  if (offerDomain) {
    const byDomain =
      stores.find(
        store => {
          const domains =
            Array.isArray(
              store.domains
            )
              ? store.domains
              : [];

          return domains
            .map(
              normalizeDomain
            )
            .includes(
              offerDomain
            );
        }
      );

    if (byDomain) {
      return byDomain;
    }
  }


  return null;
}


// ========================================
// VENDITORE DIRETTO / MARKETPLACE
// ========================================

function isDirectRetailerSeller(
  offer,
  storeRecord
) {
  if (
    !offer ||
    !storeRecord
  ) {
    return false;
  }

  const storeType =
    storeRecord.type;


  // ------------------------------------
  // RETAILER / STORE UFFICIALE
  // ------------------------------------

  if (
    storeType ===
      "retailer" ||
    storeType ===
      "official_brand_store"
  ) {
    return true;
  }


  // ------------------------------------
  // MARKETPLACE
  // ------------------------------------

  if (
    storeType ===
      "marketplace"
  ) {
    const seller =
      normalizeText(
        offer.seller
      );

    if (!seller) {
      return false;
    }

    const validNames =
      getStoreNames(
        storeRecord
      );

    return validNames.includes(
      seller
    );
  }


  return false;
}


// ========================================
// VALUTARE FIDUCIA OFFERTA
// ========================================

function evaluateOfferTrust(
  offer,
  stores = loadStores()
) {
  const storeRecord =
    findStoreRecord(
      offer,
      stores
    );


  // ------------------------------------
  // NEGOZIO SCONOSCIUTO
  // ------------------------------------

  if (!storeRecord) {
    return {
      knownStore: false,
      verifiedStore: false,
      betaEligible: false,
      trustTier: null,
      storeType: null,
      directSeller: false,
      marketplaceSeller: false,
      storeId: null,
      reason:
        "unknown_store",
    };
  }


  const directSeller =
    isDirectRetailerSeller(
      offer,
      storeRecord
    );

  const isMarketplace =
    storeRecord.type ===
    "marketplace";


  // ------------------------------------
  // MARKETPLACE CON SELLER TERZO
  // ------------------------------------

  if (
    isMarketplace &&
    !directSeller
  ) {
    return {
      knownStore: true,

      verifiedStore:
        storeRecord
          .verifiedByDaniSua ===
        true,

      betaEligible: false,

      trustTier:
        storeRecord
          .trustTier ||
        null,

      storeType:
        storeRecord.type,

      directSeller: false,

      marketplaceSeller: true,

      storeId:
        storeRecord.id,

      reason:
        "marketplace_seller_requires_verification",
    };
  }


  // ------------------------------------
  // NEGOZIO APPROVATO
  // ------------------------------------

  return {
    knownStore: true,

    verifiedStore:
      storeRecord
        .verifiedByDaniSua ===
      true,

    betaEligible:
      storeRecord
        .betaEligible ===
      true,

    trustTier:
      storeRecord
        .trustTier ||
      null,

    storeType:
      storeRecord.type,

    directSeller,

    marketplaceSeller:
      isMarketplace,

    storeId:
      storeRecord.id,

    reason:
      storeRecord
        .betaEligible ===
        true
        ? "trusted_store"
        : "store_not_beta_eligible",
  };
}


// ========================================
// AGGIUNGERE TRUST
// ========================================

function attachTrust(
  offer,
  stores = loadStores()
) {
  if (!offer) {
    return null;
  }

  return {
    ...offer,

    trust:
      evaluateOfferTrust(
        offer,
        stores
      ),
  };
}


// ========================================
// FILTRARE OFFERTE BETA
// ========================================

function filterBetaEligibleOffers(
  offers
) {
  if (!Array.isArray(offers)) {
    return [];
  }

  const stores =
    loadStores();

  return offers
    .map(
      offer =>
        attachTrust(
          offer,
          stores
        )
    )
    .filter(Boolean)
    .filter(
      offer =>
        offer.trust
          ?.betaEligible ===
        true
    );
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  loadStores,
  normalizeText,
  normalizeDomain,
  getOfferDomain,
  getStoreNames,
  findStoreRecord,
  isDirectRetailerSeller,
  evaluateOfferTrust,
  attachTrust,
  filterBetaEligibleOffers,
};