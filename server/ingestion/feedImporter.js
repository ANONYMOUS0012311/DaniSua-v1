const crypto = require("crypto");

const {
  toNullableString,
  toNullableNumber,
  toNullableBoolean,
  normalizeCurrency,
  normalizeUrl,
  normalizeTimestamp,
} = require("./normalizers");

const {
  stageSourceBatch,
} = require("./staging");


function firstValue(
  item,
  keys
) {
  for (const key of keys) {
    const value =
      item?.[key];

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}


function parseCsv(content) {
  const text =
    String(content || "");

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (
    let i = 0;
    i < text.length;
    i += 1
  ) {
    const char =
      text[i];

    if (quoted) {
      if (
        char === '"' &&
        text[i + 1] === '"'
      ) {
        field += '"';
        i += 1;
      } else if (
        char === '"'
      ) {
        quoted = false;
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (
      char === "\n" ||
      char === "\r"
    ) {
      if (
        char === "\r" &&
        text[i + 1] === "\n"
      ) {
        i += 1;
      }

      row.push(field);
      field = "";

      if (
        row.some(
          value =>
            String(value)
              .trim()
              .length > 0
        )
      ) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);

  if (
    row.some(
      value =>
        String(value)
          .trim()
          .length > 0
    )
  ) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers =
    rows[0].map(
      value =>
        String(value)
          .trim()
    );

  return rows
    .slice(1)
    .map(values => {
      const item = {};

      headers.forEach(
        (
          header,
          index
        ) => {
          item[header] =
            values[index] ??
            "";
        }
      );

      return item;
    });
}


function parseFeedContent(
  content,
  format
) {
  const normalizedFormat =
    String(format || "json")
      .toLowerCase();

  if (
    normalizedFormat ===
    "csv"
  ) {
    return parseCsv(content);
  }

  const parsed =
    JSON.parse(
      String(content || "")
    );

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (
    parsed &&
    Array.isArray(
      parsed.offers
    )
  ) {
    return parsed.offers;
  }

  if (
    parsed &&
    Array.isArray(
      parsed.items
    )
  ) {
    return parsed.items;
  }

  throw new Error(
    "Feed JSON must be an array or contain offers/items"
  );
}


function parsePricing(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  const text =
    toNullableString(value);

  if (!text) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(text);

    return (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    )
      ? parsed
      : null;
  } catch {
    return null;
  }
}


function stableOfferId(
  sourceName,
  item,
  index
) {
  const explicit =
    toNullableString(
      firstValue(
        item,
        [
          "id",
          "offer_id",
          "offerId",
        ]
      )
    );

  if (explicit) {
    return explicit;
  }

  const identity = [
    sourceName,
    firstValue(
      item,
      [
        "merchant_sku",
        "sku",
        "productId",
        "product_id",
        "gtin",
        "ean",
        "url",
        "deeplink",
        "title",
        "product_name",
      ]
    ),
    index,
  ]
    .filter(
      value =>
        value !== null &&
        value !== undefined
    )
    .join("|");

  const hash =
    crypto
      .createHash("sha1")
      .update(identity)
      .digest("hex")
      .slice(0, 12);

  return (
    String(sourceName)
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-|-$/g,
        ""
      ) +
    "-" +
    hash
  );
}


function mapNormalizedFeedItem(
  item,
  index,
  sourceName
) {
  const offerPrice =
    toNullableNumber(
      firstValue(
        item,
        [
          "offer_price",
          "price",
          "sale_price",
        ]
      )
    );

  const storage =
    toNullableString(
      firstValue(
        item,
        [
          "storage",
          "capacity",
        ]
      )
    );

  const ram =
    toNullableString(
      firstValue(
        item,
        [
          "ram",
          "memory",
        ]
      )
    );

  const color =
    toNullableString(
      firstValue(
        item,
        [
          "color",
          "colour",
        ]
      )
    );

  const attributes = {};

  if (storage) {
    attributes.storage =
      storage;
  }

  if (ram) {
    attributes.ram =
      ram;
  }

  if (color) {
    attributes.color =
      color;
  }

  const providedPricing =
    parsePricing(
      firstValue(
        item,
        [
          "pricing",
          "pricing_json",
        ]
      )
    );

  const pricing =
    providedPricing ||
    {
      type: "standard",
      conditional: false,
      conditions: [],
      paymentOptions:
        offerPrice !== null
          ? [
              {
                type:
                  "one_time",
                total_price:
                  offerPrice,
              },
            ]
          : [],
    };

  return {
    id:
      stableOfferId(
        sourceName,
        item,
        index
      ),

    source:
      sourceName,

    productId:
      toNullableString(
        firstValue(
          item,
          [
            "productId",
            "product_id",
          ]
        )
      ),

    gtin:
      toNullableString(
        firstValue(
          item,
          [
            "gtin",
            "ean",
            "ean13",
          ]
        )
      ),

    title:
      toNullableString(
        firstValue(
          item,
          [
            "title",
            "product_name",
            "name",
          ]
        )
      ),

    brand:
      toNullableString(
        firstValue(
          item,
          [
            "brand",
            "manufacturer",
          ]
        )
      ),

    model:
      toNullableString(
        firstValue(
          item,
          [
            "model",
            "model_name",
          ]
        )
      ),

    storage,
    ram,
    color,
    attributes,

    store:
      toNullableString(
        firstValue(
          item,
          [
            "store",
            "merchant",
            "advertiser",
          ]
        )
      ),

    seller:
      toNullableString(
        firstValue(
          item,
          [
            "seller",
            "merchant",
            "advertiser",
          ]
        )
      ),

    old_price:
      toNullableNumber(
        firstValue(
          item,
          [
            "old_price",
            "rrp",
            "list_price",
          ]
        )
      ),

    offer_price:
      offerPrice,

    currency:
      normalizeCurrency(
        firstValue(
          item,
          [
            "currency",
            "currency_code",
          ]
        ) ||
        "EUR"
      ),

    shipping_price:
      toNullableNumber(
        firstValue(
          item,
          [
            "shipping_price",
            "shipping",
            "delivery_cost",
          ]
        )
      ),

    stock:
      toNullableBoolean(
        firstValue(
          item,
          [
            "stock",
            "availability",
            "in_stock",
          ]
        )
      ),

    url:
      normalizeUrl(
        firstValue(
          item,
          [
            "url",
            "deeplink",
            "product_url",
          ]
        )
      ),

    verifiedAt:
      normalizeTimestamp(
        firstValue(
          item,
          [
            "verifiedAt",
            "verified_at",
          ]
        )
      ),

    updatedAt:
      normalizeTimestamp(
        firstValue(
          item,
          [
            "updatedAt",
            "updated_at",
            "last_updated",
          ]
        )
      ),

    pricing,
  };
}


function importFeedContent({
  content,
  format = "json",
  sourceName,
  betaOnly = true,
}) {
  const rawItems =
    parseFeedContent(
      content,
      format
    );

  const staged =
    stageSourceBatch({
      sourceName,
      rawItems,
      betaOnly,
      mapItem:
        (
          item,
          index
        ) =>
          mapNormalizedFeedItem(
            item,
            index,
            sourceName
          ),
    });

  return {
    format:
      String(format)
        .toLowerCase(),
    sourceName,
    ...staged,
  };
}


module.exports = {
  parseCsv,
  parseFeedContent,
  stableOfferId,
  mapNormalizedFeedItem,
  importFeedContent,
};
