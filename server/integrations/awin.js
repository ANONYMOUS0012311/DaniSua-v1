const crypto = require("crypto");

const {
  parseCsv,
  mapNormalizedFeedItem,
} = require("../ingestion/feedImporter");

const {
  stageSourceBatch,
} = require("../ingestion/staging");


const AWIN_FEED_LIST_BASE =
  "https://ui.awin.com/productdata-darwin-download/publisher";


function toText(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(
    value
  )
    .trim();
}


function parseCsvList(
  value
) {
  return toText(
    value
  )
    .split(",")
    .map(
      item =>
        item.trim()
    )
    .filter(Boolean);
}


function readAwinConfig(
  env = process.env
) {
  const publisherId =
    toText(
      env
        ?.AWIN_PUBLISHER_ID
    );

  const datafeedKey =
    toText(
      env
        ?.AWIN_DATAFEED_KEY
    );

  const advertiserIds =
    parseCsvList(
      env
        ?.AWIN_ADVERTISER_IDS
    );

  const region =
    toText(
      env
        ?.AWIN_PRIMARY_REGION
    ) ||
    "IT";

  const allowSoftMembership =
    toText(
      env
        ?.AWIN_ALLOW_SOFT_MEMBERSHIP
    )
      .toLowerCase() ===
    "true";

  return {
    publisherId,
    datafeedKey,
    advertiserIds,
    region:
      region.toUpperCase(),
    allowSoftMembership,
    configured:
      Boolean(
        publisherId &&
        datafeedKey
      ),
    allowlistConfigured:
      advertiserIds.length >
      0,
  };
}


function buildAwinFeedListUrl(
  config
) {
  if (
    !config
      ?.publisherId ||
    !config
      ?.datafeedKey
  ) {
    return null;
  }

  return (
    AWIN_FEED_LIST_BASE +
    "/" +
    encodeURIComponent(
      config.publisherId
    ) +
    "/" +
    encodeURIComponent(
      config.datafeedKey
    ) +
    "/1/feedList"
  );
}


function redactAwinUrl(
  value
) {
  const text =
    toText(
      value
    );

  if (!text) {
    return text;
  }

  return text
    .replace(
      /(\/publisher\/[^/]+\/)[^/]+(\/1\/feedList)/i,
      "$1[REDACTED]$2"
    )
    .replace(
      /(\/apikey\/)[^/]+/i,
      "$1[REDACTED]"
    );
}


function normalizeHeader(
  value
) {
  return toText(
    value
  )
    .replace(
      /^\uFEFF/,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ""
    );
}


function normalizeRow(
  row
) {
  const normalized = {};

  for (
    const [
      key,
      value,
    ] of Object.entries(
      row || {}
    )
  ) {
    normalized[
      normalizeHeader(
        key
      )
    ] = value;
  }

  return normalized;
}


function getRowValue(
  row,
  aliases
) {
  const normalized =
    normalizeRow(
      row
    );

  for (
    const alias of
    aliases
  ) {
    const value =
      normalized[
        normalizeHeader(
          alias
        )
      ];

    if (
      value !==
        undefined &&
      value !== null &&
      toText(
        value
      ) !== ""
    ) {
      return value;
    }
  }

  return null;
}


function isSafeAwinUrl(
  value
) {
  try {
    const url =
      new URL(
        value
      );

    if (
      url.protocol !==
      "https:"
    ) {
      return false;
    }

    return [
      "productdata.awin.com",
      "ui.awin.com",
      "api.awin.com",
    ].includes(
      url.hostname
        .toLowerCase()
    );
  } catch {
    return false;
  }
}


