const {
  evaluateOfferFreshness,
  resolveMaxAgeHours,
} = require("./freshness");


function isFiniteNumber(
  value
) {
  return (
    typeof value === "number" &&
    Number.isFinite(
      value
    )
  );
}


function getReliabilityPriority(
  offer,
  {
    now = Date.now(),
    maxAgeHours =
      resolveMaxAgeHours(
        process.env
          .DANISUA_OFFER_MAX_AGE_HOURS
      ),
  } = {}
) {
  const freshness =
    evaluateOfferFreshness(
      offer,
      {
        now,
        maxAgeHours,
        allowUnknown: false,
      }
    );

  const reasons = [];
  let score = 0;

  if (
    freshness.status === "invalid" ||
    freshness.status === "future"
  ) {
    score += 300;
    reasons.push(
      `freshness_${freshness.status}`
    );
  } else if (
    freshness.status === "unknown"
  ) {
    score += 250;
    reasons.push(
      "freshness_unknown"
    );
  } else if (
    freshness.status === "stale"
  ) {
    score += 200;
    reasons.push(
      "freshness_stale"
    );
  }

  if (
    isFiniteNumber(
      freshness.ageHours
    )
  ) {
    score += Math.min(
      30,
      freshness.ageHours / 24
    );
  }

  const shippingKnown =
    isFiniteNumber(
      offer?.shipping_price
    ) &&
    offer.shipping_price >= 0;

  if (!shippingKnown) {
    score += 40;
    reasons.push(
      "shipping_unknown"
    );
  }

  if (
    offer?.stock === null ||
    offer?.stock === undefined
  ) {
    score += 20;
    reasons.push(
      "stock_unknown"
    );
  }

  if (
    offer?.pricing
      ?.conditional === true
  ) {
    score += 10;
    reasons.push(
      "conditional_price"
    );
  }

  return {
    score:
      Number(
        score.toFixed(2)
      ),
    reasons,
    freshness,
    shippingKnown,
  };
}


function buildReliabilityQueue(
  offers,
  {
    now = Date.now(),
    maxAgeHours =
      resolveMaxAgeHours(
        process.env
          .DANISUA_OFFER_MAX_AGE_HOURS
      ),
    limit = null,
  } = {}
) {
  const rows =
    (
      Array.isArray(
        offers
      )
        ? offers
        : []
    )
      .map(
        offer => {
          const priority =
            getReliabilityPriority(
              offer,
              {
                now,
                maxAgeHours,
              }
            );

          return {
            id:
              offer?.id ||
              null,

            productId:
              offer?.productId ||
              null,

            familyId:
              offer?.familyId ||
              null,

            title:
              offer?.title ||
              null,

            store:
              offer?.store ||
              null,

            seller:
              offer?.seller ||
              null,

            url:
              offer?.url ||
              null,

            offer_price:
              offer?.offer_price ??
              null,

            shipping_price:
              offer?.shipping_price ??
              null,

            stock:
              offer?.stock ??
              null,

            verifiedAt:
              offer?.verifiedAt ??
              null,

            updatedAt:
              offer?.updatedAt ??
              null,

            priorityScore:
              priority.score,

            reasons:
              priority.reasons,

            freshness:
              priority.freshness,

            shippingKnown:
              priority.shippingKnown,
          };
        }
      )
      .filter(
        row =>
          row.reasons.length > 0
      )
      .sort(
        (
          a,
          b
        ) => {
          if (
            b.priorityScore !==
            a.priorityScore
          ) {
            return (
              b.priorityScore -
              a.priorityScore
            );
          }

          const ageA =
            a.freshness
              ?.ageHours ??
            -1;

          const ageB =
            b.freshness
              ?.ageHours ??
            -1;

          if (ageB !== ageA) {
            return ageB - ageA;
          }

          return String(
            a.id || ""
          ).localeCompare(
            String(
              b.id || ""
            )
          );
        }
      );

  const selected =
    Number.isInteger(
      limit
    ) &&
    limit > 0
      ? rows.slice(
          0,
          limit
        )
      : rows;

  const byReason = {};

  for (const row of rows) {
    for (
      const reason of
      row.reasons
    ) {
      byReason[reason] =
        (
          byReason[reason] ||
          0
        ) +
        1;
    }
  }

  return {
    summary: {
      totalOffers:
        Array.isArray(
          offers
        )
          ? offers.length
          : 0,

      queued:
        rows.length,

      returned:
        selected.length,

      byReason,
    },

    queue:
      selected,
  };
}


module.exports = {
  getReliabilityPriority,
  buildReliabilityQueue,
};
