// DANISUA — OFFER FRESHNESS

const DEFAULT_MAX_AGE_HOURS = 72;
const DEFAULT_FRESH_HOURS = 2;
const DEFAULT_REVIEW_HOURS = 6;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function resolveMaxAgeHours(value) {
  const parsed = Number(value);

  return (
    Number.isFinite(parsed) &&
    parsed > 0
  )
    ? parsed
    : DEFAULT_MAX_AGE_HOURS;
}

function getOfferFreshnessTimestamp(offer) {
  if (!offer || typeof offer !== "object") {
    return null;
  }

  return (
    offer.verifiedAt ||
    offer.updatedAt ||
    null
  );
}

function getTimestampPrecision(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "unknown";
  }

  if (
    typeof value !== "string"
  ) {
    return "invalid";
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/
      .test(
        value
      )
  ) {
    return "date";
  }

  if (
    Number.isFinite(
      Date.parse(
        value
      )
    ) &&
    /T\d{2}:\d{2}/
      .test(
        value
      )
  ) {
    return "datetime";
  }

  return Number.isFinite(
    Date.parse(
      value
    )
  )
    ? "other"
    : "invalid";
}


function evaluateOfferReliability(
  offer,
  {
    now = Date.now(),
    freshHours =
      DEFAULT_FRESH_HOURS,
    reviewHours =
      DEFAULT_REVIEW_HOURS,
    allowUnknownForRecommendation =
      false,
  } = {}
) {
  const safeFreshHours =
    Number.isFinite(
      Number(
        freshHours
      )
    ) &&
    Number(
      freshHours
    ) > 0
      ? Number(
          freshHours
        )
      : DEFAULT_FRESH_HOURS;

  const safeReviewHours =
    Number.isFinite(
      Number(
        reviewHours
      )
    ) &&
    Number(
      reviewHours
    ) >=
      safeFreshHours
      ? Number(
          reviewHours
        )
      : Math.max(
          DEFAULT_REVIEW_HOURS,
          safeFreshHours
        );

  const timestamp =
    getOfferFreshnessTimestamp(
      offer
    );

  const precision =
    getTimestampPrecision(
      timestamp
    );

  const checkedAt =
    new Date(
      now
    )
      .toISOString();

  if (!timestamp) {
    return {
      status:
        "unknown",
      timestamp: null,
      timestampPrecision:
        precision,
      checkedAt,
      ageHours: null,
      freshHours:
        safeFreshHours,
      reviewHours:
        safeReviewHours,
      requiresRefresh:
        true,
      eligibleForHourlyPolicy:
        Boolean(
          allowUnknownForRecommendation
        ),
    };
  }

  const time =
    Date.parse(
      timestamp
    );

  if (
    !Number.isFinite(
      time
    )
  ) {
    return {
      status:
        "invalid",
      timestamp,
      timestampPrecision:
        precision,
      checkedAt,
      ageHours: null,
      freshHours:
        safeFreshHours,
      reviewHours:
        safeReviewHours,
      requiresRefresh:
        true,
      eligibleForHourlyPolicy:
        false,
    };
  }

  if (
    time >
    now +
      FUTURE_TOLERANCE_MS
  ) {
    return {
      status:
        "future",
      timestamp,
      timestampPrecision:
        precision,
      checkedAt,
      ageHours: null,
      freshHours:
        safeFreshHours,
      reviewHours:
        safeReviewHours,
      requiresRefresh:
        true,
      eligibleForHourlyPolicy:
        false,
    };
  }

  const ageHours =
    Math.max(
      0,
      (
        now -
        time
      ) /
      (
        60 *
        60 *
        1000
      )
    );

  let status =
    "stale";

  if (
    ageHours <=
    safeFreshHours
  ) {
    status =
      "fresh";
  } else if (
    ageHours <=
    safeReviewHours
  ) {
    status =
      "review";
  }

  const precise =
    precision ===
      "datetime";

  return {
    status,
    timestamp,
    timestampPrecision:
      precision,
    checkedAt,
    ageHours:
      Number(
        ageHours
          .toFixed(
            2
          )
      ),
    freshHours:
      safeFreshHours,
    reviewHours:
      safeReviewHours,
    requiresRefresh:
      status !==
        "fresh" ||
      !precise,
    eligibleForHourlyPolicy:
      status ===
        "fresh" &&
      precise,
  };
}


function evaluateOfferFreshness(
  offer,
  {
    now = Date.now(),
    maxAgeHours = resolveMaxAgeHours(
      process.env.DANISUA_OFFER_MAX_AGE_HOURS
    ),
    allowUnknown =
      process.env.NODE_ENV !== "production",
  } = {}
) {
  const threshold =
    resolveMaxAgeHours(
      maxAgeHours
    );

  const timestamp =
    getOfferFreshnessTimestamp(
      offer
    );

  const checkedAt =
    new Date(now).toISOString();

  if (!timestamp) {
    return {
      status: "unknown",
      timestamp: null,
      checkedAt,
      ageHours: null,
      maxAgeHours: threshold,
      eligibleForRecommendation:
        Boolean(allowUnknown),
    };
  }

  const time =
    Date.parse(timestamp);

  if (!Number.isFinite(time)) {
    return {
      status: "invalid",
      timestamp,
      checkedAt,
      ageHours: null,
      maxAgeHours: threshold,
      eligibleForRecommendation: false,
    };
  }

  if (
    time >
    now + FUTURE_TOLERANCE_MS
  ) {
    return {
      status: "future",
      timestamp,
      checkedAt,
      ageHours: null,
      maxAgeHours: threshold,
      eligibleForRecommendation: false,
    };
  }

  const ageHours =
    Math.max(
      0,
      (now - time) /
        (60 * 60 * 1000)
    );

  const fresh =
    ageHours <= threshold;

  return {
    status:
      fresh
        ? "fresh"
        : "stale",
    timestamp,
    checkedAt,
    ageHours:
      Number(
        ageHours.toFixed(2)
      ),
    maxAgeHours: threshold,
    eligibleForRecommendation:
      fresh,
  };
}

function summarizeOfferFreshness(
  offers,
  options = {}
) {
  const summary = {
    total: 0,
    fresh: 0,
    stale: 0,
    unknown: 0,
    invalid: 0,
    future: 0,
    blocking: [],
  };

  for (
    const offer of
    Array.isArray(offers)
      ? offers
      : []
  ) {
    const freshness =
      evaluateOfferFreshness(
        offer,
        options
      );

    summary.total += 1;

    if (
      Object.prototype.hasOwnProperty.call(
        summary,
        freshness.status
      )
    ) {
      summary[
        freshness.status
      ] += 1;
    }

    if (
      freshness
        .eligibleForRecommendation ===
      false
    ) {
      summary.blocking.push({
        id:
          offer?.id ||
          null,
        status:
          freshness.status,
        timestamp:
          freshness.timestamp,
        ageHours:
          freshness.ageHours,
      });
    }
  }

  return summary;
}

module.exports = {
  DEFAULT_MAX_AGE_HOURS,
  DEFAULT_FRESH_HOURS,
  DEFAULT_REVIEW_HOURS,
  resolveMaxAgeHours,
  getOfferFreshnessTimestamp,
  getTimestampPrecision,
  evaluateOfferReliability,
  evaluateOfferFreshness,
  summarizeOfferFreshness,
};
