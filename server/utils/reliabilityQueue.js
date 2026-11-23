const {
  evaluateOfferReliability,
  DEFAULT_FRESH_HOURS,
  DEFAULT_REVIEW_HOURS,
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
    freshHours =
      DEFAULT_FRESH_HOURS,
    reviewHours =
      DEFAULT_REVIEW_HOURS,
  } = {}
) {
  const reliability =
    evaluateOfferReliability(
      offer,
      {
        now,
        freshHours,
        reviewHours,
      }
    );

  const reasons = [];
  let score = 0;

  if (
    reliability.status === "invalid" ||
    reliability.status === "future"
  ) {
    score += 300;
    reasons.push(
      `freshness_${reliability.status}`
    );
  } else if (
    reliability.status === "unknown"
  ) {
    score += 250;
    reasons.push(
      "freshness_unknown"
    );
  } else if (
    reliability.status === "stale"
  ) {
    score += 200;
    reasons.push(
      "freshness_stale"
    );
  } else if (
    reliability.status === "review"
  ) {
    score += 100;
    reasons.push(
      "freshness_review"
    );
  }

  if (
    reliability.timestamp &&
    reliability
      .timestampPrecision !==
      "datetime"
  ) {
    score += 60;
    reasons.push(
      "timestamp_imprecise"
    );
  }

  if (
    isFiniteNumber(
      reliability.ageHours
    )
  ) {
    score += Math.min(
      30,
      reliability.ageHours / 24
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
    reliability,
    shippingKnown,
  };
}


function buildReliabilityQueue(
  offers,
  {
    now = Date.now(),
    freshHours =
      DEFAULT_FRESH_HOURS,
    reviewHours =
      DEFAULT_REVIEW_HOURS,
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
                freshHours,
                reviewHours,
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

            reliability:
              priority.reliability,

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
            a.reliability
              ?.ageHours ??
            -1;

          const ageB =
            b.reliability
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
