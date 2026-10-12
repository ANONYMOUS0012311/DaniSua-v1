const fs = require("fs");
const path = require("path");
const {
  spawn,
} = require("child_process");

const {
  openDatabase,
  upsertOffer,
  closeDatabase,
} = require("../db/database");


// ========================================
// DANISUA — DATABASE END TO END TEST
//
// SQLite temporanea
//      ↓
// databaseSource
//      ↓
// sourceRegistry
//      ↓
// /search
//      ↓
// DaniSua engine
//
// Il database di test viene eliminato
// alla fine.
// ========================================


const PROJECT_ROOT =
  path.join(
    __dirname,
    "..",
    ".."
  );


const DATABASE_PATH =
  path.join(
    __dirname,
    "danisua-e2e-test.sqlite"
  );


const SERVER_PATH =
  path.join(
    PROJECT_ROOT,
    "server",
    "index.js"
  );


const BASE_URL =
  "http://127.0.0.1:3000";


// ========================================
// ASSERT
// ========================================

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


// ========================================
// SLEEP
// ========================================

function sleep(
  milliseconds
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


// ========================================
// SERVER CHECK
// ========================================

async function isServerRunning() {
  try {
    const response =
      await fetch(
        `${BASE_URL}/health`,
        {
          signal:
            AbortSignal.timeout(
              800
            ),
        }
      );

    return response.ok;
  } catch {
    return false;
  }
}


// ========================================
// WAIT SERVER
// ========================================

async function waitForServer(
  child,
  timeoutMs = 10000
) {
  const startedAt =
    Date.now();


  while (
    Date.now() -
      startedAt <
    timeoutMs
  ) {
    if (
      child.exitCode !==
      null
    ) {
      throw new Error(
        `Server terminato prima del test con codice ${child.exitCode}`
      );
    }


    try {
      const response =
        await fetch(
          `${BASE_URL}/health`,
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


    await sleep(
      200
    );
  }


  throw new Error(
    "Timeout: il server DaniSua non è diventato disponibile"
  );
}


// ========================================
// STOP SERVER
// ========================================

async function stopServer(
  child
) {
  if (
    !child ||
    child.exitCode !==
      null
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

    sleep(
      1500
    ),
  ]);
}


// ========================================
// CREATE TEMP OFFER
// ========================================

function createTestDatabase() {
  if (
    fs.existsSync(
      DATABASE_PATH
    )
  ) {
    fs.unlinkSync(
      DATABASE_PATH
    );
  }


  const db =
    openDatabase(
      DATABASE_PATH
    );


  try {
    upsertOffer(
      db,
      {
        id:
          "e2e-db-offer-1",

        source:
          "awin-unieuro",

        store:
          "Unieuro",

        seller:
          "Unieuro",

        title:
          "Apple iPhone 15 Pro 128 GB",

        brand:
          "Apple",

        model:
          "iPhone 15 Pro",

        storage:
          "128 GB",

        offer_price:
          777.77,

        currency:
          "EUR",

        old_price:
          null,

        shipping_price:
          null,

        stock:
          true,

        url:
          "https://www.unieuro.it/online/e2e-test",

        updatedAt:
          null,

        productId:
          "apple-iphone-15-pro-128",

        familyId:
          "apple-iphone-15-pro",

        trust: {
          trustTier:
            "A",

          betaEligible:
            true,
        },

        productMatch: {
          confidence:
            0.99,

          reason:
            "variant_attributes_match",

          decision:
            "AUTO_MATCH",
        },
      }
    );

  } finally {

    closeDatabase(
      db
    );
  }
}


// ========================================
// MAIN
// ========================================

async function main() {
  console.log(
    "\nDaniSua Database End-to-End Smoke Test"
  );

  console.log(
    "======================================\n"
  );


  let serverProcess =
    null;


  let serverStdout =
    "";


  let serverStderr =
    "";


  try {

    // ====================================
    // PORT SAFETY
    // ====================================

    const alreadyRunning =
      await isServerRunning();


    if (alreadyRunning) {
      throw new Error(
        "La porta 3000 è già occupata da DaniSua. Chiudi il server aperto e riesegui il test."
      );
    }


    // ====================================
    // TEMP DATABASE
    // ====================================

    createTestDatabase();


    assert(
      fs.existsSync(
        DATABASE_PATH
      ),
      "Database SQLite temporaneo non creato"
    );


    // ====================================
    // START DANISUA
    //
    // Solo questo processo usa la DB
    // temporanea.
    // ====================================

    serverProcess =
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

            DANISUA_DB_PATH:
              DATABASE_PATH,
          },

          stdio: [
            "ignore",
            "pipe",
            "pipe",
          ],
        }
      );


    serverProcess
      .stdout
      .on(
        "data",
        chunk => {
          serverStdout +=
            chunk.toString();
        }
      );


    serverProcess
      .stderr
      .on(
        "data",
        chunk => {
          serverStderr +=
            chunk.toString();
        }
      );


    await waitForServer(
      serverProcess
    );


    // ====================================
    // SEARCH THROUGH REAL HTTP ENDPOINT
    // ====================================

    const query =
      "iphone 15 pro 128 gb";


    const response =
      await fetch(
        `${BASE_URL}/search?q=${encodeURIComponent(query)}`
      );


    assert(
      response.ok,
      `/search ha risposto HTTP ${response.status}`
    );


    const body =
      await response.json();


    assert(
      body &&
      typeof body ===
        "object",
      "Risposta /search non valida"
    );


    // Non assumiamo una struttura interna
    // specifica del response.
    //
    // Cerchiamo l'offerta persistita
    // nell'intera risposta DaniSua.
    const serialized =
      JSON.stringify(
        body
      );


    assert(
      serialized.includes(
        "e2e-db-offer-1"
      ),
      "L'offerta SQLite non è arrivata nella risposta /search"
    );


    assert(
      serialized.includes(
        "awin-unieuro"
      ),
      "La source originale dell'offerta non è stata preservata"
    );


    assert(
      serialized.includes(
        "777.77"
      ),
      "Il prezzo dell'offerta SQLite non è arrivato nella risposta"
    );


    assert(
      serialized.includes(
        "apple-iphone-15-pro-128"
      ),
      "Il productId persistito non è arrivato nella risposta"
    );


    // ====================================
    // SUCCESS
    // ====================================

    console.log(
      "✅ E2E — SQLite → registry → /search → DaniSua"
    );

    console.log(
      "\n✅ 1 test superato"
    );

    console.log(
      "❌ 0 test falliti\n"
    );

  } catch (error) {

    console.log(
      "❌ E2E — SQLite → registry → /search → DaniSua"
    );

    console.log(
      `   ${error.message}`
    );


    if (serverStdout.trim()) {
      console.log(
        "\n--- server stdout ---"
      );

      console.log(
        serverStdout.trim()
      );
    }


    if (serverStderr.trim()) {
      console.log(
        "\n--- server stderr ---"
      );

      console.log(
        serverStderr.trim()
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
      serverProcess
    );


    if (
      fs.existsSync(
        DATABASE_PATH
      )
    ) {
      try {
        fs.unlinkSync(
          DATABASE_PATH
        );
      } catch {
        // Il test ha già terminato.
        // Non nascondiamo l'esito per
        // un eventuale lock Windows.
      }
    }
  }
}


main();