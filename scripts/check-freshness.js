const fs = require("fs");
const path = require("path");

const {
  DEFAULT_FRESH_HOURS,
  DEFAULT_REVIEW_HOURS,
  evaluateOfferReliability,
} = require("../server/utils/freshness");


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


function positiveNumber(
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


const strict =
  process.argv.includes(
    "--strict"
  );

const file =
  getArg("--file") ||
  path.join(
    __dirname,
    "..",
    "data",
    "offers.real.json"
  );

const freshHours =
  positiveNumber(
    getArg("--fresh-hours") ||
    process.env
      .DANISUA_OFFER_FRESH_HOURS,
    DEFAULT_FRESH_HOURS
  );

const reviewHours =
  Math.max(
    freshHours,
    positiveNumber(
      getArg("--review-hours") ||
      process.env
        .DANISUA_OFFER_REVIEW_HOURS,
      DEFAULT_REVIEW_HOURS
    )
  );

const offers =
  JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );

const summary = {
  total: 0,
  fresh: 0,
  review: 0,
  stale: 0,
  unknown: 0,
  invalid: 0,
  future: 0,
  requiresRefresh: 0,
  blocking: [],
};

for (
  const offer of
  Array.isArray(offers)
    ? offers
    : []
) {
  const reliability =
    evaluateOfferReliability(
      offer,
      {
        freshHours,
        reviewHours,
      }
    );

  summary.total += 1;

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        summary,
        reliability.status
      )
  ) {
    summary[
      reliability.status
    ] += 1;
  } else {
    summary.unknown += 1;
  }

  if (
    reliability
      .requiresRefresh ===
    true
  ) {
    summary.requiresRefresh +=
      1;
  }

  if (
    reliability.status !==
      "fresh"
  ) {
    summary.blocking.push({
      id:
        offer?.id ||
        null,
      status:
        reliability.status,
      timestamp:
        reliability.timestamp,
      timestampPrecision:
        reliability
          .timestampPrecision,
      ageHours:
        reliability.ageHours,
    });
  }
}

const freshRatio =
  summary.total > 0
    ? Number(
        (
          summary.fresh /
          summary.total
        )
          .toFixed(
            4
          )
      )
    : null;

console.log(
  JSON.stringify(
    {
      file,
      policy: {
        freshHours,
        reviewHours,
        staleAfterHours:
          reviewHours,
      },
      freshRatio,
      ...summary,
    },
    null,
    2
  )
);

if (
  strict &&
  summary.blocking.length >
    0
) {
  process.exitCode = 1;
}
