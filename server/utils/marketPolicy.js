const DEFAULT_MARKET_CURRENCY =
  "EUR";


function normalizeCurrency(
  value
) {
  const text =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();

  return (
    /^[A-Z]{3}$/
      .test(
        text
      )
  )
    ? text
    : null;
}


function resolveMarketCurrency(
  value =
    process.env
      .DANISUA_MARKET_CURRENCY
) {
  return (
    normalizeCurrency(
      value
    ) ||
    DEFAULT_MARKET_CURRENCY
  );
}


function evaluateOfferMarket(
  offer,
  {
    currency =
      resolveMarketCurrency(),
  } = {}
) {
  const marketCurrency =
    resolveMarketCurrency(
      currency
    );

  const offerCurrency =
    normalizeCurrency(
      offer
        ?.currency
    );

  if (!offerCurrency) {
    return {
      eligible: false,
      reason:
        "invalid_currency",
      currency:
        offerCurrency,
      marketCurrency,
    };
  }

  if (
    offerCurrency !==
    marketCurrency
  ) {
    return {
      eligible: false,
      reason:
        "market_currency_mismatch",
      currency:
        offerCurrency,
      marketCurrency,
    };
  }

  return {
    eligible: true,
    reason:
      "market_currency_match",
    currency:
      offerCurrency,
    marketCurrency,
  };
}


function filterOffersByMarketCurrency(
  offers,
  options = {}
) {
  const accepted = [];
  const rejected = [];

  for (
    const offer of
    Array.isArray(
      offers
    )
      ? offers
      : []
  ) {
    const market =
      evaluateOfferMarket(
        offer,
        options
      );

    if (
      market.eligible
    ) {
      accepted.push(
        offer
      );
    } else {
      rejected.push({
        offer,
        market,
      });
    }
  }

  return {
    accepted,
    rejected,
    marketCurrency:
      resolveMarketCurrency(
        options.currency
      ),
  };
}


module.exports = {
  DEFAULT_MARKET_CURRENCY,
  normalizeCurrency,
  resolveMarketCurrency,
  evaluateOfferMarket,
  filterOffersByMarketCurrency,
};
