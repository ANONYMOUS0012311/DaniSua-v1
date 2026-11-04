const fs = require("fs");
const path = require("path");

const {
  importFeedContent,
} = require("../server/ingestion/feedImporter");

function getArg(name) {
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

const input =
  getArg("--input");

const sourceName =
  getArg("--source");

const strict =
  process.argv.includes(
    "--strict"
  );

if (!input || !sourceName) {
  console.error(
    "Usage: npm run import:offers -- --input <file> --source <source> [--format json|csv] [--report <file>] [--strict]"
  );

  process.exit(1);
}

const format =
  (
    getArg("--format") ||
    path.extname(input)
      .slice(1) ||
    "json"
  )
    .toLowerCase();

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

const report = {
  format:
    result.format,
  sourceName:
    result.sourceName,
  diagnostics:
    result.diagnostics,
  ready:
    result.ready,
  needsReview:
    result.needsReview,
  rejected:
    result.rejected,
};

console.log(
  JSON.stringify(
    report,
    null,
    2
  )
);

const reportPath =
  getArg("--report");

if (reportPath) {
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      report,
      null,
      2
    ) + "\n",
    "utf8"
  );
}

const rejectedCount =
  Object.values(
    result.rejected
  )
    .reduce(
      (
        total,
        items
      ) =>
        total +
        (
          Array.isArray(items)
            ? items.length
            : 0
        ),
      0
    );

if (
  strict &&
  (
    rejectedCount > 0 ||
    result.needsReview.length > 0
  )
) {
  process.exitCode = 1;
}