function parseAwinFeedList(
  content
) {
  return parseCsv(
    content
  )
    .map(
      row => {
        const advertiserId =
          toText(
            getRowValue(
              row,
              [
                "Advertiser ID",
              ]
            )
          );

        const feedId =
          toText(
            getRowValue(
              row,
              [
                "Feed ID",
              ]
            )
          );

        const url =
          toText(
            getRowValue(
              row,
              [
                "URL",
              ]
            )
          );

        return {
          advertiserId,
          advertiserName:
            toText(
              getRowValue(
                row,
                [
                  "Advertiser Name",
                ]
              )
            ),

          primaryRegion:
            toText(
              getRowValue(
                row,
                [
                  "Primary Region",
                ]
              )
            )
              .toUpperCase(),

          membershipStatus:
            toText(
              getRowValue(
                row,
                [
                  "Membership Status",
                ]
              )
            )
              .toLowerCase(),

          datafeedFormat:
            toText(
              getRowValue(
                row,
                [
                  "Datafeed Format",
                ]
              )
            ),

          feedId,

          feedName:
            toText(
              getRowValue(
                row,
                [
                  "Feed Name",
                ]
              )
            ),

          language:
            toText(
              getRowValue(
                row,
                [
                  "Language",
                ]
              )
            ),

          vertical:
            toText(
              getRowValue(
                row,
                [
                  "Vertical",
                ]
              )
            ),

          lastImported:
            toText(
              getRowValue(
                row,
                [
                  "Last Imported",
                ]
              )
            ),

          lastChecked:
            toText(
              getRowValue(
                row,
                [
                  "Last Checked",
                ]
              )
            ),

          productCount:
            Number(
              toText(
                getRowValue(
                  row,
                  [
                    "No of products",
                  ]
                )
              )
                .replace(
                  /[^0-9]/g,
                  ""
                )
            ) ||
            0,

          url:
            isSafeAwinUrl(
              url
            )
              ? url
              : null,
        };
      }
    )
    .filter(
      feed =>
        feed.advertiserId &&
        feed.feedId
    );
}


function compareFeedTimestamp(
  current,
  previous
) {
  const currentText =
    toText(
      current
    );

  const previousText =
    toText(
      previous
    );

  if (!currentText) {
    return false;
  }

  if (!previousText) {
    return true;
  }

  const currentTime =
    Date.parse(
      currentText
        .replace(
          " ",
          "T"
        ) +
      (
        currentText.includes(
          "T"
        ) ||
        /[zZ]|[+-]\d\d:?\d\d$/
          .test(
            currentText
          )
          ? ""
          : "Z"
      )
    );

  const previousTime =
    Date.parse(
      previousText
        .replace(
          " ",
          "T"
        ) +
      (
        previousText.includes(
          "T"
        ) ||
        /[zZ]|[+-]\d\d:?\d\d$/
          .test(
            previousText
          )
          ? ""
          : "Z"
      )
    );

  if (
    Number.isFinite(
      currentTime
    ) &&
    Number.isFinite(
      previousTime
    )
  ) {
    return (
      currentTime >
      previousTime
    );
  }

  return (
    currentText >
    previousText
  );
}


