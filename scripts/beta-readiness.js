const fs = require("fs");
const path = require("path");

const {
  buildBetaReadiness,
} = require("../server/utils/betaReadiness");


function readJson(
  name
) {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "data",
        name
      ),
      "utf8"
    )
  );
}


const strict =
  process.argv.includes(
    "--strict"
  );

const closedStrict =
  process.argv.includes(
    "--closed-strict"
  );

const result =
  buildBetaReadiness({
    offers:
      readJson(
        "offers.real.json"
      ),
    products:
      readJson(
        "products.json"
      ),
    targets:
      readJson(
        "catalog_targets.smartphones.json"
      ),
    env:
      process.env,
  });


console.log(
  JSON.stringify(
    {
      generatedAt:
        new Date()
          .toISOString(),
      ...result,
    },
    null,
    2
  )
);


if (
  strict &&
  result
    .readyForPublicBeta !==
    true
) {
  process.exitCode = 1;
}

if (
  closedStrict &&
  result
    .readyForClosedBeta !==
    true
) {
  process.exitCode = 1;
}
