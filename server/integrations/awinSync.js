const fs = require("fs");
const path = require("path");

const {
  readAwinConfig,
  fetchAwinFeedList,
  selectChangedAwinFeeds,
  importAwinProductFeed,
  isSafeAwinUrl,
  redactAwinUrl,
} = require("./awin");

const {
  resolveAwinFeedStatePath,
  loadAwinFeedState,
  saveAwinFeedState,
  getLastImportedByFeedId,
  markAwinFeedProcessed,
} = require("./awinState");

const {
  openDatabase,
  closeDatabase,
} = require("../db/database");

const {
  persistIngestionResult,
} = require("../db/persistIngestion");

const {
  getDatabasePath,
} = require("../sources/database");


const AWIN_MAX_CONCURRENT_DOWNLOADS = 5;


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


function parseStoreMap(
  value
) {
  const text =
    toText(
      value
    );

  if (!text) {
    return {};
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        text
      );
  } catch {
    throw new Error(
      "AWIN_STORE_MAP_JSON must be valid JSON"
    );
  }

  if (
    !parsed ||
    typeof parsed !==
      "object" ||
    Array.isArray(
      parsed
    )
  ) {
    throw new Error(
      "AWIN_STORE_MAP_JSON must be an object"
    );
  }

  const result = {};

  for (
    const [
      advertiserId,
      storeName,
    ] of Object.entries(
      parsed
    )
  ) {
    const id =
      toText(
        advertiserId
      );

    const name =
      toText(
        storeName
      );

    if (
      id &&
      name
    ) {
      result[
        id
      ] =
        name;
    }
  }

  return result;
}


function resolveAwinStoreName(
  feed,
  env = process.env
) {
  const map =
    parseStoreMap(
      env
        ?.AWIN_STORE_MAP_JSON
    );

  const advertiserId =
    toText(
      feed
        ?.advertiserId
    );

  return (
    map[
      advertiserId
    ] ||
    toText(
      feed
        ?.advertiserName
    )
  );
}


function countRejected(
  rejected
) {
  if (
    !rejected ||
    typeof rejected !==
      "object"
  ) {
    return 0;
  }

  return Object.values(
    rejected
  )
    .reduce(
      (
        total,
        items
      ) =>
        total +
        (
          Array.isArray(
            items
          )
            ? items.length
            : 0
        ),
      0
    );
}


function publicFeed(
  feed
) {
  return {
    advertiserId:
      feed
        ?.advertiserId ||
      null,

    advertiserName:
      feed
        ?.advertiserName ||
      null,

    feedId:
      feed
        ?.feedId ||
      null,

    feedName:
      feed
        ?.feedName ||
      null,

    primaryRegion:
      feed
        ?.primaryRegion ||
      null,

    lastImported:
      feed
        ?.lastImported ||
      null,

    previousLastImported:
      feed
        ?.previousLastImported ||
      null,

    productCount:
      feed
        ?.productCount ||
      0,

    downloadUrl:
      redactAwinUrl(
        feed
          ?.downloadUrl ||
        feed
          ?.url ||
        ""
      ),
  };
}


async function downloadAwinFeed(
  feed,
  {
    fetchImpl =
      globalThis.fetch,
  } = {}
) {
  const url =
    feed
      ?.downloadUrl ||
    feed
      ?.url;

  if (
    !url ||
    !isSafeAwinUrl(
      url
    )
  ) {
    throw new Error(
      "Unsafe or missing Awin feed URL"
    );
  }

  if (
    typeof fetchImpl !==
      "function"
  ) {
    throw new Error(
      "fetchImpl is required"
    );
  }

  const response =
    await fetchImpl(
      url,
      {
        headers: {
          accept:
            "text/csv,text/plain;q=0.9,*/*;q=0.1",
        },
      }
    );

  if (
    !response ||
    response.ok !==
      true
  ) {
    throw new Error(
      "Awin product feed request failed: " +
      (
        response
          ?.status ??
        "unknown"
      )
    );
  }

  if (
    response.url &&
    !isSafeAwinUrl(
      response.url
    )
  ) {
    throw new Error(
      "Awin product feed redirected to an unsafe host"
    );
  }

  const content =
    await response.text();

  if (
    content.includes(
      "\u0000"
    )
  ) {
    throw new Error(
      "Unsupported binary Awin feed response"
    );
  }

  return content;
}