function selectChangedAwinFeeds(
  feeds,
  {
    advertiserIds = [],
    region = "IT",
    allowSoftMembership =
      false,
    lastImportedByFeedId =
      {},
  } = {}
) {
  const allowlist =
    new Set(
      (
        Array.isArray(
          advertiserIds
        )
          ? advertiserIds
          : []
      )
        .map(
          item =>
            toText(
              item
            )
        )
        .filter(Boolean)
    );

  const selected = [];
  const skipped = [];

  for (
    const feed of
    Array.isArray(
      feeds
    )
      ? feeds
      : []
  ) {
    const reasons = [];

    if (
      allowlist.size ===
      0
    ) {
      reasons.push(
        "advertiser_allowlist_missing"
      );
    } else if (
      !allowlist.has(
        toText(
          feed
            ?.advertiserId
        )
      )
    ) {
      reasons.push(
        "advertiser_not_allowlisted"
      );
    }

    if (
      toText(
        feed
          ?.primaryRegion
      )
        .toUpperCase() !==
      toText(
        region
      )
        .toUpperCase()
    ) {
      reasons.push(
        "region_mismatch"
      );
    }

    if (
      !allowSoftMembership &&
      toText(
        feed
          ?.membershipStatus
      )
        .toLowerCase() !==
        "active"
    ) {
      reasons.push(
        "membership_not_active"
      );
    }

    if (
      toText(
        feed
          ?.datafeedFormat
      )
        .toLowerCase() !==
        "awin"
    ) {
      reasons.push(
        "unsupported_feed_format"
      );
    }

    if (
      !feed?.url ||
      !isSafeAwinUrl(
        feed.url
      )
    ) {
      reasons.push(
        "unsafe_or_missing_url"
      );
    }

    const previous =
      lastImportedByFeedId[
        feed?.feedId
      ];

    if (
      reasons.length ===
        0 &&
      !compareFeedTimestamp(
        feed?.lastImported,
        previous
      )
    ) {
      reasons.push(
        "feed_not_changed"
      );
    }

    const item = {
      ...feed,

      downloadUrl:
        feed?.url ||
        null,

      safeDownloadUrl:
        redactAwinUrl(
          feed?.url
        ),

      previousLastImported:
        previous ||
        null,
    };

    if (
      reasons.length ===
      0
    ) {
      selected.push(
        item
      );
    } else {
      skipped.push({
        ...item,
        reasons,
      });
    }
  }

  return {
    selected,
    skipped,

    diagnostics: {
      total:
        (
          Array.isArray(
            feeds
          )
            ? feeds.length
            : 0
        ),

      selected:
        selected.length,

      skipped:
        skipped.length,

      allowlistSize:
        allowlist.size,
    },
  };
}


