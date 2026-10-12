// ========================================
// DANISUA — OFFER CONTRACT
//
// Definisce i requisiti minimi che
// un'offerta normalizzata deve rispettare
// prima di entrare nel motore DaniSua.
//
// Non inventiamo:
// - prezzi
// - stock
// - timestamp
// - seller
//
// Se un dato non è disponibile,
// può rimanere null quando consentito.
// ========================================


// ========================================
// UTILS
// ========================================

function isNonEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}


function isFiniteNumber(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}


function isValidHttpUrl(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  try {
    const parsed =
      new URL(value);

    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}


function isValidTimestamp(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return true;
  }

  if (
    typeof value !== "string"
  ) {
    return false;
  }

  const time =
    Date.parse(value);

  return Number.isFinite(time);
}


// ========================================
// VALIDARE OFFERTA
// ========================================

function validateOffer(offer) {
  const errors = [];

  if (
    !offer ||
    typeof offer !== "object"
  ) {
    return {
      valid: false,
      errors: [
        "offer_not_object",
      ],
    };
  }


  // ------------------------------------
  // IDENTITÀ OFFERTA
  // ------------------------------------

  if (
    !isNonEmptyString(
      offer.id
    )
  ) {
    errors.push(
      "missing_id"
    );
  }


  // ------------------------------------
  // FONTE
  // ------------------------------------

  if (
    !isNonEmptyString(
      offer.source
    )
  ) {
    errors.push(
      "missing_source"
    );
  }


  // ------------------------------------
  // NEGOZIO
  // ------------------------------------

  if (
    !isNonEmptyString(
      offer.store
    )
  ) {
    errors.push(
      "missing_store"
    );
  }


  // ------------------------------------
  // PRODOTTO
  // ------------------------------------

  if (
    !isNonEmptyString(
      offer.title
    )
  ) {
    errors.push(
      "missing_title"
    );
  }


  // ------------------------------------
  // PREZZO
  // ------------------------------------

  if (
    !isFiniteNumber(
      offer.offer_price
    ) ||
    offer.offer_price < 0
  ) {
    errors.push(
      "invalid_offer_price"
    );
  }


  // ------------------------------------
  // VALUTA
  // ------------------------------------

  if (
    !isNonEmptyString(
      offer.currency
    )
  ) {
    errors.push(
      "missing_currency"
    );
  }


  // ------------------------------------
  // URL
  // ------------------------------------

  if (
    !isValidHttpUrl(
      offer.url
    )
  ) {
    errors.push(
      "invalid_url"
    );
  }


  // ------------------------------------
  // PREZZO PRECEDENTE
  // ------------------------------------

  if (
    offer.old_price !==
      null &&
    offer.old_price !==
      undefined &&
    (
      !isFiniteNumber(
        offer.old_price
      ) ||
      offer.old_price < 0
    )
  ) {
    errors.push(
      "invalid_old_price"
    );
  }


  // ------------------------------------
  // SPEDIZIONE
  // ------------------------------------

  if (
    offer.shipping_price !==
      null &&
    offer.shipping_price !==
      undefined &&
    (
      !isFiniteNumber(
        offer.shipping_price
      ) ||
      offer.shipping_price < 0
    )
  ) {
    errors.push(
      "invalid_shipping_price"
    );
  }


  // ------------------------------------
  // STOCK
  // ------------------------------------

  if (
    offer.stock !==
      null &&
    offer.stock !==
      undefined &&
    typeof offer.stock !==
      "boolean"
  ) {
    errors.push(
      "invalid_stock"
    );
  }


  // ------------------------------------
  // TIMESTAMP
  //
  // null è valido.
  // DaniSua NON deve inventare
  // "aggiornato ora".
  // ------------------------------------

  if (
    !isValidTimestamp(
      offer.updatedAt
    )
  ) {
    errors.push(
      "invalid_updated_at"
    );
  }


  return {
    valid:
      errors.length === 0,

    errors,
  };
}


// ========================================
// VALIDARE LOTTO DI OFFERTE
// ========================================

function validateOffers(
  offers
) {
  if (!Array.isArray(offers)) {
    return {
      accepted: [],
      rejected: [],
    };
  }

  const accepted = [];
  const rejected = [];


  for (
    const offer of offers
  ) {
    const validation =
      validateOffer(
        offer
      );

    if (
      validation.valid
    ) {
      accepted.push(
        offer
      );

      continue;
    }


    rejected.push({
      offer,
      errors:
        validation.errors,
    });
  }


  return {
    accepted,
    rejected,
  };
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  isNonEmptyString,
  isFiniteNumber,
  isValidHttpUrl,
  isValidTimestamp,
  validateOffer,
  validateOffers,
};