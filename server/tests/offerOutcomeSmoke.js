const {
  finalizeOfferOutcome,
} = require("../utils/offerOutcome");


function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(
      message
    );
  }
}


function main() {
  const staleOnly =
    finalizeOfferOutcome({
      status:
        "best_offer_ready",
      canRecommend:
        true,
      message:
        "ready",
      bestOffer:
        null,
      resultCount:
        4,
    });

  assert(
    staleOnly.status ===
      "offers_need_refresh" &&
    staleOnly.canRecommend ===
      false &&
    staleOnly.needsRefresh ===
      true,
    "Senza offerta affidabile lo stato deve richiedere refresh"
  );

  const ready =
    finalizeOfferOutcome({
      status:
        "best_offer_ready",
      canRecommend:
        true,
      message:
        "ready",
      bestOffer: {
        id:
          "fresh-offer",
      },
      resultCount:
        4,
    });

  assert(
    ready.status ===
      "best_offer_ready" &&
    ready.canRecommend ===
      true &&
    ready.needsRefresh ===
      false,
    "Una bestOffer valida non deve essere degradata"
  );

  const clarification =
    finalizeOfferOutcome({
      status:
        "needs_clarification",
      canRecommend:
        false,
      message:
        "serve un dettaglio",
      bestOffer:
        null,
      resultCount:
        5,
    });

  assert(
    clarification.status ===
      "needs_clarification" &&
    clarification.message ===
      "serve un dettaglio",
    "Uno stato già non raccomandabile deve restare invariato"
  );

  console.log(
    "✅ OFFER OUTCOME — refresh state"
  );
}


try {
  main();
} catch (error) {
  console.error(
    "❌ OFFER OUTCOME",
    error.message
  );

  process.exitCode = 1;
}
