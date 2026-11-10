const fs = require("fs");
const path = require("path");

function readJson(name) {
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

const products =
  readJson("products.json");

const rawKnowledge =
  readJson(
    "product_knowledge.json"
  );

const knowledgeItems =
  Array.isArray(rawKnowledge)
    ? rawKnowledge
    : (
        Array.isArray(
          rawKnowledge?.items
        )
          ? rawKnowledge.items
          : []
      );

const smartphoneProducts =
  products.filter(
    product =>
      product.category ===
      "smartphone"
  );

const SAMSUNG_BATTERY_PROTOCOL =
  "EU 2023/1669 battery endurance per cycle (hours)";

const SAMSUNG_EU_BATTERY_FAMILIES =
  new Set([
    "samsung-galaxy-s26-ultra",
    "samsung-galaxy-s26-plus",
    "samsung-galaxy-s26",
    "samsung-galaxy-s26-fe",
    "samsung-galaxy-a57",
    "samsung-galaxy-a37",
    "samsung-galaxy-z-fold8",
    "samsung-galaxy-z-flip8",
  ]);

const samsungSmartphoneProducts =
  smartphoneProducts.filter(
    product =>
      product.brand ===
        "Samsung" &&
      SAMSUNG_EU_BATTERY_FAMILIES
        .has(
          product.familyId
        )
  );

const knowledgeMap =
  new Map(
    knowledgeItems.map(
      item => [
        item.productId,
        item,
      ]
    )
  );

const familyMap =
  new Map();

for (const product of smartphoneProducts) {
  const familyId =
    product.familyId ||
    product.id;

  if (!familyMap.has(familyId)) {
    familyMap.set(
      familyId,
      []
    );
  }

  familyMap
    .get(familyId)
    .push(product);
}

function hasFacts(item) {
  return Boolean(
    item?.facts &&
    typeof item.facts ===
      "object" &&
    Object.keys(
      item.facts
    ).length > 0
  );
}

function numericCriteria(item) {
  return Object.entries(
    item?.scores || {}
  )
    .filter(
      ([, value]) =>
        typeof value ===
          "number" &&
        Number.isFinite(value)
    )
    .map(
      ([criterion]) =>
        criterion
    );
}

const families =
  Array.from(
    familyMap.entries()
  ).map(
    ([familyId, variants]) => {
      const knowledge =
        variants
          .map(
            variant =>
              knowledgeMap.get(
                variant.id
              ) || null
          )
          .filter(Boolean);

      const criteria =
        [
          ...new Set(
            knowledge.flatMap(
              numericCriteria
            )
          ),
        ].sort();

      const protocols = {};

      for (const criterion of criteria) {
        protocols[criterion] =
          [
            ...new Set(
              knowledge
                .map(
                  item =>
                    item
                      ?.scoreMeta
                      ?.[criterion]
                      ?.protocol ||
                    null
                )
                .filter(Boolean)
            ),
          ];
      }

      return {
        familyId,
        variants:
          variants.length,
        variantsWithKnowledge:
          knowledge.length,
        variantsWithFacts:
          knowledge.filter(
            hasFacts
          ).length,
        scoreCriteria:
          criteria,
        protocols,
      };
    }
  );

const variantsWithKnowledge =
  smartphoneProducts.filter(
    product =>
      knowledgeMap.has(
        product.id
      )
  ).length;

const variantsWithFacts =
  smartphoneProducts.filter(
    product =>
      hasFacts(
        knowledgeMap.get(
          product.id
        )
      )
  ).length;

const variantsWithScores =
  smartphoneProducts.filter(
    product =>
      numericCriteria(
        knowledgeMap.get(
          product.id
        )
      ).length > 0
  ).length;

const samsungBatteryCoverage = {
  variants:
    samsungSmartphoneProducts.length,

  variantsWithBatteryScore:
    samsungSmartphoneProducts.filter(
      product => {
        const item =
          knowledgeMap.get(
            product.id
          );

        return (
          typeof item
            ?.scores
            ?.battery ===
            "number" &&
          Number.isFinite(
            item.scores.battery
          )
        );
      }
    ).length,

  variantsWithExpectedProtocol:
    samsungSmartphoneProducts.filter(
      product => {
        const item =
          knowledgeMap.get(
            product.id
          );

        return (
          item
            ?.scoreMeta
            ?.battery
            ?.protocol ===
          SAMSUNG_BATTERY_PROTOCOL
        );
      }
    ).length,
};

samsungBatteryCoverage.complete =
  samsungBatteryCoverage
    .variants > 0 &&
  samsungBatteryCoverage
    .variantsWithBatteryScore ===
    samsungBatteryCoverage
      .variants &&
  samsungBatteryCoverage
    .variantsWithExpectedProtocol ===
    samsungBatteryCoverage
      .variants;


const summary = {
  smartphoneVariants:
    smartphoneProducts.length,
  smartphoneFamilies:
    familyMap.size,
  variantsWithKnowledge,
  variantsWithFacts,
  variantsWithComparableScores:
    variantsWithScores,
  knowledgeCoveragePercent:
    smartphoneProducts.length > 0
      ? Number(
          (
            (
              variantsWithKnowledge /
              smartphoneProducts.length
            ) *
            100
          ).toFixed(1)
        )
      : 0,
  factsCoveragePercent:
    smartphoneProducts.length > 0
      ? Number(
          (
            (
              variantsWithFacts /
              smartphoneProducts.length
            ) *
            100
          ).toFixed(1)
        )
      : 0,
  samsungBatteryCoverage,
};

console.log(
  JSON.stringify(
    {
      summary,
      families,
    },
    null,
    2
  )
);


if (
  !samsungBatteryCoverage.complete
) {
  console.error(
    "Samsung battery knowledge incomplete: " +
    samsungBatteryCoverage
      .variantsWithExpectedProtocol +
    "/" +
    samsungBatteryCoverage.variants
  );

  process.exitCode = 1;
}
