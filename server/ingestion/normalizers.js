// ========================================
// DANISUA — INGESTION NORMALIZERS
//
// Converte valori provenienti da fonti
// esterne in tipi coerenti.
//
// Regola fondamentale:
// se DaniSua non può determinare un dato
// con sufficiente certezza, restituisce null.
// ========================================


// ========================================
// STRING
// ========================================

function toNullableString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text.length > 0
    ? text
    : null;
}


// ========================================
// MONEY / NUMBER
//
// Supporta esempi come:
//
// 1299.99
// "1299.99"
// "1.299,99 €"
// "1,299.99"
// "€ 499,90"
// ========================================

function toNullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }


  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : null;
  }


  let text =
    String(value)
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^\d,.\-]/g, "");


  if (!text) {
    return null;
  }


  const commaIndex =
    text.lastIndexOf(",");

  const dotIndex =
    text.lastIndexOf(".");


  // ------------------------------------
  // VIRGOLA + PUNTO
  // ------------------------------------

  if (
    commaIndex !== -1 &&
    dotIndex !== -1
  ) {
    if (
      commaIndex >
      dotIndex
    ) {
      // 1.299,99
      text =
        text
          .replace(/\./g, "")
          .replace(",", ".");
    } else {
      // 1,299.99
      text =
        text.replace(/,/g, "");
    }
  }


  // ------------------------------------
  // SOLO VIRGOLA
  // ------------------------------------

  else if (
    commaIndex !== -1
  ) {
    const decimals =
      text.length -
      commaIndex -
      1;

    if (
      decimals === 1 ||
      decimals === 2
    ) {
      text =
        text.replace(",", ".");
    } else {
      text =
        text.replace(/,/g, "");
    }
  }


  // ------------------------------------
  // SOLO PUNTO
  // ------------------------------------

  else if (
    dotIndex !== -1
  ) {
    const decimals =
      text.length -
      dotIndex -
      1;

    if (
      decimals !== 1 &&
      decimals !== 2
    ) {
      text =
        text.replace(/\./g, "");
    }
  }


  const number =
    Number(text);


  return Number.isFinite(number)
    ? number
    : null;
}


// ========================================
// BOOLEAN / STOCK
// ========================================

function toNullableBoolean(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }


  if (
    typeof value === "boolean"
  ) {
    return value;
  }


  if (
    typeof value === "number"
  ) {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }

    return null;
  }


  const text =
    String(value)
      .toLowerCase()
      .trim();


  const trueValues = [
    "true",
    "yes",
    "si",
    "sì",
    "1",
    "available",
    "in stock",
    "instock",
    "disponibile",
    "disponibilità",
  ];


  const falseValues = [
    "false",
    "no",
    "0",
    "unavailable",
    "out of stock",
    "outofstock",
    "non disponibile",
    "esaurito",
  ];


  if (
    trueValues.includes(text)
  ) {
    return true;
  }


  if (
    falseValues.includes(text)
  ) {
    return false;
  }


  return null;
}


// ========================================
// CURRENCY
// ========================================

function normalizeCurrency(value) {
  const text =
    toNullableString(value);


  if (!text) {
    return null;
  }


  const normalized =
    text
      .toUpperCase()
      .trim();


  if (
    normalized === "€" ||
    normalized === "EURO" ||
    normalized === "EUROS" ||
    normalized === "EUR"
  ) {
    return "EUR";
  }


  if (
    /^[A-Z]{3}$/.test(
      normalized
    )
  ) {
    return normalized;
  }


  return null;
}


// ========================================
// URL
// ========================================

function normalizeUrl(value) {
  const text =
    toNullableString(value);


  if (!text) {
    return null;
  }


  try {
    const url =
      new URL(text);


    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return null;
    }


    return url.toString();
  } catch {
    return null;
  }
}


// ========================================
// TIMESTAMP
//
// Non inventa date.
// Se non è interpretabile → null.
// ========================================

function normalizeTimestamp(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }


  const date =
    value instanceof Date
      ? value
      : new Date(value);


  const time =
    date.getTime();


  if (
    !Number.isFinite(time)
  ) {
    return null;
  }


  return date.toISOString();
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  toNullableString,
  toNullableNumber,
  toNullableBoolean,
  normalizeCurrency,
  normalizeUrl,
  normalizeTimestamp,
};