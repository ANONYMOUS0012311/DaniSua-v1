const {
  readAwinSchedulerConfig,
  getJitterMs,
  createAwinRuntimeScheduler,
} = require("../integrations/awinScheduler");


function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(
      message
    );
  }
}


async function main() {
  const disabled =
    readAwinSchedulerConfig(
      {}
    );

  assert(
    disabled.enabled ===
      false &&
    disabled.ready ===
      false &&
    disabled.reason ===
      "disabled",
    "Scheduler deve essere disattivato per default"
  );


  const missingCredentials =
    readAwinSchedulerConfig({
      AWIN_SYNC_ENABLED:
        "true",
      AWIN_ADVERTISER_IDS:
        "1001",
    });

  assert(
    missingCredentials
      .ready === false &&
    missingCredentials
      .reason ===
      "missing_credentials",
    "Scheduler non deve partire senza credenziali"
  );


  const env = {
    AWIN_SYNC_ENABLED:
      "true",

    AWIN_SYNC_INTERVAL_MINUTES:
      "60",

    AWIN_SYNC_JITTER_MAX_SECONDS:
      "120",

    AWIN_PUBLISHER_ID:
      "12345",

    AWIN_DATAFEED_KEY:
      "secret",

    AWIN_ADVERTISER_IDS:
      "1001,1002",

    AWIN_PRIMARY_REGION:
      "IT",
  };

  const ready =
    readAwinSchedulerConfig(
      env
    );

  assert(
    ready.ready ===
      true &&
    ready.intervalMinutes ===
      60 &&
    ready.advertiserCount ===
      2,
    "Configurazione scheduler Awin inattesa"
  );


  assert(
    getJitterMs(
      ready,
      () => 0
    ) ===
      10000,
    "Jitter minimo deve essere 10 secondi"
  );

  assert(
    getJitterMs(
      ready,
      () => 1
    ) ===
      120000,
    "Jitter massimo deve essere 120 secondi"
  );


  const scheduled = [];
  const cleared = [];
  const logs = [];

  const fakeTimer = {
    unref() {},
  };

  let syncCalls = 0;

  const scheduler =
    createAwinRuntimeScheduler({
      env,

      random:
        () => 0,

      setTimeoutFn:
        (
          fn,
          delay
        ) => {
          scheduled.push({
            fn,
            delay,
          });

          return fakeTimer;
        },

      clearTimeoutFn:
        timer => {
          cleared.push(
            timer
          );
        },

      syncFn:
        async options => {
          syncCalls += 1;

          assert(
            options.apply ===
              true,
            "Scheduler deve eseguire sync in apply mode"
          );

          return {
            ok: true,
            reason: null,
            diagnostics: {
              selected: 1,
              processed: 1,
              failed: 0,
            },
          };
        },

      logger: {
        info(
          event,
          fields
        ) {
          logs.push({
            level:
              "info",
            event,
            fields,
          });
        },

        error(
          event,
          error
        ) {
          logs.push({
            level:
              "error",
            event,
            error:
              error
                ?.message,
          });
        },
      },
    });

  const start =
    scheduler.start();

  assert(
    start.started ===
      true &&
    scheduled.length ===
      1 &&
    scheduled[0]
      .delay ===
      10000,
    "Scheduler deve partire con jitter iniziale"
  );


  const result =
    await scheduler.runOnce();

  assert(
    result.ok ===
      true &&
    syncCalls === 1,
    "runOnce deve eseguire un sync"
  );

  assert(
    scheduled.length ===
      2 &&
    scheduled[1]
      .delay ===
      (
        60 *
        60 *
        1000 +
        10000
      ),
    "Dopo il sync deve pianificare il prossimo ciclo"
  );

  assert(
    logs.some(
      item =>
        item.event ===
          "awin_sync_run" &&
        item.fields
          ?.processed ===
          1
    ),
    "Scheduler deve loggare solo il riepilogo del sync"
  );


  scheduler.stop();

  assert(
    cleared.length ===
      1 &&
    scheduler
      .getState()
      .stopped ===
      true,
    "stop deve cancellare il timer"
  );


  let disabledSchedules = 0;

  const disabledScheduler =
    createAwinRuntimeScheduler({
      env: {
        AWIN_SYNC_ENABLED:
          "false",
      },

      setTimeoutFn:
        () => {
          disabledSchedules += 1;
        },
    });

  const disabledStart =
    disabledScheduler
      .start();

  assert(
    disabledStart
      .started ===
      false &&
    disabledSchedules ===
      0,
    "Scheduler disabilitato non deve creare timer"
  );


  console.log(
    "✅ AWIN SCHEDULER — opt-in, jitter e no overlap"
  );
}


main()
  .catch(
    error => {
      console.error(
        "❌ AWIN SCHEDULER",
        error.message
      );

      process.exitCode = 1;
    }
  );