function createAwinOfferId(
  advertiserId,
  productIdentity
) {
  const hash =
    crypto
      .createHash(
        "sha1"
      )
      .update(
        [
          "awin",
          toText(
            advertiserId
          ),
          toText(
            productIdentity
          ),
        ]
          .join(
            "|"
          )
      )
      .digest(
        "hex"
      )
      .slice(
        0,
        16
      );

  return (
    "awin-" +
    toText(
      advertiserId
    )
      .replace(
        /[^0-9a-z]+/gi,
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


function normalizeAwinDeliveryCost(
  value
) {
  const text =
    toText(
      value
    );

  if (!text) {
    return null;
  }

  if (
    [
      "free",
      "gratis",
      "gratuito",
      "gratuita",
    ].includes(
      text.toLowerCase()
    )
  ) {
    return 0;
  }

  return value;
}


function mapAwinProductRow(
  row,
  {
    advertiserId,
    advertiserName,
    observedAt =
      new Date()
        .toISOString(),
  }
) {
  const productId =
    getRowValue(
      row,
      [
        "product_id",
        "pid",
      ]
    );

  const deepLink =
    getRowValue(
      row,
      [
        "deep_link",
        "deeplink",
        "product_url",
      ]
    );

  const identity =
    productId ||
    deepLink ||
    getRowValue(
      row,
      [
        "product_name",
      ]
    );

  const oldPrice =
    getRowValue(
      row,
      [
        "product_price_old",
        "rrp_price",
      ]
    );

  return {
    id:
      createAwinOfferId(
        advertiserId,
        identity
      ),

    title:
      getRowValue(
        row,
        [
          "product_name",
          "title",
        ]
      ),

    brand:
      getRowValue(
        row,
        [
          "brand_name",
          "brand",
        ]
      ),

    gtin:
      getRowValue(
        row,
        [
          "ean",
          "gtin",
        ]
      ),

    store:
      advertiserName,

    seller:
      advertiserName,

    price:
      getRowValue(
        row,
        [
          "price",
          "product_price",
        ]
      ),

    currency:
      getRowValue(
        row,
        [
          "currency",
        ]
      ) ||
      "EUR",

    shipping_price:
      normalizeAwinDeliveryCost(
        getRowValue(
          row,
          [
            "delivery_cost",
            "shipping_price",
          ]
        )
      ),

    stock:
      getRowValue(
        row,
        [
          "in_stock",
        ]
      ),

    url:
      deepLink,

    old_price:
      oldPrice,

    updated_at:
      getRowValue(
        row,
        [
          "last_updated",
        ]
      ),

    verified_at:
      observedAt,

    condition:
      getRowValue(
        row,
        [
          "condition",
        ]
      ),

    merchant_category:
      getRowValue(
        row,
        [
          "merchant_category",
        ]
      ),

    awin: {
      advertiserId:
        toText(
          advertiserId
        ),

      sourceProductId:
        toText(
          productId
        ) ||
        null,

      validFrom:
        getRowValue(
          row,
          [
            "valid_from",
          ]
        ),

      validTo:
        getRowValue(
          row,
          [
            "valid_to",
          ]
        ),
    },
  };
}


function importAwinProductFeed({
  content,
  advertiserId,
  advertiserName,
  observedAt =
    new Date()
      .toISOString(),
  betaOnly = true,
}) {
  if (
    !toText(
      advertiserId
    ) ||
    !toText(
      advertiserName
    )
  ) {
    throw new Error(
      "Awin advertiserId and advertiserName are required"
    );
  }

  const rows =
    parseCsv(
      content
    );

  const sourceName =
    "awin:" +
    toText(
      advertiserId
    );

  return stageSourceBatch({
    sourceName,
    rawItems:
      rows,

    betaOnly,

    mapItem:
      (
        row,
        index
      ) => {
        const generic =
          mapAwinProductRow(
            row,
            {
              advertiserId,
              advertiserName,
              observedAt,
            }
          );

        return mapNormalizedFeedItem(
          generic,
          index,
          sourceName
        );
      },
  });
}


async function fetchAwinFeedList({
  env = process.env,
  fetchImpl =
    globalThis.fetch,
} = {}) {
  const config =
    readAwinConfig(
      env
    );

  if (
    !config.configured
  ) {
    return {
      ok: false,
      reason:
        "missing_credentials",
      config: {
        ...config,
        datafeedKey:
          null,
      },
      feeds: [],
      requestUrl: null,
    };
  }

  if (
    !config
      .allowlistConfigured
  ) {
    return {
      ok: false,
      reason:
        "missing_advertiser_allowlist",
      config: {
        ...config,
        datafeedKey:
          null,
      },
      feeds: [],
      requestUrl: null,
    };
  }

  if (
    typeof fetchImpl !==
      "function"
  ) {
    throw new Error(
      "fetchImpl is required"
    );
  }

  const url =
    buildAwinFeedListUrl(
      config
    );

  const response =
    await fetchImpl(
      url,
      {
        headers: {
          accept:
            "text/csv",
        },
      }
    );

  if (
    !response ||
    response.ok !==
      true
  ) {
    const status =
      response
        ?.status ??
      "unknown";

    throw new Error(
      "Awin feed list request failed: " +
      status
    );
  }

  const content =
    await response.text();

  return {
    ok: true,
    reason: null,
    config: {
      ...config,
      datafeedKey:
        null,
    },
    feeds:
      parseAwinFeedList(
        content
      ),
    requestUrl:
      redactAwinUrl(
        url
      ),
  };
}


module.exports = {
  AWIN_FEED_LIST_BASE,
  readAwinConfig,
  buildAwinFeedListUrl,
  redactAwinUrl,
  isSafeAwinUrl,
  parseAwinFeedList,
  compareFeedTimestamp,
  selectChangedAwinFeeds,
  createAwinOfferId,
  normalizeAwinDeliveryCost,
  mapAwinProductRow,
  importAwinProductFeed,
  fetchAwinFeedList,
};
