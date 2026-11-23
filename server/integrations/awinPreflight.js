const {
  readAwinConfig,
} = require("./awin");

const {
  readAwinSchedulerConfig,
} = require("./awinScheduler");

const {
  syncAwinFeeds,
} = require("./awinSync");


function buildMissingConfigResult(
  config,
  scheduler
) {
  let reason =
    null;

  if (
    !config.configured
  ) {
    reason =
      "missing_credentials";
  } else if (
    !config
      .allowlistConfigured
  ) {
    reason =
      "missing_advertiser_allowlist";
  }

  return {
    ok: false,
    ready: false,
    reason,
    configuration: {
      credentialsConfigured:
        config.configured,
      allowlistConfigured:
        config
          .allowlistConfigured,
      advertiserCount:
        config
          .advertiserIds
          .length,
      region:
        config.region,
      schedulerEnabled:
        scheduler.enabled,
      schedulerReady:
        scheduler.ready,
    },
    dryRun: {
      attempted: false,
      selectedFeeds: 0,
      skippedFeeds: 0,
      sourcesFailed: 0,
    },
  };
}


async function runAwinPreflight({
  env = process.env,
  fetchImpl =
    globalThis.fetch,
} = {}) {
  const config =
    readAwinConfig(
      env
    );

  const scheduler =
    readAwinSchedulerConfig(
      env
    );

  if (
    !config.configured ||
    !config
      .allowlistConfigured
  ) {
    return buildMissingConfigResult(
      config,
      scheduler
    );
  }

  const dryRun =
    await syncAwinFeeds({
      env,
      fetchImpl,
      apply: false,
    });

  const diagnostics =
    dryRun
      ?.diagnostics ||
    {};

  const selectedFeeds =
    Number(
      diagnostics.selected ||
      0
    );

  const skippedFeeds =
    Number(
      diagnostics.skipped ||
      0
    );

  const sourcesFailed =
    Number(
      diagnostics.failed ||
      0
    );

  const ready =
    dryRun?.ok === true &&
    sourcesFailed === 0;

  return {
    ok:
      dryRun?.ok === true,
    ready,
    reason:
      dryRun?.reason ||
      (
        ready
          ? null
          : "dry_run_failed"
      ),
    configuration: {
      credentialsConfigured:
        config.configured,
      allowlistConfigured:
        config
          .allowlistConfigured,
      advertiserCount:
        config
          .advertiserIds
          .length,
      region:
        config.region,
      schedulerEnabled:
        scheduler.enabled,
      schedulerReady:
        scheduler.ready,
    },
    dryRun: {
      attempted: true,
      selectedFeeds,
      skippedFeeds,
      sourcesFailed,
    },
  };
}


module.exports = {
  buildMissingConfigResult,
  runAwinPreflight,
};
