const fs = require("fs");
const path = require("path");


const STATE_SCHEMA_VERSION = 1;


function createEmptyAwinFeedState() {
  return {
    schemaVersion:
      STATE_SCHEMA_VERSION,

    updatedAt:
      null,

    feeds: {},
  };
}


function resolveAwinFeedStatePath(
  env = process.env
) {
  if (
    env
      ?.AWIN_FEED_STATE_PATH
  ) {
    return path.resolve(
      env
        .AWIN_FEED_STATE_PATH
    );
  }

  if (
    env
      ?.DANISUA_DB_PATH
  ) {
    return path.join(
      path.dirname(
        path.resolve(
          env
            .DANISUA_DB_PATH
        )
      ),
      "awin-feed-state.json"
    );
  }

  return path.join(
    __dirname,
    "..",
    "..",
    "data",
    "awin-feed-state.json"
  );
}


function validateAwinFeedState(
  state
) {
  if (
    !state ||
    typeof state !==
      "object" ||
    Array.isArray(
      state
    )
  ) {
    throw new Error(
      "Invalid Awin feed state"
    );
  }

  if (
    state.schemaVersion !==
      STATE_SCHEMA_VERSION
  ) {
    throw new Error(
      "Unsupported Awin feed state schema"
    );
  }

  if (
    !state.feeds ||
    typeof state.feeds !==
      "object" ||
    Array.isArray(
      state.feeds
    )
  ) {
    throw new Error(
      "Invalid Awin feed state feeds"
    );
  }

  return state;
}


function loadAwinFeedState(
  filePath
) {
  if (
    !fs.existsSync(
      filePath
    )
  ) {
    return createEmptyAwinFeedState();
  }

  const parsed =
    JSON.parse(
      fs.readFileSync(
        filePath,
        "utf8"
      )
    );

  return validateAwinFeedState(
    parsed
  );
}


function saveAwinFeedState(
  filePath,
  state
) {
  validateAwinFeedState(
    state
  );

  const directory =
    path.dirname(
      filePath
    );

  fs.mkdirSync(
    directory,
    {
      recursive: true,
    }
  );

  const tmp =
    filePath +
    ".tmp-" +
    process.pid;

  const nextState = {
    ...state,

    updatedAt:
      new Date()
        .toISOString(),
  };

  fs.writeFileSync(
    tmp,
    JSON.stringify(
      nextState,
      null,
      2
    ) +
      "\n",
    "utf8"
  );

  fs.renameSync(
    tmp,
    filePath
  );

  return nextState;
}


function getLastImportedByFeedId(
  state
) {
  validateAwinFeedState(
    state
  );

  const result = {};

  for (
    const [
      feedId,
      record,
    ] of Object.entries(
      state.feeds
    )
  ) {
    if (
      record
        ?.lastImported
    ) {
      result[
        feedId
      ] =
        record
          .lastImported;
    }
  }

  return result;
}


function markAwinFeedProcessed(
  state,
  feed,
  {
    processedAt =
      new Date()
        .toISOString(),
  } = {}
) {
  validateAwinFeedState(
    state
  );

  const feedId =
    String(
      feed
        ?.feedId ||
      ""
    )
      .trim();

  const lastImported =
    String(
      feed
        ?.lastImported ||
      ""
    )
      .trim();

  if (
    !feedId ||
    !lastImported
  ) {
    throw new Error(
      "feedId and lastImported are required"
    );
  }

  return {
    ...state,

    feeds: {
      ...state.feeds,

      [feedId]: {
        advertiserId:
          feed
            ?.advertiserId ||
          null,

        advertiserName:
          feed
            ?.advertiserName ||
          null,

        feedName:
          feed
            ?.feedName ||
          null,

        lastImported,

        processedAt,
      },
    },
  };
}


module.exports = {
  STATE_SCHEMA_VERSION,
  createEmptyAwinFeedState,
  resolveAwinFeedStatePath,
  validateAwinFeedState,
  loadAwinFeedState,
  saveAwinFeedState,
  getLastImportedByFeedId,
  markAwinFeedProcessed,
};
