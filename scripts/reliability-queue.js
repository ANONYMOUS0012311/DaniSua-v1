const fs = require("fs");
const path = require("path");

const {
  buildReliabilityQueue,
} = require("../server/utils/reliabilityQueue");

const {
  DEFAULT_FRESH_HOURS,
  DEFAULT_REVIEW_HOURS,
} = require("../server/utils/freshness");


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


const file =
  getArg("--file") ||
  path.join(
    __dirname,
    "..",
    "data",
    "offers.real.json"
  );

const limitRaw =
  Number(
    getArg("--limit")
  );

const limit =
  Number.isInteger(
    limitRaw
  ) &&
  limitRaw > 0
    ? limitRaw
    : 30;

const freshHours =
  Number(
    getArg(
      "--fresh-hours"
    ) ||
    process.env
      .DANISUA_OFFER_FRESH_HOURS ||
    DEFAULT_FRESH_HOURS
  );

const reviewHours =
  Number(
    getArg(
      "--review-hours"
    ) ||
    process.env
      .DANISUA_OFFER_REVIEW_HOURS ||
    DEFAULT_REVIEW_HOURS
  );

const offers =
  JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );

const result =
  buildReliabilityQueue(
    offers,
    {
      freshHours,
      reviewHours,
      limit,
    }
  );

console.log(
  JSON.stringify(
    {
      generatedAt:
        new Date()
          .toISOString(),

      file,
      freshHours,
      reviewHours,

      ...result,
    },
    null,
    2
  )
);
