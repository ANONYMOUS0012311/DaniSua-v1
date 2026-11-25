const DEFAULT_CACHE_TTL_MS =
  6 * 60 * 60 * 1000;

const imageCache =
  new Map();


function isHttpUrl(value) {
  try {
    const url =
      new URL(
        String(
          value || ""
        )
      );

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}


function decodeHtmlEntities(
  value
) {
  return String(
    value || ""
  )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}


function readMetaAttributes(
  tag
) {
  const attrs = {};

  const pattern =
    /([a-zA-Z:-]+)\s*=\s*["']([^"']*)["']/g;

  let match =
    null;

  while (
    (
      match =
        pattern.exec(
          tag
        )
    )
  ) {
    attrs[
      String(
        match[1] ||
        ""
      )
        .toLowerCase()
    ] =
      match[2] || "";
  }

  return attrs;
}


function extractProductImageUrl(
  html,
  sourcePage
) {
  const tags =
    String(
      html || ""
    )
      .match(
        /<meta\b[^>]*>/gi
      ) ||
    [];

  const accepted =
    new Set([
      "og:image",
      "og:image:secure_url",
      "twitter:image",
      "twitter:image:src",
    ]);

  for (
    const tag of tags
  ) {
    const attrs =
      readMetaAttributes(
        tag
      );

    const key =
      String(
        attrs.property ||
        attrs.name ||
        ""
      )
        .toLowerCase();

    if (
      !accepted.has(
        key
      ) ||
      !attrs.content
    ) {
      continue;
    }

    try {
      const resolved =
        new URL(
          decodeHtmlEntities(
            attrs.content
          ),
          sourcePage
        );

      if (
        isHttpUrl(
          resolved.href
        )
      ) {
        return resolved.href;
      }
    } catch {
      // Prova il prossimo meta tag.
    }
  }

  // Fallback per siti che espongono la foto solo
  // nei dati strutturati Product JSON-LD.
  const scripts =
    String(
      html || ""
    )
      .match(
        /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
      ) ||
    [];

  for (
    const script of
    scripts
  ) {
    const body =
      script
        .replace(
          /^<script\b[^>]*>/i,
          ""
        )
        .replace(
          /<\/script>$/i,
          ""
        )
        .trim();

    try {
      const parsed =
        JSON.parse(
          decodeHtmlEntities(
            body
          )
        );

      const stack =
        Array.isArray(parsed)
          ? [...parsed]
          : [parsed];

      while (
        stack.length > 0
      ) {
        const item =
          stack.shift();

        if (
          !item ||
          typeof item !==
            "object"
        ) {
          continue;
        }

        if (
          Array.isArray(
            item["@graph"]
          )
        ) {
          stack.push(
            ...item["@graph"]
          );
        }

        const image =
          item.image;

        const candidates =
          Array.isArray(image)
            ? image
            : (
                typeof image ===
                  "string"
                  ? [image]
                  : (
                      image?.url
                        ? [image.url]
                        : []
                    )
              );

        for (
          const candidate of
          candidates
        ) {
          try {
            const resolved =
              new URL(
                candidate,
                sourcePage
              );

            if (
              isHttpUrl(
                resolved.href
              )
            ) {
              return resolved.href;
            }
          } catch {
            // Prova la prossima immagine.
          }
        }
      }
    } catch {
      // JSON-LD non valido: prova il prossimo script.
    }
  }

  return null;
}


function getCatalogProduct(
  products,
  productId
) {
  return (
    Array.isArray(
      products
    )
      ? products
      : []
  )
    .find(
      product =>
        String(
          product?.id ||
          ""
        ) ===
        String(
          productId ||
          ""
        )
    ) ||
    null;
}


function normalizeComparableText(
  value
) {
  return String(
    value || ""
  )
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
    .trim();
}


function sourceLooksVariantSpecific(
  url,
  product
) {
  if (!isHttpUrl(url)) {
    return false;
  }

  const normalizedUrl =
    normalizeComparableText(
      decodeURIComponent(
        String(url)
      )
    );

  const model =
    normalizeComparableText(
      product?.model ||
      product?.title ||
      ""
    );

  const color =
    normalizeComparableText(
      product?.color ||
      ""
    );

  const modelTokens =
    model
      .split(" ")
      .filter(
        token =>
          token.length >= 2 &&
          ![
            "samsung",
            "galaxy",
            "gb",
          ].includes(token)
      );

  const modelMatch =
    modelTokens.length === 0 ||
    modelTokens.some(
      token =>
        normalizedUrl.includes(
          token
        )
    );

  // Se la variante ha un colore esplicito,
  // preferiamo una URL che lo codifichi oppure
  // una URL con modelCode/SKU specifico.
  const hasSpecificCode =
    /modelcode|pid|\/product\//i
      .test(
        String(url)
      );

  const colorTokens =
    color
      .split(" ")
      .filter(
        token =>
          token.length >= 3
      );

  const colorMatch =
    colorTokens.length === 0 ||
    colorTokens.some(
      token =>
        normalizedUrl.includes(
          token
        )
    );

  return (
    modelMatch &&
    (
      colorMatch ||
      hasSpecificCode
    )
  );
}


function getProductImageSourcePages(
  products,
  offers,
  productId
) {
  const product =
    getCatalogProduct(
      products,
      productId
    );

  const candidates = [];

  const primary =
    String(
      product
        ?.imageSourcePage ||
      ""
    )
      .trim();

  if (
    isHttpUrl(
      primary
    )
  ) {
    candidates.push(
      primary
    );
  }

  for (
    const offer of
    Array.isArray(offers)
      ? offers
      : []
  ) {
    if (
      String(
        offer?.productId ||
        ""
      ) !==
      String(
        productId ||
        ""
      )
    ) {
      continue;
    }

    const url =
      String(
        offer?.url ||
        ""
      )
        .trim();

    if (
      isHttpUrl(url) &&
      sourceLooksVariantSpecific(
        url,
        product
      ) &&
      !candidates.includes(url)
    ) {
      candidates.push(url);
    }
  }

  return candidates;
}


function getProductImageSourcePage(
  products,
  productId
) {
  return (
    getProductImageSourcePages(
      products,
      [],
      productId
    )[0] ||
    null
  );
}


async function fetchProductImageUrl(
  {
    products,
    offers = [],
    productId,
    fetchImpl = fetch,
    now = Date.now(),
    cacheTtlMs =
      DEFAULT_CACHE_TTL_MS,
  } = {}
) {
  const cacheKey =
    String(
      productId ||
      ""
    );

  if (!cacheKey) {
    return null;
  }

  const cached =
    imageCache.get(
      cacheKey
    );

  if (
    cached &&
    cached.expiresAt > now
  ) {
    return cached.url;
  }

  const sourcePages =
    getProductImageSourcePages(
      products,
      offers,
      productId
    );

  if (
    sourcePages.length === 0
  ) {
    return null;
  }

  for (
    const sourcePage of
    sourcePages
  ) {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        7000
      );

    try {
      const response =
        await fetchImpl(
          sourcePage,
          {
            redirect:
              "follow",
            signal:
              controller.signal,
            headers: {
              "User-Agent":
                "DaniSua-Product-Image/1.0",
              Accept:
                "text/html,application/xhtml+xml",
            },
          }
        );

      if (
        !response.ok
      ) {
        continue;
      }

      const html =
        await response.text();

      const imageUrl =
        extractProductImageUrl(
          html,
          sourcePage
        );

      if (
        !imageUrl
      ) {
        continue;
      }

      imageCache.set(
        cacheKey,
        {
          url:
            imageUrl,
          expiresAt:
            now +
            cacheTtlMs,
        }
      );

      return imageUrl;
    } catch {
      // Prova la prossima pagina sorgente.
    } finally {
      clearTimeout(
        timer
      );
    }
  }

  return null;
}


function clearProductImageCache() {
  imageCache.clear();
}


module.exports = {
  DEFAULT_CACHE_TTL_MS,
  isHttpUrl,
  extractProductImageUrl,
  getProductImageSourcePage,
  getProductImageSourcePages,
  fetchProductImageUrl,
  clearProductImageCache,
};
