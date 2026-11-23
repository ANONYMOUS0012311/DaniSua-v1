const fs = require("fs");
const net = require("net");
const path = require("path");
const {
  spawn,
} = require("child_process");


const PROJECT_ROOT =
  path.join(
    __dirname,
    "..",
    ".."
  );

const DATA_DIR =
  path.join(
    PROJECT_ROOT,
    "data"
  );

const SERVER_PATH =
  path.join(
    PROJECT_ROOT,
    "server",
    "index.js"
  );

const LOAD_PATH =
  path.join(
    PROJECT_ROOT,
    "scripts",
    "load-test.js"
  );

const FIXTURE_NAME =
  `.offers.load-smoke-${process.pid}.json`;

const FIXTURE_PATH =
  path.join(
    DATA_DIR,
    FIXTURE_NAME
  );

const DB_PATH =
  path.join(
    DATA_DIR,
    `.load-smoke-${process.pid}.sqlite`
  );


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


function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


async function getFreePort() {
  const server =
    net.createServer();

  await new Promise(
    (resolve, reject) => {
      server.once(
        "error",
        reject
      );

      server.listen(
        0,
        "127.0.0.1",
        resolve
      );
    }
  );

  const port =
    server.address()
      .port;

  await new Promise(
    resolve =>
      server.close(
        resolve
      )
  );

  return port;
}


async function waitUntilReady(
  baseUrl,
  child
) {
  for (
    let attempt = 0;
    attempt < 80;
    attempt += 1
  ) {
    if (
      child.exitCode !==
      null
    ) {
      throw new Error(
        `Server load smoke terminato prima del previsto: ${child.exitCode}`
      );
    }

    try {
      const response =
        await fetch(
          `${baseUrl}/health`
        );

      if (response.ok) {
        return;
      }
    } catch {
      // Server non ancora pronto.
    }

    await sleep(100);
  }

  throw new Error(
    "Timeout avvio server load smoke"
  );
}


async function stopChild(
  child
) {
  if (
    !child ||
    child.exitCode !==
      null
  ) {
    return;
  }

  child.kill(
    "SIGTERM"
  );

  await Promise.race([
    new Promise(
      resolve =>
        child.once(
          "exit",
          resolve
        )
    ),
    sleep(1500),
  ]);

  if (
    child.exitCode ===
      null
  ) {
    child.kill(
      "SIGKILL"
    );
  }
}


async function runLoadTest(
  url
) {
  return new Promise(
    (resolve, reject) => {
      const child =
        spawn(
          process.execPath,
          [
            LOAD_PATH,
            "--url",
            url,
            "--levels",
            "1,5",
            "--requests-per-level",
            "25",
            "--max-p95-ms",
            "2000",
            "--max-error-rate",
            "0",
            "--timeout-ms",
            "5000",
          ],
          {
            cwd:
              PROJECT_ROOT,
            stdio: [
              "ignore",
              "pipe",
              "pipe",
            ],
          }
        );

      let stdout = "";
      let stderr = "";

      child.stdout.on(
        "data",
        chunk => {
          stdout +=
            chunk.toString();
        }
      );

      child.stderr.on(
        "data",
        chunk => {
          stderr +=
            chunk.toString();
        }
      );

      child.once(
        "error",
        reject
      );

      child.once(
        "exit",
        code => {
          if (code === 0) {
            return resolve({
              stdout,
              stderr,
            });
          }

          return reject(
            new Error(
              `Load test fallito con codice ${code}.\n${stdout}\n${stderr}`
            )
          );
        }
      );
    }
  );
}


async function main() {
  const port =
    await getFreePort();

  const baseUrl =
    `http://127.0.0.1:${port}`;

  const verifiedAt =
    new Date(
      Date.now() -
      10 * 60 * 1000
    )
      .toISOString();

  const offers = [
    {
      id:
        "load-mediaworld-iphone17",
      productId:
        "apple-iphone-17-256-black",
      store:
        "MediaWorld",
      seller:
        "MediaWorld",
      old_price:
        979,
      offer_price:
        949.49,
      currency:
        "EUR",
      shipping_price:
        0,
      stock:
        true,
      url:
        "https://www.mediaworld.it/",
      updatedAt:
        verifiedAt,
      verifiedAt,
      pricing: {
        type:
          "standard",
        conditional:
          false,
        conditions: [],
        paymentOptions: [
          {
            type:
              "one_time",
            total_price:
              949.49,
          },
        ],
      },
    },
    {
      id:
        "load-apple-iphone17",
      productId:
        "apple-iphone-17-256-black",
      store:
        "Apple",
      seller:
        "Apple",
      old_price:
        null,
      offer_price:
        979,
      currency:
        "EUR",
      shipping_price:
        0,
      stock:
        true,
      url:
        "https://www.apple.com/it/",
      updatedAt:
        verifiedAt,
      verifiedAt,
      pricing: {
        type:
          "standard",
        conditional:
          false,
        conditions: [],
        paymentOptions: [
          {
            type:
              "one_time",
            total_price:
              979,
          },
        ],
      },
    },
  ];

  fs.writeFileSync(
    FIXTURE_PATH,
    JSON.stringify(
      offers,
      null,
      2
    )
  );

  let server = null;
  let serverStderr = "";

  try {
    server =
      spawn(
        process.execPath,
        [
          SERVER_PATH,
        ],
        {
          cwd:
            PROJECT_ROOT,
          env: {
            ...process.env,
            NODE_ENV:
              "production",
            PORT:
              String(port),
            HOST:
              "127.0.0.1",
            DANISUA_OFFERS_FILE:
              FIXTURE_NAME,
            DANISUA_DB_PATH:
              DB_PATH,
            CORS_ORIGINS:
              "https://danisua.netlify.app",
            AWIN_SYNC_ENABLED:
              "false",
          },
          stdio: [
            "ignore",
            "pipe",
            "pipe",
          ],
        }
      );

    server.stderr.on(
      "data",
      chunk => {
        serverStderr +=
          chunk.toString();
      }
    );

    await waitUntilReady(
      baseUrl,
      server
    );

    const query =
      encodeURIComponent(
        "iPhone 17 più economico"
      );

    const result =
      await runLoadTest(
        `${baseUrl}/search?q=${query}`
      );

    assert(
      result.stdout
        .includes(
          '"passed": true'
        ),
      "Il load test non ha confermato passed=true"
    );

    console.log(
      "✅ CLOSED BETA LOAD — 5 ricerche concorrenti, errore 0%, p95 < 2s"
    );
  } finally {
    await stopChild(
      server
    );

    for (
      const file of [
        FIXTURE_PATH,
        DB_PATH,
      ]
    ) {
      if (
        fs.existsSync(
          file
        )
      ) {
        fs.unlinkSync(
          file
        );
      }
    }
  }

  if (
    serverStderr.trim()
  ) {
    console.log(
      "ℹ️ Load server stderr:",
      serverStderr.trim()
    );
  }
}


main()
  .catch(
    error => {
      console.error(
        "❌ CLOSED BETA LOAD",
        error.message
      );

      for (
        const file of [
          FIXTURE_PATH,
          DB_PATH,
        ]
      ) {
        if (
          fs.existsSync(
            file
          )
        ) {
          fs.unlinkSync(
            file
          );
        }
      }

      process.exitCode = 1;
    }
  );
