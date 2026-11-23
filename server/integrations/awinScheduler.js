const {
  readAwinConfig,
} = require("./awin");

const {
  syncAwinFeeds,
} = require("./awinSync");

const {
  logInfo,
  logError,
} = require("../utils/logger");


const DEFAULT_INTERVAL_MINUTES = 60;
const MIN_INTERVAL_MINUTES = 15;
const DEFAULT_JITTER_MAX_SECONDS = 120;
const MIN_JITTER_SECONDS = 10;


function parsePositiveNumber(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );

  return (
    Number.isFinite(
      parsed
    ) &&
    parsed > 0
  )
    ? parsed
    : fallback;
}


function readAwinSchedulerConfig(
  env = process.env
) {
  const awin =
    readAwinConfig(
      env
    );

  const enabled =
    String(
      env
        ?.AWIN_SYNC_ENABLED ||
      ""
    )
      .trim()
      .toLowerCase() ===
    "true";

  const intervalMinutes =
    Math.max(
      MIN_INTERVAL_MINUTES,
      parsePositiveNumber(
        env
          ?.AWIN_SYNC_INTERVAL_MINUTES,
        DEFAULT_INTERVAL_MINUTES
      )
    );

  const jitterMaxSeconds =
    Math.max(
      MIN_JITTER_SECONDS,
      Math.min(
        DEFAULT_JITTER_MAX_SECONDS,
        parsePositiveNumber(
          env
            ?.AWIN_SYNC_JITTER_MAX_SECONDS,
          DEFAULT_JITTER_MAX_SECONDS
        )
      )
    );

  let reason =
    null;

  if (!enabled) {
    reason =
      "disabled";
  } else if (
    !awin.configured
  ) {
    reason =
      "missing_credentials";
  } else if (
    !awin
      .allowlistConfigured
  ) {
    reason =
      "missing_advertiser_allowlist";
  }

  return {
    enabled,
    ready:
      enabled &&
      reason === null,

    reason,

    intervalMinutes,

    jitterMinSeconds:
      MIN_JITTER_SECONDS,

    jitterMaxSeconds,

    advertiserCount:
      awin
        .advertiserIds
        .length,

    region:
      awin.region,
  };
}


function getJitterMs(
  config,
  random =
    Math.random
) {
  const min =
    config
      .jitterMinSeconds;

  const max =
    Math.max(
      min,
      config
        .jitterMaxSeconds
    );

  const unit =
    Math.min(
      1,
      Math.max(
        0,
        Number(
          random()
        ) ||
        0
      )
    );

  const seconds =
    min +
    Math.floor(
      unit *
      (
        max -
        min +
        1
      )
    );

  return (
    seconds *
    1000
  );
}


function createAwinRuntimeScheduler({
  env = process.env,
  syncFn =
    syncAwinFeeds,
  setTimeoutFn =
    setTimeout,
  clearTimeoutFn =
    clearTimeout,
  random =
    Math.random,
  logger = {
    info:
      logInfo,
    error:
      logError,
  },
} = {}) {
  const config =
    readAwinSchedulerConfig(
      env
    );

  let timer =
    null;

  let running =
    false;

  let stopped =
    false;

  let lastRunAt =
    null;

  let lastResult =
    null;


  function schedule(
    delayMs
  ) {
    if (
      stopped ||
      !config.ready
    ) {
      return null;
    }

    timer =
      setTimeoutFn(
        runOnce,
        delayMs
      );

    if (
      timer &&
      typeof timer.unref ===
        "function"
    ) {
      timer.unref();
    }

    return timer;
  }


  function scheduleNext() {
    const intervalMs =
      config
        .intervalMinutes *
      60 *
      1000;

    return schedule(
      intervalMs +
      getJitterMs(
        config,
        random
      )
    );
  }


  async function runOnce() {
    if (
      stopped ||
      !config.ready
    ) {
      return {
        ok: false,
        skipped: true,
        reason:
          stopped
            ? "stopped"
            : config.reason,
      };
    }

    if (running) {
      return {
        ok: false,
        skipped: true,
        reason:
          "already_running",
      };
    }

    running =
      true;

    lastRunAt =
      new Date()
        .toISOString();

    try {
      const result =
        await syncFn({
          env,
          apply: true,
        });

      lastResult = {
        ok:
          result
            ?.ok === true,

        reason:
          result
            ?.reason ||
          null,

        processed:
          result
            ?.diagnostics
            ?.processed ||
          0,

        failed:
          result
            ?.diagnostics
            ?.failed ||
          0,

        selected:
          result
            ?.diagnostics
            ?.selected ||
          0,
      };

      logger.info(
        "awin_sync_run",
        {
          ok:
            lastResult.ok,

          reason:
            lastResult.reason,

          selected:
            lastResult.selected,

          processed:
            lastResult.processed,

          failed:
            lastResult.failed,
        }
      );

      return result;
    } catch (error) {
      lastResult = {
        ok: false,
        reason:
          "exception",
        selected: 0,
        processed: 0,
        failed: 1,
      };

      logger.error(
        "awin_sync_error",
        error
      );

      return {
        ok: false,
        reason:
          "exception",
      };
    } finally {
      running =
        false;

      if (!stopped) {
        scheduleNext();
      }
    }
  }


  function start() {
    if (
      stopped ||
      !config.ready
    ) {
      return {
        started: false,
        config,
      };
    }

    if (timer) {
      return {
        started: true,
        config,
      };
    }

    const initialDelayMs =
      getJitterMs(
        config,
        random
      );

    schedule(
      initialDelayMs
    );

    return {
      started: true,
      config,
      initialDelayMs,
    };
  }


  function stop() {
    stopped =
      true;

    if (timer) {
      clearTimeoutFn(
        timer
      );

      timer =
        null;
    }
  }


  function getState() {
    return {
      config,
      running,
      stopped,
      scheduled:
        Boolean(
          timer
        ),
      lastRunAt,
      lastResult,
    };
  }


  return {
    config,
    start,
    stop,
    runOnce,
    getState,
  };
}


function startAwinRuntimeScheduler(
  options = {}
) {
  const scheduler =
    createAwinRuntimeScheduler(
      options
    );

  const started =
    scheduler.start();

  logInfo(
    "awin_scheduler_status",
    {
      enabled:
        scheduler
          .config
          .enabled,

      ready:
        scheduler
          .config
          .ready,

      reason:
        scheduler
          .config
          .reason,

      intervalMinutes:
        scheduler
          .config
          .intervalMinutes,

      advertiserCount:
        scheduler
          .config
          .advertiserCount,

      started:
        started
          .started ===
        true,
    }
  );

  return scheduler;
}


module.exports = {
  DEFAULT_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  DEFAULT_JITTER_MAX_SECONDS,
  MIN_JITTER_SECONDS,
  readAwinSchedulerConfig,
  getJitterMs,
  createAwinRuntimeScheduler,
  startAwinRuntimeScheduler,
};
