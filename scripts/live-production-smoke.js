const WEB_URL =
  process.env.DANISUA_WEB_URL ||
  "https://danisua.netlify.app";

const API_URL =
  process.env.DANISUA_API_URL ||
  "https://danisuai.onrender.com";


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


function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


async function fetchWithRetry(
  url,
  options = {},
  {
    attempts = 8,
    delayMs = 8000,
    timeoutMs = 12000,
  } = {}
) {
  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt += 1
  ) {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        timeoutMs
      );

    try {
      const response =
        await fetch(
          url,
          {
            ...options,
            signal:
              controller.signal,
            headers: {
              "User-Agent":
                "DaniSua-Live-Smoke/1.0",
              ...(options.headers ||
                {}),
            },
          }
        );

      clearTimeout(
        timer
      );

      if (
        response.status >= 500 &&
        attempt < attempts
      ) {
        await sleep(
          delayMs
        );

        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(
        timer
      );

      lastError =
        error;

      if (
        attempt <
        attempts
      ) {
        await sleep(
          delayMs
        );
      }
    }
  }

  throw (
    lastError ||
    new Error(
      `Request fallita: ${url}`
    )
  );
}


async function fetchJson(
  path
) {
  const response =
    await fetchWithRetry(
      API_URL + path
    );

  assert(
    response.ok,
    `${path} HTTP ${response.status}`
  );

  return response.json();
}


function hasObjective(
  data,
  criterion
) {
  return Array.isArray(
    data
      ?.context
      ?.objectives
  ) &&
    data.context.objectives
      .some(
        objective =>
          objective
            ?.criterion ===
          criterion
      );
}


async function main() {
  const frontendResponse =
    await fetchWithRetry(
      WEB_URL
    );

  assert(
    frontendResponse.ok,
    `Frontend HTTP ${frontendResponse.status}`
  );

  const frontendHtml =
    await frontendResponse
      .text();

  assert(
    /DaniSua/i.test(
      frontendHtml
    ),
    "Il frontend pubblicato non contiene il brand DaniSua"
  );

  const appResponse =
    await fetchWithRetry(
      `${WEB_URL}/app.js`
    );

  assert(
    appResponse.ok,
    `Frontend app.js HTTP ${appResponse.status}`
  );

  const appSource =
    await appResponse
      .text();

  assert(
    appSource.includes(
      "https://danisuai.onrender.com"
    ),
    "Il frontend pubblicato non punta al backend Render atteso"
  );

  const health =
    await fetchJson(
      "/health"
    );

  assert(
    health.ok === true,
    "Backend /health non è ok"
  );

  assert(
    typeof health
      .runtime
      ?.node ===
      "string",
    "Health runtime incompleto"
  );

  assert(
    health.beta &&
    typeof health
      .beta
      .readyForClosedBeta ===
      "boolean",
    "Health non espone beta readiness"
  );

  const cheapest =
    await fetchJson(
      "/search?q=" +
      encodeURIComponent(
        "iPhone 17 più economico"
      )
    );

  assert(
    typeof cheapest
      .requestId ===
      "string" &&
    cheapest
      .requestId
      .length > 0,
    "/search non espone requestId"
  );

  assert(
    cheapest
      .clarification
      ?.needed !==
      true,
    "iPhone 17 più economico non deve chiedere capacità"
  );

  assert(
    ![
      "unsupported_intent",
      "not_found",
    ].includes(
      cheapest.status
    ),
    `Stato price-first inatteso: ${cheapest.status}`
  );

  if (
    cheapest.canRecommend ===
      true
  ) {
    assert(
      cheapest.bestOffer
        ?.familyId ===
        "apple-iphone-17",
      "Price-first ha scelto una famiglia errata"
    );
  } else {
    assert(
      cheapest.status ===
        "offers_need_refresh",
      `Se non raccomandabile, atteso offers_need_refresh: ${cheapest.status}`
    );
  }

  const exact =
    await fetchJson(
      "/search?q=" +
      encodeURIComponent(
        "iPhone 17 256 GB"
      )
    );

  assert(
    exact
      .clarification
      ?.needed !==
      true,
    "iPhone 17 256 GB non deve chiedere un dettaglio già fornito"
  );

  if (
    exact.canRecommend ===
      true
  ) {
    assert(
      exact.bestOffer
        ?.storage ===
        "256 GB",
      `La ricerca esatta non ha rispettato 256 GB: ${exact.bestOffer?.storage}`
    );

    assert(
      Array.isArray(
        exact.results
      ) &&
      exact.results
        .every(
          offer =>
            offer.storage ===
            "256 GB"
        ),
      "La ricerca esatta include capacità diverse da 256 GB"
    );
  }

  const typo =
    await fetchJson(
      "/search?q=" +
      encodeURIComponent(
        "samsng con buona baterria sotto 500 euro"
      )
    );

  assert(
    ![
      "unsupported_intent",
      "not_found",
    ].includes(
      typo.status
    ),
    `Il typo non è stato recuperato: ${typo.status}`
  );

  assert(
    String(
      typo.productQuery ||
      ""
    )
      .includes(
        "samsung"
      ),
    `Il typo Samsung non è stato normalizzato: ${typo.productQuery}`
  );

  assert(
    hasObjective(
      typo,
      "battery"
    ),
    "Il typo batteria non ha mantenuto l'obiettivo battery"
  );

  console.log(
    JSON.stringify(
      {
        passed: true,
        frontend:
          "ok",
        backend:
          "ok",
        readyForClosedBeta:
          health.beta
            .readyForClosedBeta,
        priceFirstStatus:
          cheapest.status,
        exactStatus:
          exact.status,
        typoStatus:
          typo.status,
      },
      null,
      2
    )
  );
}


main()
  .catch(
    error => {
      console.error(
        "LIVE_PRODUCTION_SMOKE_FAILED",
        error
          ?.stack ||
        error
      );

      process.exitCode =
        1;
    }
  );
