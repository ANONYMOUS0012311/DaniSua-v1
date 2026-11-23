const fs = require("fs");
const path = require("path");
const {
  spawnSync,
} = require("child_process");

const {
  openDatabase,
  getOfferById,
  listOfferPriceHistory,
  closeDatabase,
} = require("../db/database");


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


function main() {
  const testDir =
    path.join(
      __dirname,
      "persistent-import-cli"
    );

  const inputPath =
    path.join(
      testDir,
      "feed.json"
    );

  const databasePath =
    path.join(
      testDir,
      "danisua.sqlite"
    );

  const scriptPath =
    path.join(
      __dirname,
      "..",
      "..",
      "scripts",
      "persist-offers.js"
    );

  fs.rmSync(
    testDir,
    {
      recursive: true,
      force: true,
    }
  );

  fs.mkdirSync(
    testDir,
    {
      recursive: true,
    }
  );

  const feed = [
    {
      id:
        "cli-offer-1",

      productId:
        "apple-iphone-15-pro-128",

      title:
        "Apple iPhone 15 Pro 128 GB",

      brand:
        "Apple",

      model:
        "iPhone 15 Pro",

      storage:
        "128 GB",

      store:
        "Unieuro",

      seller:
        "Unieuro",

      price:
        999.99,

      currency:
        "EUR",

      shipping_price:
        0,

      stock:
        true,

      url:
        "https://www.unieuro.it/online/test-cli-persistence",

      verified_at:
        "2026-11-23T19:00:00Z",
    },
  ];

  fs.writeFileSync(
    inputPath,
    JSON.stringify(
      feed,
      null,
      2
    ),
    "utf8"
  );

  try {
    const dryRun =
      spawnSync(
        process.execPath,
        [
          scriptPath,
          "--input",
          inputPath,
          "--source",
          "test-source",
          "--db",
          databasePath,
        ],
        {
          encoding:
            "utf8",
        }
      );

    assert(
      dryRun.status === 0,
      `Dry-run fallito: ${dryRun.stderr || dryRun.stdout}`
    );

    assert(
      !fs.existsSync(
        databasePath
      ),
      "Dry-run non deve creare il database"
    );

    const apply =
      spawnSync(
        process.execPath,
        [
          scriptPath,
          "--input",
          inputPath,
          "--source",
          "test-source",
          "--db",
          databasePath,
          "--apply",
          "--strict",
        ],
        {
          encoding:
            "utf8",
        }
      );

    assert(
      apply.status === 0,
      `Apply fallito: ${apply.stderr || apply.stdout}`
    );

    assert(
      fs.existsSync(
        databasePath
      ),
      "Apply deve creare il database"
    );

    let db = null;

    try {
      db =
        openDatabase(
          databasePath
        );

      const saved =
        getOfferById(
          db,
          "cli-offer-1"
        );

      assert(
        saved !== null &&
        saved.offer_price ===
          999.99,
        "Offerta applicata non trovata"
      );

      const history =
        listOfferPriceHistory(
          db,
          "cli-offer-1"
        );

      assert(
        history.length === 1 &&
        history[0]
          .verifiedAt ===
          "2026-11-23T19:00:00.000Z",
        "L'import persistente deve alimentare lo storico osservato"
      );
    } finally {
      if (db) {
        closeDatabase(
          db
        );
      }
    }

    console.log(
      "✅ PERSISTENT IMPORT CLI — dry-run e apply"
    );
  } finally {
    fs.rmSync(
      testDir,
      {
        recursive: true,
        force: true,
      }
    );
  }
}


try {
  main();
} catch (error) {
  console.error(
    "❌ PERSISTENT IMPORT CLI",
    error.message
  );

  process.exitCode = 1;
}