async function syncAwinFeeds({
  env = process.env,
  fetchImpl =
    globalThis.fetch,
  apply = false,
  databasePath = null,
  statePath = null,
  maxFeeds =
    AWIN_MAX_CONCURRENT_DOWNLOADS,
  observedAtFactory =
    () =>
      new Date()
        .toISOString(),
} = {}) {
  const config =
    readAwinConfig(
      env
    );

  const feedList =
    await fetchAwinFeedList({
      env,
      fetchImpl,
    });

  if (!feedList.ok) {
    return {
      ok: false,
      applied: false,
      reason:
        feedList.reason,
      diagnostics: {
        selected:
          0,
        processed:
          0,
        failed:
          0,
      },
      selected: [],
      processed: [],
      failed: [],
    };
  }

  const resolvedStatePath =
    statePath
      ? path.resolve(
          statePath
        )
      : resolveAwinFeedStatePath(
          env
        );

  let state =
    loadAwinFeedState(
      resolvedStatePath
    );

  const plan =
    selectChangedAwinFeeds(
      feedList.feeds,
      {
        advertiserIds:
          config
            .advertiserIds,

        region:
          config.region,

        allowSoftMembership:
          config
            .allowSoftMembership,

        lastImportedByFeedId:
          getLastImportedByFeedId(
            state
          ),
      }
    );

  const safeMaxFeeds =
    Math.max(
      1,
      Math.min(
        AWIN_MAX_CONCURRENT_DOWNLOADS,
        Number.isFinite(
          Number(
            maxFeeds
          )
        )
          ? Math.floor(
              Number(
                maxFeeds
              )
            )
          : AWIN_MAX_CONCURRENT_DOWNLOADS
      )
    );

  const selected =
    plan.selected
      .slice(
        0,
        safeMaxFeeds
      );

  if (!apply) {
    return {
      ok: true,
      applied: false,
      reason: null,

      feedListRequest:
        feedList
          .requestUrl,

      statePath:
        resolvedStatePath,

      diagnostics: {
        available:
          feedList
            .feeds
            .length,

        selected:
          selected.length,

        skipped:
          plan
            .skipped
            .length,

        limitedByMaxFeeds:
          Math.max(
            0,
            plan
              .selected
              .length -
            selected.length
          ),

        processed: 0,
        failed: 0,
      },

      selected:
        selected.map(
          publicFeed
        ),

      processed: [],
      failed: [],
    };
  }

  const resolvedDatabasePath =
    databasePath
      ? path.resolve(
          databasePath
        )
      : getDatabasePath();

  fs.mkdirSync(
    path.dirname(
      resolvedDatabasePath
    ),
    {
      recursive: true,
    }
  );

  let db = null;

  const processed = [];
  const failed = [];

  try {
    db =
      openDatabase(
        resolvedDatabasePath
      );

    for (
      const feed of
      selected
    ) {
      try {
        const content =
          await downloadAwinFeed(
            feed,
            {
              fetchImpl,
            }
          );

        const storeName =
          resolveAwinStoreName(
            feed,
            env
          );

        if (!storeName) {
          throw new Error(
            "Unable to resolve canonical store name"
          );
        }

        const observedAt =
          observedAtFactory();

        const staging =
          importAwinProductFeed({
            content,
            advertiserId:
              feed
                .advertiserId,
            advertiserName:
              storeName,
            observedAt,
            betaOnly: true,
          });

        const persistence =
          persistIngestionResult(
            db,
            staging
          );

        state =
          markAwinFeedProcessed(
            state,
            feed,
            {
              processedAt:
                observedAt,
            }
          );

        state =
          saveAwinFeedState(
            resolvedStatePath,
            state
          );

        processed.push({
          ...publicFeed(
            feed
          ),

          storeName,

          observedAt,

          ingestion: {
            ready:
              staging
                .ready
                .length,

            needsReview:
              staging
                .needsReview
                .length,

            rejected:
              countRejected(
                staging
                  .rejected
              ),
          },

          persistence:
            persistence
              .diagnostics,
        });
      } catch (error) {
        failed.push({
          ...publicFeed(
            feed
          ),

          error:
            error
              ?.message ||
            String(
              error
            ),
        });
      }
    }
  } finally {
    if (db) {
      closeDatabase(
        db
      );
    }
  }

  return {
    ok:
      failed.length ===
      0,

    applied: true,

    reason:
      failed.length ===
        0
        ? null
        : "feed_processing_failed",

    feedListRequest:
      feedList
        .requestUrl,

    databasePath:
      resolvedDatabasePath,

    statePath:
      resolvedStatePath,

    diagnostics: {
      available:
        feedList
          .feeds
          .length,

      selected:
        selected.length,

      skipped:
        plan
          .skipped
          .length,

      limitedByMaxFeeds:
        Math.max(
          0,
          plan
            .selected
            .length -
          selected.length
        ),

      processed:
        processed.length,

      failed:
        failed.length,
    },

    selected:
      selected.map(
        publicFeed
      ),

    processed,
    failed,
  };
}


module.exports = {
  AWIN_MAX_CONCURRENT_DOWNLOADS,
  parseStoreMap,
  resolveAwinStoreName,
  countRejected,
  publicFeed,
  downloadAwinFeed,
  syncAwinFeeds,
};
