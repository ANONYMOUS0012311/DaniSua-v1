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

      const stores =
        [
          ...new Set(
            familyOffers
              .map(
                offer =>
                  offer.store
              )
              .filter(Boolean)
          ),
        ].sort();

      const verifiedOffers =
        familyOffers.filter(
          offer =>
            Boolean(
              offer.verifiedAt
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
        minimumStores:
          target.minimumStores,
        variants:
          familyProducts.length,
        offers:
          familyOffers.length,
        verifiedOffers:
          verifiedOffers.length,
        stores,
        storeCount:
          stores.length,
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
