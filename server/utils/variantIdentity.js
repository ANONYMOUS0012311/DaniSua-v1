function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


const COLOR_GROUPS = {
  black: [
    "black",
    "nero",
    "jetblack",
    "jet black",
    "charcoal",
    "graphite",
    "grafite",
  ],
  white: [
    "white",
    "bianco",
    "blanco",
  ],
  gray: [
    "gray",
    "grey",
    "grigio",
  ],
  blue: [
    "blue",
    "blu",
    "navy",
    "cobalt",
  ],
  violet: [
    "violet",
    "viola",
    "lavender",
    "lilla",
  ],
  pink: [
    "pink",
    "rosa",
  ],
  green: [
    "green",
    "verde",
    "sage",
    "salvia",
  ],
};


function detectColorGroup(value) {
  const text =
    normalizeText(value);

  if (!text) {
    return null;
  }

  for (
    const [group, aliases] of
    Object.entries(
      COLOR_GROUPS
    )
  ) {
    if (
      aliases.some(
        alias =>
          text.includes(
            normalizeText(alias)
          )
      )
    ) {
      return group;
    }
  }

  return null;
}


function extractUrlText(url) {
  try {
    return normalizeText(
      decodeURIComponent(
        String(url || "")
      )
    );
  } catch {
    return normalizeText(
      url
    );
  }
}


function getExpectedModelTokens(
  product
) {
  return normalizeText(
    product?.model ||
    product?.title ||
    ""
  )
    .split(" ")
    .filter(
      token =>
        token.length >= 2 &&
        ![
          "samsung",
          "galaxy",
          "apple",
          "iphone",
          "google",
          "pixel",
          "xiaomi",
          "redmi",
          "gb",
          "tb",
          "5g",
        ].includes(token)
    );
}


function evaluateVariantUrlIdentity(
  product,
  url
) {
  const urlText =
    extractUrlText(url);

  if (!urlText) {
    return {
      status:
        "unknown",
      reason:
        "missing_url_text",
    };
  }

  const expectedColor =
    detectColorGroup(
      product?.color
    );

  const urlColor =
    detectColorGroup(
      urlText
    );

  if (
    expectedColor &&
    urlColor &&
    expectedColor !==
      urlColor
  ) {
    return {
      status:
        "mismatch",
      reason:
        "color_conflict",
      expectedColor,
      urlColor,
    };
  }

  const expectedTokens =
    getExpectedModelTokens(
      product
    );

  const distinctiveTokens =
    expectedTokens.filter(
      token =>
        /\d/.test(token) ||
        token.length >= 4
    );

  const modelHit =
    distinctiveTokens.length === 0 ||
    distinctiveTokens.some(
      token =>
        urlText.includes(
          token
        )
    );

  const hasExplicitProductShape =
    /product|pid|modelcode|smartphone|galaxy|iphone|pixel|redmi/
      .test(
        urlText
      );

  if (
    hasExplicitProductShape &&
    distinctiveTokens.length > 0 &&
    !modelHit
  ) {
    const obviousForeignModel =
      /galaxy m\d|iphone \d|pixel \d|redmi note \d|s\d{2}|a\d{2}|fold\d|flip\d/
        .test(
          urlText
        );

    if (
      obviousForeignModel
    ) {
      return {
        status:
          "mismatch",
        reason:
          "model_conflict",
      };
    }
  }

  const expectedStorage =
    normalizeText(
      product?.storage
    );

  if (
    expectedStorage
  ) {
    const storageNumber =
      expectedStorage
        .match(/\d+/)
        ?.[0];

    if (
      storageNumber &&
      /\d+\s*(gb|tb)/.test(
        urlText
      )
    ) {
      const urlStorage =
        urlText.match(
          /(\d+)\s*(gb|tb)/
        );

      if (
        urlStorage &&
        urlStorage[1] !==
          storageNumber
      ) {
        return {
          status:
            "mismatch",
          reason:
            "storage_conflict",
          expectedStorage:
            product?.storage ||
            null,
          urlStorage:
            urlStorage[0],
        };
      }
    }
  }

  const specific =
    /modelcode|pid|\/product\//i
      .test(
        String(url || "")
      ) ||
    (
      expectedColor &&
      urlColor ===
        expectedColor
    ) ||
    modelHit;

  return {
    status:
      specific
        ? "matched"
        : "unknown",
    reason:
      specific
        ? "compatible_identity"
        : "generic_or_unproven",
  };
}


module.exports = {
  normalizeText,
  detectColorGroup,
  evaluateVariantUrlIdentity,
};
