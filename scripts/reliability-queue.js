const fs = require("fs");
const path = require("path");

const {
  buildReliabilityQueue,
} = require("../server/utils/reliabilityQueue");

const {
  resolveMaxAgeHours,
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

const maxAgeHours =
  resolveMaxAgeHours(
    getArg("--max-hours") ||
    process.env
      .DANISUA_OFFER_MAX_AGE_HOURS
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
      maxAgeHours,
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
      maxAgeHours,

      ...result,
    },
    null,
    2
  )
);
