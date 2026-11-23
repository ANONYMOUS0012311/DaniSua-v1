const fs = require("fs");
const path = require("path");

const {
  importFeedContent,
} = require("../server/ingestion/feedImporter");

const {
  openDatabase,
  closeDatabase,
} = require("../server/db/database");

const {
  persistIngestionResult,
} = require("../server/db/persistIngestion");

const {
  getDatabasePath,
} = require("../server/sources/database");


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


function countRejected(
  rejected
) {
  return Object.values(
    rejected || {}
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


const input =
  getArg(
    "--input"
  );

const sourceName =
  getArg(
    "--source"
  );

const apply =
  process.argv.includes(
    "--apply"
  );

const strict =
  process.argv.includes(
    "--strict"
  );

if (
  !input ||
  !sourceName
) {
  console.error(
    "Usage: npm run import:offers:db -- --input <file> --source <source> [--format json|csv] [--db <file>] [--apply] [--strict]"
  );

  process.exit(1);
}


const format =
  (
    getArg(
      "--format"
    ) ||
    path.extname(
      input
    )
      .slice(
        1
      ) ||
    "json"
  )
    .toLowerCase();


const explicitDb =
  getArg(
    "--db"
  );


const databasePath =
  explicitDb
    ? path.resolve(
        explicitDb
      )
    : getDatabasePath();


const content =
  fs.readFileSync(
    input,
    "utf8"
  );


const result =
  importFeedContent({
    content,
    format,
    sourceName,
    betaOnly: true,
  });


const rejectedCount =
  countRejected(
    result.rejected
  );


const summary = {
  mode:
    apply
      ? "apply"
      : "dry-run",

  input:
    path.resolve(
      input
    ),

  databasePath,

  format:
    result.format,

  sourceName:
    result.sourceName,

  diagnostics:
    result.diagnostics,

  ready:
    result.ready.length,

  needsReview:
    result.needsReview.length,

  rejected:
    rejectedCount,

  persistence: null,
};


if (
  strict &&
  (
    rejectedCount > 0 ||
    result.needsReview.length >
      0
  )
) {
  console.log(
    JSON.stringify(
      summary,
      null,
      2
    )
  );

  process.exitCode = 1;
} else if (!apply) {
  console.log(
    JSON.stringify(
      summary,
      null,
      2
    )
  );
} else {
  let db = null;

  try {
    const dir =
      path.dirname(
        databasePath
      );

    fs.mkdirSync(
      dir,
      {
        recursive: true,
      }
    );

    db =
      openDatabase(
        databasePath
      );

    const persisted =
      persistIngestionResult(
        db,
        result
      );

    summary.persistence =
      persisted.diagnostics;

    console.log(
      JSON.stringify(
        summary,
        null,
        2
      )
    );
  } finally {
    if (db) {
      closeDatabase(
        db
      );
    }
  }
}
