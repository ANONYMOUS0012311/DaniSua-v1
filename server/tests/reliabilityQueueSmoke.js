const {
  buildReliabilityQueue,
} = require("../utils/reliabilityQueue");

const {
  evaluateOfferReliability,
} = require("../utils/freshness");


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
  const now =
    Date.parse(
      "2026-11-23T20:00:00Z"
    );

  const offers = [
    {
      id: "fresh-complete",
      offer_price: 100,
      shipping_price: 0,
      stock: true,
      verifiedAt:
        "2026-11-23T19:30:00Z",
    },
    {
      id: "stale-shipping-unknown",
      offer_price: 90,
      shipping_price: null,
      stock: true,
      verifiedAt:
        "2026-11-20T10:00:00Z",
    },
    {
      id: "unknown-date",
      offer_price: 80,
      shipping_price: 0,
      stock: true,
      verifiedAt: null,
    },
    {
      id: "invalid-date",
      offer_price: 70,
      shipping_price: 0,
      stock: true,
      verifiedAt:
        "not-a-date",
    },
  ];

  const result =
    buildReliabilityQueue(
      offers,
      {
        now,
        freshHours: 2,
        reviewHours: 6,
      }
    );

  assert(
    result.summary
      .totalOffers === 4,
    "Conteggio offerte inatteso"
  );

  assert(
    result.summary
      .queued === 3,
    "Solo le offerte con problemi devono entrare in coda"
  );

  assert(
    result.queue[0]
      .id ===
      "invalid-date",
    "Timestamp invalido deve avere priorità massima"
  );

  assert(
    result.queue.some(
      item =>
        item.id ===
          "stale-shipping-unknown" &&
        item.reasons.includes(
          "freshness_stale"
        ) &&
        item.reasons.includes(
          "shipping_unknown"
        )
    ),
    "Stale + shipping sconosciuta deve essere esplicito"
  );

  assert(
    !result.queue.some(
      item =>
        item.id ===
          "fresh-complete"
    ),
    "Offerta fresh e completa non deve entrare in coda"
  );


  const review =
    evaluateOfferReliability(
      {
        verifiedAt:
          "2026-11-23T16:00:00Z",
      },
      {
        now,
        freshHours: 2,
        reviewHours: 6,
      }
    );


  assert(
    review.status ===
      "review" &&
    review.requiresRefresh ===
      true,
    "Tra 2 e 6 ore l'offerta deve entrare in review"
  );


  const dateOnly =
    evaluateOfferReliability(
      {
        verifiedAt:
          "2026-11-23",
      },
      {
        now,
        freshHours: 2,
        reviewHours: 6,
      }
    );


  assert(
    dateOnly
      .timestampPrecision ===
      "date" &&
    dateOnly
      .eligibleForHourlyPolicy ===
      false,
    "Una data senza ora non è sufficiente per una policy oraria"
  );


  console.log(
    "✅ RELIABILITY QUEUE — priorità refresh"
  );
}


try {
  main();
} catch (error) {
  console.error(
    "❌ RELIABILITY QUEUE",
    error.message
  );

  process.exitCode = 1;
}
