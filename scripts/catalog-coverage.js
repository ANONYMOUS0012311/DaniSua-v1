const fs = require("fs");
const path = require("path");

function readJson(name) {
  return JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "data", name),
      "utf8"
    )
  );
}

const targets = readJson("catalog_targets.smartphones.json");
const products = readJson("products.json");
const offers = readJson("offers.real.json");

const smartphoneProducts =
  products.filter(
    product =>
      product.category ===
      "smartphone"
  );

const productsByFamily =
  new Map();

for (const product of smartphoneProducts) {
  const familyId =
    product.familyId ||
    product.id;

  if (!productsByFamily.has(familyId)) {
    productsByFamily.set(
      familyId,
      []
    );
  }

  productsByFamily
    .get(familyId)
    .push(product);
}

const PRICE_SHAPING_FIELDS = [
  "storage",
  "ram",
  "condition",
  "connectivity",
];

function getRequiredConfigurations(target) {
  if (
    Array.isArray(
      target
        ?.priceShapingConfigurations
    ) &&
    target
      .priceShapingConfigurations
      .length > 0
  ) {
    return target
      .priceShapingConfigurations
      .map(
        configuration =>
          Object.fromEntries(
            PRICE_SHAPING_FIELDS
              .filter(
                field =>
                  configuration
                    ?.[field] != null
              )
              .map(
                field => [
                  field,
                  String(
                    configuration[field]
                  ),
                ]
              )
          )
      )
      .filter(
        configuration =>
          Object.keys(
            configuration
          ).length > 0
      );
  }

  const storages =
    Array.isArray(
      target
        ?.priceShapingDimensions
        ?.storage
    )
      ? target
          .priceShapingDimensions
          .storage
      : [];

  return storages.map(
    storage => ({
      storage:
        String(storage),
    })
  );
}

function matchesConfiguration(
  product,
  configuration
) {
  return Object.entries(
    configuration
  ).every(
    ([field, value]) =>
      String(
        product?.[field] ??
        product
          ?.attributes
          ?.[field] ??
        ""
      ) ===
      String(value)
  );
}

function configurationLabel(
  configuration
) {
  return [
    configuration.ram,
    configuration.storage,
    configuration.connectivity,
    configuration.condition,
  ]
    .filter(Boolean)
    .join(" + ");
}


const offersByProduct =
  new Map();

for (const offer of offers) {
  if (!offersByProduct.has(offer.productId)) {
    offersByProduct.set(
      offer.productId,
      []
    );
  }

  offersByProduct
    .get(offer.productId)
    .push(offer);
}

const rows =
  targets.families.map(
    target => {
      const familyProducts =
        productsByFamily.get(
          target.familyId
        ) || [];

      const familyOffers =
        familyProducts.flatMap(
          product =>
            offersByProduct.get(
              product.id
            ) || []
        );

      const verifiedOffers =
        familyOffers.filter(
          offer =>
            Boolean(
              offer.verifiedAt
            )
        );

      const availableVerifiedOffers =
        verifiedOffers.filter(
          offer =>
            offer.stock !== false
        );

      const comparableOffers =
        verifiedOffers.filter(
          offer =>
            offer.pricing
              ?.conditional !==
            true
        );

      const conditionalOffers =
        verifiedOffers.filter(
          offer =>
            offer.pricing
              ?.conditional ===
            true
        );

      const stores =
        [
          ...new Set(
            comparableOffers
              .map(
                offer =>
                  offer.store
              )
              .filter(Boolean)
          ),
        ].sort();

      const conditionalStores =
        [
          ...new Set(
            conditionalOffers
              .map(
                offer =>
                  offer.store
              )
              .filter(Boolean)
          ),
        ].sort();

      const requiredConfigurations =
        getRequiredConfigurations(
          target
        );

      const catalogedConfigurations =
        requiredConfigurations
          .filter(
            configuration =>
              familyProducts
                .some(
                  product =>
                    matchesConfiguration(
                      product,
                      configuration
                    )
                )
          );

      const pricedConfigurations =
        requiredConfigurations
          .filter(
            configuration =>
              familyProducts
                .filter(
                  product =>
                    matchesConfiguration(
                      product,
                      configuration
                    )
                )
                .some(
                  product =>
                    availableVerifiedOffers
                      .some(
                        offer =>
                          offer.productId ===
                            product.id &&
                          offer.pricing
                            ?.conditional !==
                            true
                      )
                )
          );

      const catalogedConfigurationLabels =
        catalogedConfigurations.map(
          configurationLabel
        );

      const pricedConfigurationLabels =
        pricedConfigurations.map(
          configurationLabel
        );

      const missingCatalogConfigurations =
        requiredConfigurations
          .filter(
            configuration =>
              !catalogedConfigurationLabels
                .includes(
                  configurationLabel(
                    configuration
                  )
                )
          );

      const missingPricedConfigurations =
        requiredConfigurations
          .filter(
            configuration =>
              !pricedConfigurationLabels
                .includes(
                  configurationLabel(
                    configuration
                  )
                )
          );

      const requiredStorageValues =
        [
          ...new Set(
            requiredConfigurations
              .map(
                configuration =>
                  configuration.storage
              )
              .filter(Boolean)
          ),
        ];

      const catalogedStorageValues =
        [
          ...new Set(
            catalogedConfigurations
              .map(
                configuration =>
                  configuration.storage
              )
              .filter(Boolean)
          ),
        ];

      const pricedStorageValues =
        [
          ...new Set(
            pricedConfigurations
              .map(
                configuration =>
                  configuration.storage
              )
              .filter(Boolean)
          ),
        ];

      const missingCatalogStorageValues =
        requiredStorageValues
          .filter(
            value =>
              !catalogedStorageValues
                .includes(value)
          );

      const missingPricedStorageValues =
        requiredStorageValues
          .filter(
            value =>
              !pricedStorageValues
                .includes(value)
          );

      const variantDepthTracked =
        requiredConfigurations
          .length > 0;

      const variantDepthStatus =
        !variantDepthTracked
          ? "not_tracked"
          : (
              missingCatalogConfigurations
                .length > 0
                ? "missing_variants"
                : (
                    missingPricedConfigurations
                      .length > 0
                      ? "missing_prices"
                      : "ready"
                  )
            );

      let status = "missing";

      if (
        familyProducts.length > 0 &&
        familyOffers.length === 0
      ) {
        status =
          "cataloged_no_price";
      } else if (
        stores.length >=
        target.minimumStores
      ) {
        status = "ready";
      } else if (
        familyOffers.length > 0
      ) {
        status = "thin";
      }

      return {
        familyId:
          target.familyId,
        familyName:
          target.familyName,
        brand:
          target.brand,
        priority:
          target.priority,
        segment:
          target.segment,
        betaTier:
          target.betaTier ||
          "breadth",
        minimumStores:
          target.minimumStores,
        variants:
          familyProducts.length,
        offers:
          familyOffers.length,
        verifiedOffers:
          verifiedOffers.length,
        comparableOffers:
          comparableOffers.length,
        conditionalOffers:
          conditionalOffers.length,
        stores,
        storeCount:
          stores.length,
        conditionalStores,
        variantDepth: {
          tracked:
            variantDepthTracked,
          status:
            variantDepthStatus,
          requiredConfigurations,
          catalogedConfigurations,
          pricedConfigurations,
          missingCatalogConfigurations,
          missingPricedConfigurations,
          requiredConfigurationLabels:
            requiredConfigurations
              .map(
                configurationLabel
              ),
          catalogedConfigurationLabels,
          pricedConfigurationLabels,
          missingCatalogConfigurationLabels:
            missingCatalogConfigurations
              .map(
                configurationLabel
              ),
          missingPricedConfigurationLabels:
            missingPricedConfigurations
              .map(
                configurationLabel
              ),
          requiredStorageValues,
          catalogedStorageValues,
          pricedStorageValues,
          missingCatalogStorageValues,
          missingPricedStorageValues,
        },
        status,
      };
    }
  );

