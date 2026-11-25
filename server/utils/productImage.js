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
