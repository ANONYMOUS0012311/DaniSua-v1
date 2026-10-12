const {
  toNullableString,
  toNullableNumber,
  toNullableBoolean,
  normalizeCurrency,
  normalizeUrl,
  normalizeTimestamp,
} = require("../ingestion/normalizers");


function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}


function main() {
  console.log(
    "\n🧪 DaniSua Normalizers Smoke Test"
  );

  console.log(
    "=================================\n"
  );


  try {

    // STRING

    assert(
      toNullableString(" Unieuro ") ===
        "Unieuro",
      "String normalization fallita"
    );

    assert(
      toNullableString("   ") ===
        null,
      "String vuota dovrebbe essere null"
    );


    // PREZZI

    assert(
      toNullableNumber(
        "1.299,99 €"
      ) === 1299.99,
      "Prezzo italiano non normalizzato"
    );


    assert(
      toNullableNumber(
        "1,299.99"
      ) === 1299.99,
      "Prezzo internazionale non normalizzato"
    );


    assert(
      toNullableNumber(
        "499,90 €"
      ) === 499.9,
      "Prezzo con virgola non normalizzato"
    );


    assert(
      toNullableNumber(
        ""
      ) === null,
      "Prezzo vuoto dovrebbe essere null"
    );


    // STOCK

    assert(
      toNullableBoolean(
        "Disponibile"
      ) === true,
      "Disponibile dovrebbe essere true"
    );


    assert(
      toNullableBoolean(
        "Esaurito"
      ) === false,
      "Esaurito dovrebbe essere false"
    );


    assert(
      toNullableBoolean(
        "sconosciuto"
      ) === null,
      "Stock sconosciuto dovrebbe essere null"
    );


    // VALUTA

    assert(
      normalizeCurrency(
        "€"
      ) === "EUR",
      "€ dovrebbe diventare EUR"
    );


    assert(
      normalizeCurrency(
        "eur"
      ) === "EUR",
      "eur dovrebbe diventare EUR"
    );


    // URL

    assert(
      normalizeUrl(
        "https://www.unieuro.it/test"
      ) !== null,
      "URL valido rifiutato"
    );


    assert(
      normalizeUrl(
        "not-a-url"
      ) === null,
      "URL invalido accettato"
    );


    // TIMESTAMP

    assert(
      normalizeTimestamp(
        null
      ) === null,
      "Timestamp null dovrebbe restare null"
    );


    assert(
      normalizeTimestamp(
        "not-a-date"
      ) === null,
      "Timestamp invalido dovrebbe essere null"
    );


    assert(
      normalizeTimestamp(
        "2026-10-08T10:00:00Z"
      ) ===
        "2026-10-08T10:00:00.000Z",
      "Timestamp valido non normalizzato"
    );


    console.log(
      "✅ NORMALIZERS — prezzi, stock, valuta, URL e timestamp"
    );

    console.log(
      "\n✅ 1 test superato"
    );

    console.log(
      "❌ 0 test falliti\n"
    );

  } catch (error) {

    console.log(
      "❌ NORMALIZERS — prezzi, stock, valuta, URL e timestamp"
    );

    console.log(
      `   ${error.message}`
    );

    console.log(
      "\n✅ 0 test superati"
    );

    console.log(
      "❌ 1 test fallito\n"
    );

    process.exitCode = 1;
  }
}


main();