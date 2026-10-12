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


const SERVER_PATH =
  path.join(
    PROJECT_ROOT,
    "server",
    "index.js"
  );


function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}


function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
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


  const address =
    server.address();


  const port =
    address.port;


  await new Promise(
    resolve =>
      server.close(resolve)
  );


  return port;
}


async function waitForServer(
  baseUrl,
  child,
  timeoutMs = 10000
) {
  const startedAt =
    Date.now();


  while (
    Date.now() - startedAt <
    timeoutMs
  ) {
    if (
      child.exitCode !== null
    ) {
      throw new Error(
        `Server terminato con codice ${child.exitCode}`
      );
    }


    try {
      const response =
        await fetch(
          `${baseUrl}/health`,
          {
            signal:
              AbortSignal.timeout(
                800
              ),
          }
        );


      if (response.ok) {
        return;
      }
    } catch {
      // Server non ancora pronto.
    }


    await sleep(200);
  }


  throw new Error(
    "Timeout avvio server"
  );
}


async function stopServer(
  child
) {
  if (
    !child ||
    child.exitCode !== null
  ) {
    return;
  }


  child.kill();


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
}


async function main() {
  console.log(
    "\nDaniSua Production Config Smoke Test"
  );

  console.log(
    "====================================\n"
  );


  let child = null;

  let stdout = "";
  let stderr = "";


  try {
    const port =
      await getFreePort();


    const host =
      "127.0.0.1";


    const baseUrl =
      `http://${host}:${port}`;


    child =
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

            PORT:
              String(port),

            HOST:
              host,

            NODE_ENV:
              "production",

            CORS_ORIGINS:
              "https://app.danisua.test",
          },

          stdio: [
            "ignore",
            "pipe",
            "pipe",
          ],
        }
      );


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


    await waitForServer(
      baseUrl,
      child
    );


    // ====================================
    // PORT / HOST
    // ====================================

    const health =
      await fetch(
        `${baseUrl}/health`
      );


    assert(
      health.ok,
      "Health check non disponibile sul PORT configurato"
    );


    // ====================================
    // DEFAULT PRODUCTION ORIGIN
    // ====================================

    const netlifyResponse =
      await fetch(
        `${baseUrl}/health`,
        {
          headers: {
            Origin:
              "https://danisua.netlify.app",
          },
        }
      );


    assert(
      netlifyResponse.ok,
      "Origin Netlify rifiutata"
    );


    assert(
      netlifyResponse.headers.get(
        "access-control-allow-origin"
      ) ===
        "https://danisua.netlify.app",
      "Header CORS Netlify inatteso"
    );


    // ====================================
    // ENV CONFIGURED ORIGIN
    // ====================================

    const configuredResponse =
      await fetch(
        `${baseUrl}/health`,
        {
          headers: {
            Origin:
              "https://app.danisua.test",
          },
        }
      );


    assert(
      configuredResponse.ok,
      "Origin configurata via CORS_ORIGINS rifiutata"
    );


    assert(
      configuredResponse.headers.get(
        "access-control-allow-origin"
      ) ===
        "https://app.danisua.test",
      "Header CORS configurato inatteso"
    );


    // ====================================
    // UNKNOWN ORIGIN
    // ====================================

    const blockedResponse =
      await fetch(
        `${baseUrl}/health`,
        {
          headers: {
            Origin:
              "https://example.com",
          },
        }
      );


    assert(
      blockedResponse.headers.get(
        "access-control-allow-origin"
      ) === null,
      "Origin sconosciuta non dovrebbe ricevere autorizzazione CORS"
    );


    // ====================================
    // LOCALHOST BLOCKED IN PRODUCTION
    // ====================================

    const localhostResponse =
      await fetch(
        `${baseUrl}/health`,
        {
          headers: {
            Origin:
              "http://localhost:5500",
          },
        }
      );


    assert(
      localhostResponse.headers.get(
        "access-control-allow-origin"
      ) === null,
      "localhost non dovrebbe essere autorizzato in production"
    );


    console.log(
      "✅ PRODUCTION CONFIG — PORT, HOST e CORS"
    );

    console.log(
      "\n✅ 1 test superato"
    );

    console.log(
      "❌ 0 test falliti\n"
    );

  } catch (error) {

    console.log(
      "❌ PRODUCTION CONFIG — PORT, HOST e CORS"
    );

    console.log(
      `   ${error.message}`
    );


    if (stdout.trim()) {
      console.log(
        "\n--- server stdout ---"
      );

      console.log(
        stdout.trim()
      );
    }


    if (stderr.trim()) {
      console.log(
        "\n--- server stderr ---"
      );

      console.log(
        stderr.trim()
      );
    }


    console.log(
      "\n✅ 0 test superati"
    );

    console.log(
      "❌ 1 test fallito\n"
    );

    process.exitCode = 1;

  } finally {

    await stopServer(
      child
    );
  }
}


main();