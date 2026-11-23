const fs = require("fs");
const path = require("path");

const {
  readAwinConfig,
  parseAwinFeedList,
  selectChangedAwinFeeds,
  redactAwinUrl,
} = require("../server/integrations/awin");

const {
  resolveAwinFeedStatePath,
  loadAwinFeedState,
  getLastImportedByFeedId,
} = require("../server/integrations/awinState");


function getArg(
  name
) {
  const prefix =
    name + "=";

  const inline =
    process.argv.find(
      arg =>
        arg.startsWith(
          prefix
        )
    );

  if (inline) {
    return inline.slice(
      prefix.length
    );
  }

  const index =
    process.argv.indexOf(
      name
    );

  if (
    index !== -1 &&
    process.argv[index + 1]
  ) {
    return process.argv[
      index + 1
    ];
  }

  return null;
}


function publicFeed(
  feed
) {
  return {
    advertiserId:
      feed.advertiserId,

    advertiserName:
      feed.advertiserName,

    primaryRegion:
      feed.primaryRegion,

    membershipStatus:
      feed.membershipStatus,

    datafeedFormat:
      feed.datafeedFormat,

    feedId:
      feed.feedId,

    feedName:
      feed.feedName,

    language:
      feed.language,

    vertical:
      feed.vertical,

    lastImported:
      feed.lastImported,

    lastChecked:
      feed.lastChecked,

    productCount:
      feed.productCount,

    previousLastImported:
      feed.previousLastImported ||
      null,

    downloadUrl:
      redactAwinUrl(
        feed.downloadUrl ||
        feed.url
      ),

    reasons:
      feed.reasons ||
      [],
  };
}


const feedListPath =
  getArg(
    "--feed-list"
  );

if (!feedListPath) {
  console.error(
    "Usage: npm run awin:plan -- --feed-list <feed-list.csv> [--state <state.json>]"
  );

  process.exit(1);
}


const config =
  readAwinConfig(
    process.env
  );

if (
  !config
    .allowlistConfigured
) {
  console.error(
    "AWIN_ADVERTISER_IDS is required. Safe default is to select zero feeds."
  );

  process.exit(2);
}


const statePath =
  getArg(
    "--state"
  )
    ? path.resolve(
        getArg(
          "--state"
        )
      )
    : resolveAwinFeedStatePath(
        process.env
      );


const state =
  loadAwinFeedState(
    statePath
  );


const feeds =
  parseAwinFeedList(
    fs.readFileSync(
      feedListPath,
      "utf8"
    )
  );


const plan =
  selectChangedAwinFeeds(
    feeds,
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


console.log(
  JSON.stringify(
    {
      generatedAt:
        new Date()
          .toISOString(),

      feedListPath:
        path.resolve(
          feedListPath
        ),

      statePath,

      config: {
        region:
          config.region,

        advertiserIds:
          config
            .advertiserIds,

        allowSoftMembership:
          config
            .allowSoftMembership,
      },

      diagnostics:
        plan.diagnostics,

      selected:
        plan.selected
          .map(
            publicFeed
          ),

      skipped:
        plan.skipped
          .map(
            publicFeed
          ),
    },
    null,
    2
  )
);
