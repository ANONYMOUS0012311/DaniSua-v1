// DANISUA — OFFER FRESHNESS

const DEFAULT_MAX_AGE_HOURS = 72;
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
  resolveMaxAgeHours,
  getOfferFreshnessTimestamp,
  evaluateOfferFreshness,
  summarizeOfferFreshness,
};