const count =
  status =>
    rows.filter(
      row =>
        row.status ===
        status
    ).length;

const p0 =
  rows.filter(
    row =>
      row.priority === "P0"
  );

const p0Ready =
  p0.filter(
    row =>
      row.status === "ready"
  ).length;

const betaDepthRows =
  rows.filter(
    row =>
      row.betaTier === "core" ||
      row.betaTier === "important"
  );

const betaDepthReady =
  betaDepthRows.filter(
    row =>
      row.status === "ready"
  );

const coreRows =
  rows.filter(
    row =>
      row.betaTier === "core"
  );

const importantRows =
  rows.filter(
    row =>
      row.betaTier === "important"
  );

const variantDepthRows =
  rows.filter(
    row =>
      row.variantDepth
        ?.tracked === true
  );

const variantDepthReady =
  variantDepthRows.filter(
    row =>
      row.variantDepth
        ?.status === "ready"
  );

const summary = {
  market:
    targets.market,
  category:
    targets.category,
  targetFamilies:
    rows.length,
  existingSmartphoneFamilies:
    productsByFamily.size,
  readyFamilies:
    count("ready"),
  thinFamilies:
    count("thin"),
  catalogedWithoutPrice:
    count("cataloged_no_price"),
  missingFamilies:
    count("missing"),
  p0: {
    target:
      p0.length,
    ready:
      p0Ready,
  },
  variantDepth: {
    targetFamilies:
      variantDepthRows.length,
    readyFamilies:
      variantDepthReady.length,
    incompleteFamilies:
      variantDepthRows
        .filter(
          row =>
            row.variantDepth
              ?.status !== "ready"
        )
        .map(
          row => ({
            familyId:
              row.familyId,
            familyName:
              row.familyName,
            status:
              row.variantDepth
                ?.status,
            missingCatalogConfigurations:
              row.variantDepth
                ?.missingCatalogConfigurationLabels ||
              [],
            missingPricedConfigurations:
              row.variantDepth
                ?.missingPricedConfigurationLabels ||
              [],
            missingCatalogStorageValues:
              row.variantDepth
                ?.missingCatalogStorageValues ||
              [],
            missingPricedStorageValues:
              row.variantDepth
                ?.missingPricedStorageValues ||
              [],
          })
        ),
  },
  betaDepth: {
    targetFamilies:
      betaDepthRows.length,
    readyFamilies:
      betaDepthReady.length,
    core: {
      target:
        coreRows.length,
      ready:
        coreRows.filter(
          row =>
            row.status === "ready"
        ).length,
    },
    important: {
      target:
        importantRows.length,
      ready:
        importantRows.filter(
          row =>
            row.status === "ready"
        ).length,
    },
  },
  coveragePercent:
    Number(
      (
        (
          count("ready") /
          rows.length
        ) * 100
      ).toFixed(1)
    ),
};

console.log(
  JSON.stringify(
    {
      summary,
      families: rows,
    },
    null,
    2
  )
);
