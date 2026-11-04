const fs = require("fs");
const path = require("path");

const {
  summarizeOfferFreshness,
  resolveMaxAgeHours,
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

const summary =
  summarizeOfferFreshness(
    offers,
    {
      maxAgeHours,
      allowUnknown: false,
    }
  );

console.log(
  JSON.stringify(
    {
      file,
      maxAgeHours,
      ...summary,
    },
    null,
    2
  )
);

if (
  strict &&
  summary.blocking.length > 0
) {
  process.exitCode = 1;
}
