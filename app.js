// app.js — DaniSua IT
console.log("DaniSua app.js loaded");

const API_BASE = "https://danisuai.onrender.com";

const inputRicerca =
  document.getElementById("buscador-input");

const btnRicerca =
  document.getElementById("buscador-btn");

const containerProdotti =
  document.getElementById("productos-container");

const contatoreRisultati =
  document.getElementById("resultados-contador");

const aiHint =
  document.getElementById("ai-hint");

const searchExamples =
  document.querySelectorAll(
    ".search-example"
  );

const BTN_TEXT_DEFAULT =
  btnRicerca
    ? btnRicerca.textContent
    : "Cerca";

let debounceTimer = null;
let requestId = 0;

let pendingClarification = null;

const SEARCH_PLACEHOLDER_DEFAULT =
  inputRicerca
    ? inputRicerca.getAttribute("placeholder") || ""
    : "";


// ========================================
// SICUREZZA HTML
// ========================================

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ========================================
// FORMATO PREZZO ITALIANO
// ========================================

function formatPrice(
  value,
  currency = "EUR"
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "Prezzo non disponibile";
  }

  try {
    return new Intl.NumberFormat(
      "it-IT",
      {
        style: "currency",
        currency: currency || "EUR",
      }
    ).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || "EUR"}`;
  }
}


// ========================================
// LOADING
// ========================================

function setLoading(state) {
  if (!btnRicerca) return;

  btnRicerca.disabled = state;

  btnRicerca.textContent =
    state
      ? "Ricerca…"
      : BTN_TEXT_DEFAULT;
}


function showInlineLoading(rawQuery) {
  if (!containerProdotti) return;

  const q =
    rawQuery
      ? `: <strong>${escapeHtml(rawQuery)}</strong>`
      : "";

  containerProdotti.innerHTML =
    `<p class="loading">Ricerca${q}…</p>`;
}


// ========================================
// BACKEND
// ========================================

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


async function fetchSearch(
  query,
  {
    attempts = 3,
    timeoutMs = 10000,
    retryDelayMs = 700,
  } = {}
) {
  const url =
    `${API_BASE}/search?q=${encodeURIComponent(query || "")}`;

  console.log(
    "Ricerca DaniSua:",
    url
  );

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
      const res =
        await fetch(
          url,
          {
            signal:
              controller.signal,
            cache:
              "no-store",
          }
        );

      clearTimeout(
        timer
      );

      if (
        !res.ok
      ) {
        const error =
          new Error(
            `Errore backend /search (${res.status})`
          );

        error.status =
          res.status;

        throw error;
      }

      return await res.json();

    } catch (error) {
      clearTimeout(
        timer
      );

      lastError =
        error;

      const retryable =
        error?.name ===
          "AbortError" ||
        typeof error?.status !==
          "number" ||
        error.status >=
          500;

      if (
        !retryable ||
        attempt >= attempts
      ) {
        break;
      }

      await sleep(
        retryDelayMs * attempt
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "Ricerca non disponibile"
    )
  );
}


function sendClientEvent(
  payload
) {
  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return;
  }

  fetch(
    `${API_BASE}/events`,
    {
      method:
        "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body:
        JSON.stringify(
          payload
        ),
      keepalive:
        true,
    }
  )
    .catch(
      () => {
        // Le metriche non devono mai
        // interrompere l'esperienza.
      }
    );
}


// ========================================
// SCONTO
// ========================================

function getDiscountPercent(product) {
  if (
    typeof product.old_price === "number" &&
    typeof product.offer_price === "number" &&
    product.old_price > product.offer_price
  ) {
    const discount =
      100 -
      (
        product.offer_price *
        100
      ) /
        product.old_price;

    return Math.round(discount);
  }

  return 0;
}


// ========================================
// INTERPRETAZIONE LOCALE
// ========================================

function updateAiHint(raw) {
  if (!aiHint) return;

  const clean =
    (raw || "").trim();

  if (!clean) {
    aiHint.textContent = "";
    return;
  }

  aiHint.textContent =
    "Cercherò prodotti e offerte compatibili con quello che hai scritto.";
}

// ========================================
// NASCONDERE BOX DANISUA
// ========================================

function setAssistantBoxTitle(
  title
) {
  const label =
    document.querySelector(
      ".ai-best-title"
    );

  if (label) {
    label.textContent =
      title || "DaniSua";
  }
}


function hideBestOffer() {
  const box =
    document.getElementById(
      "ai-best-offer"
    );

  if (box) {
    box.style.display = "none";
  }
}


// ========================================
// CHIARIMENTO DANISUA
// ========================================

function getClarificationPrompt(
  clarification
) {
  const missing =
    clarification?.missing || [];

  const options =
    clarification?.options || {};

  if (missing.includes("storage")) {
    const storages =
      Array.isArray(options.storages)
        ? options.storages
        : [];

    const example =
      storages.length > 0
        ? storages.slice(0, 2).join(" o ")
        : "128 GB o 256 GB";

    return {
      message:
        `Per consigliarti bene mi serve solo una cosa: quale capacità preferisci? Puoi scrivere, per esempio, "${example}".`,
      placeholder:
        storages[0]
          ? `Scrivi qui, es. ${storages[0]}`
          : "Scrivi qui, es. 256 GB",
    };
  }

  if (missing.includes("model")) {
    return {
      message:
        'Se hai già un modello in mente, scrivilo. Altrimenti dimmi semplicemente cosa ti serve, per esempio: "smartphone per foto sotto 800 euro".',
      placeholder:
        "Scrivi il modello oppure budget e utilizzo",
    };
  }

  if (missing.includes("category")) {
    return {
      message:
        'Che tipo di prodotto stai cercando? Puoi scrivere, per esempio, "smartphone", "cuffie", "laptop" o "console". Se vuoi, aggiungi anche il budget e per cosa ti serve.',
      placeholder:
        "Es. laptop sotto 1000 euro per università",
    };
  }

  if (missing.includes("configuration")) {
    return {
      message:
        "Ho trovato più versioni. Dimmi qualcosa in più sulla configurazione che vuoi, per esempio capacità o variante.",
      placeholder:
        "Descrivi la configurazione che preferisci",
    };
  }

  if (missing.includes("comparison")) {
    return {
      message:
        clarification?.message ||
        "Ho capito che vuoi confrontare due modelli. Dimmi quale criterio conta di più oppure cerca un modello alla volta.",
      placeholder:
        "Es. fotocamera, batteria o prezzo",
    };
  }

  if (missing.includes("value_dimension")) {
    return {
      message:
        clarification?.message ||
        "Cosa significa “buono” per te? Fotocamera, batteria o prestazioni?",
      placeholder:
        "Es. buona batteria",
    };
  }

  return {
    message:
      clarification?.message ||
      "Dimmi qualcosa in più: modello, capacità, budget oppure per cosa ti serve.",
    placeholder:
      "Aggiungi un dettaglio per DaniSua",
  };
}


function clearPendingClarification() {
  pendingClarification = null;

  if (inputRicerca) {
    inputRicerca.placeholder =
      SEARCH_PLACEHOLDER_DEFAULT;
  }
}


function renderSearchNotice(
  message
) {
  const box =
    document.getElementById(
      "ai-best-offer"
    );

  const content =
    document.getElementById(
      "ai-best-content"
    );

  if (
    !box ||
    !content ||
    !message
  ) {
    return;
  }

  setAssistantBoxTitle(
    "Cosa ho trovato"
  );

  box.style.display = "block";

  content.innerHTML = `
    <div class="danisua-clarification">
      <p>
        ${escapeHtml(message)}
      </p>
    </div>
  `;
}


function renderClarification(
  clarification,
  originalQuery
) {
  const box =
    document.getElementById(
      "ai-best-offer"
    );

  const content =
    document.getElementById(
      "ai-best-content"
    );

  if (!box || !content) {
    return;
  }

  pendingClarification = {
    originalQuery:
      (originalQuery || "").trim(),
    clarification,
  };

  const prompt =
    getClarificationPrompt(
      clarification
    );

  box.style.display = "block";

  content.innerHTML = `
    <div class="danisua-clarification">

      <strong>
        Mi manca solo un dettaglio
      </strong>

      <p>
        ${escapeHtml(prompt.message)}
      </p>

      <p class="danisua-rule-note">
        Scrivilo nella barra qui sopra e premi Invio.
      </p>

    </div>
  `;

  if (inputRicerca) {
    const preservedQuery =
      (originalQuery ||
       inputRicerca.value ||
       "").trim();

    inputRicerca.value =
      preservedQuery
        ? preservedQuery + " "
        : "";

    inputRicerca.placeholder =
      prompt.placeholder;

    inputRicerca.focus();

    const end =
      inputRicerca.value.length;

    if (
      typeof inputRicerca.setSelectionRange ===
      "function"
    ) {
      inputRicerca.setSelectionRange(
        end,
        end
      );
    }
  }

  if (aiHint) {
    aiHint.textContent =
      "Aggiungi il dettaglio e continuo da lì.";
  }
}


function resolveConversationQuery(
  answer
) {
  const cleanAnswer =
    (answer || "").trim();

  if (!pendingClarification) {
    return cleanAnswer;
  }

  if (!cleanAnswer) {
    return "";
  }

  const originalQuery =
    pendingClarification
      .originalQuery || "";

  const missing =
    pendingClarification
      .clarification
      ?.missing || [];

  const normalizedOriginal =
    originalQuery
      .toLowerCase()
      .trim();

  const normalizedAnswer =
    cleanAnswer
      .toLowerCase()
      .trim();

  const alreadyContainsOriginal =
    normalizedOriginal &&
    normalizedAnswer.includes(
      normalizedOriginal
    );

  let nextQuery = "";

  if (missing.includes("model")) {
    nextQuery =
      cleanAnswer;
  } else {
    nextQuery =
      alreadyContainsOriginal
        ? cleanAnswer
        : `${originalQuery} ${cleanAnswer}`
            .trim();
  }

  clearPendingClarification();

  if (inputRicerca) {
    inputRicerca.value =
      nextQuery;
  }

  return nextQuery;
}


const CRITERION_LABELS_UI = {
  camera: "fotocamera",
  battery: "batteria",
  performance: "prestazioni",
  display: "display",
  software: "software",
  value: "rapporto qualità/prezzo",
  sound: "audio",
  anc: "cancellazione del rumore",
  comfort: "comfort",
  portability: "portabilità",
  overall: "qualità generale",
};


function getVariantLabel(product) {
  return [
    product?.ram,
    product?.storage,
    product?.condition &&
    product.condition !== "new"
      ? product.condition
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}


function getUserFacingReason(
  recommendation,
  context
) {
  const reason =
    recommendation?.reason;

  if (
    reason ===
    "needs_based_recommendation"
  ) {
    const useCase =
      recommendation
        ?.useCase
        ?.label ||
      context
        ?.recommendationNeed
        ?.useCase
        ?.label ||
      "quello che ti serve";

    const criteria =
      (
        recommendation
          ?.usedCriteria ||
        []
      )
        .map(
          item =>
            CRITERION_LABELS_UI[item] ||
            item
        )
        .filter(Boolean);

    const criteriaText =
      criteria.length > 0
        ? ` Ho considerato soprattutto ${criteria.join(", ")}.`
        : "";

    return (
      `Per ${useCase}, questa è l'opzione che risponde meglio a quello che hai chiesto.` +
      criteriaText +
      " Poi ho confrontato i negozi per trovare il prezzo più conveniente."
    );
  }

  if (
    reason === "best_product"
  ) {
    const criteria =
      (
        recommendation
          ?.criteria ||
        []
      )
        .map(
          item =>
            CRITERION_LABELS_UI[item] ||
            item
        )
        .filter(Boolean);

    return criteria.length > 0
      ? `Tra le opzioni che rispettano la tua richiesta, questa combina meglio ${criteria.join(", ")}. Poi ho cercato il prezzo più conveniente.`
      : "Tra le opzioni che rispettano la tua richiesta, questa è quella che sceglierei. Poi ho cercato il prezzo più conveniente.";
  }

  if (
    reason ===
    "generic_price_first"
  ) {
    return "Non hai specificato memoria o versione: ho controllato le varianti disponibili e ho messo davanti quella che oggi costa meno.";
  }

  if (
    reason ===
      "lowest_price_equivalent_offers" ||
    reason ===
      "lowest_price_requested"
  ) {
    return "Ho confrontato i negozi che hanno questa stessa versione e questa è l'offerta più conveniente adesso.";
  }

  return "Ho confrontato le opzioni che rispettano la tua richiesta e ho messo davanti quella che conviene di più.";
}


function getCoverageNote(recommendation) {
  const coverage =
    recommendation?.variantCoverage;

  if (!coverage) {
    return "";
  }

  if (
    coverage.comparisonComplete ===
      true
  ) {
    return "Ho potuto confrontare tutte le versioni che conosco per questo modello.";
  }

  if (
    coverage.marketComplete === true
  ) {
    const missing =
      coverage
        .missingConfigurationLabels ||
      [];

    return missing.length > 0
      ? `Conosco anche le altre versioni del modello, ma per ${missing.join(", ")} oggi non ho ancora un prezzo abbastanza affidabile da confrontare.`
      : "Ho controllato anche le altre versioni disponibili del modello.";
  }

  return "";
}


function getMissingCriteriaNote(
  recommendation
) {
  const missing =
    recommendation
      ?.missingCriteria ||
    [];

  if (missing.length === 0) {
    return "";
  }

  const labels =
    missing.map(
      item =>
        CRITERION_LABELS_UI[item] ||
        item
    );

  return `Per ${labels.join(", ")} mi mancano ancora dati abbastanza affidabili, quindi non li ho usati per decidere.`;
}


// ========================================
// MIGLIORE OFFERTA
// ========================================

function renderBestOffer(
  product,
  recommendation,
  context = null
) {
  const box =
    document.getElementById(
      "ai-best-offer"
    );

  const content =
    document.getElementById(
      "ai-best-content"
    );

  if (!box || !content) {
    return;
  }

  if (!product) {
    box.style.display = "none";
    return;
  }

  setAssistantBoxTitle(
    "Per te conviene"
  );

  box.style.display = "block";

  const title =
    escapeHtml(
      product.title ||
      "Prodotto"
    );

  const store =
    escapeHtml(
      product.store || ""
    );

  const variantLabel =
    getVariantLabel(product);

  const finalCostConfirmed =
    recommendation
      ?.finalCostConfirmed ===
      true;

  const displayAmount =
    finalCostConfirmed &&
    typeof recommendation
      ?.finalCost ===
      "number"
      ? recommendation.finalCost
      : product.offer_price;

  const price =
    formatPrice(
      displayAmount,
      product.currency || "EUR"
    );

  const priceLabel =
    finalCostConfirmed
      ? "Costo finale"
      : "Prezzo";

  const comparedOffers =
    recommendation?.comparedOffers ||
    1;

  const reasonText =
    getUserFacingReason(
      recommendation,
      context
    );

  const coverageNote =
    getCoverageNote(
      recommendation
    );

  const missingCriteriaNote =
    getMissingCriteriaNote(
      recommendation
    );

  const shippingText =
    typeof product
      .shipping_price ===
      "number"
      ? (
          product.shipping_price === 0
            ? "Spedizione inclusa"
            : `Spedizione ${formatPrice(
                product.shipping_price,
                product.currency ||
                "EUR"
              )}`
        )
      : "Spedizione da verificare";

  const verifiedText =
    formatVerified(
      product.verifiedAt,
      product.updatedAt,
      product.freshness,
      product.reliability
    );

  const confidenceLabel =
    recommendation
      ?.confidence === "high"
      ? "Dati completi"
      : (
          recommendation
            ?.confidence ===
            "medium"
            ? "Dati parziali"
            : ""
        );

  const savings =
    recommendation
      ?.savingsVsNextOffer;

  const savingsText =
    typeof savings === "number" &&
    savings > 0
      ? `Risparmi ${formatPrice(
          savings,
          product.currency || "EUR"
        )} rispetto alla seconda offerta comparabile.`
      : "";

  content.innerHTML = `
    <div class="danisua-recommendation">

      <div class="danisua-main-row">
        <div>
          <strong class="danisua-product-name">
            ${title}
          </strong>

          ${
            variantLabel
              ? `
                <div class="danisua-variant">
                  ${escapeHtml(variantLabel)}
                </div>
              `
              : ""
          }
        </div>

        <div class="danisua-price-block">
          <span class="danisua-price-label">
            ${escapeHtml(priceLabel)}
          </span>

          <strong class="danisua-price">
            ${price}
          </strong>

          <span class="danisua-store">
            ${store}
          </span>
        </div>
      </div>

      <div class="danisua-chips">
        <span class="danisua-chip">
          ${escapeHtml(shippingText)}
        </span>

        <span class="danisua-chip">
          ${escapeHtml(verifiedText)}
        </span>

        ${
          comparedOffers > 1
            ? `
              <span class="danisua-chip">
                ${comparedOffers} offerte confrontate
              </span>
            `
            : ""
        }

        ${
          confidenceLabel
            ? `
              <span class="danisua-chip">
                ${escapeHtml(confidenceLabel)}
              </span>
            `
            : ""
        }
      </div>

      <div class="danisua-why">
        <span class="danisua-section-label">
          Perché
        </span>

        <p>
          ${escapeHtml(reasonText)}
        </p>
      </div>

      ${
        savingsText
          ? `
            <p class="danisua-saving">
              ${escapeHtml(savingsText)}
            </p>
          `
          : ""
      }

      ${
        coverageNote ||
        missingCriteriaNote
          ? `
            <div class="danisua-transparency">
              <span class="danisua-section-label">
                Trasparenza
              </span>

              ${
                coverageNote
                  ? `<p>${escapeHtml(coverageNote)}</p>`
                  : ""
              }

              ${
                missingCriteriaNote
                  ? `<p>${escapeHtml(missingCriteriaNote)}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }

    </div>
  `;
}

// ========================================
// RICERCA PRINCIPALE
// ========================================

async function runSearchWithNormalize(
  rawQuery,
  {
    showLoadingIfSlow = true,
  } = {}
) {
  const current =
    ++requestId;

  const raw =
    (rawQuery || "").trim();

  const normalized =
    typeof window.normalizeQuery ===
    "function"
      ? window.normalizeQuery(raw)
          .normalized_query
      : raw;

  let loadingTimeout = null;

  setLoading(true);

  if (showLoadingIfSlow) {
    loadingTimeout =
      setTimeout(() => {
        if (
          current === requestId
        ) {
          showInlineLoading(raw);
        }
      }, 200);
  }

  try {
    const data =
      await fetchSearch(
        normalized
      );

    if (
      current !== requestId
    ) {
      return;
    }

    const results =
      Array.isArray(data.results)
        ? data.results
        : [];

    const displayResults =
      selectDisplayResults(
        results
      );

    // ------------------------------------
    // IL BACKEND CHIEDE UN CHIARIMENTO
    // ------------------------------------

    if (
      data.canRecommend === false &&
      data.clarification?.needed
    ) {
      renderClarification(
        data.clarification,
        raw
      );

      renderProducts(
        displayResults,
        null,
        data.requestId || null
      );

      updateCounter(
        displayResults.length
      );

      return;
    }

    clearPendingClarification();

    if (
      data.canRecommend === false &&
      data.clarification?.needed !== true &&
      data.clarification?.message
    ) {
      renderSearchNotice(
        data.clarification.message
      );

      renderProducts(
        displayResults,
        null,
        data.requestId || null
      );

      updateCounter(
        displayResults.length
      );

      return;
    }

    // ------------------------------------
    // PRODOTTO IDENTIFICATO
    // ------------------------------------

    if (
      data.canRecommend === true &&
      data.bestOffer
    ) {
      renderBestOffer(
        data.bestOffer,
        data.recommendation,
        data.context || null
      );
    } else {
      hideBestOffer();
    }

    renderProducts(
      displayResults,
      data.bestOffer || null,
      data.requestId || null
    );

    updateCounter(
      displayResults.length
    );

  } catch (err) {
    console.error(
      "Errore ricerca DaniSua:",
      err
    );

    if (
      current !== requestId
    ) {
      return;
    }

    hideBestOffer();

    if (containerProdotti) {
      containerProdotti.innerHTML = `
        <p class="error">
          La ricerca non è disponibile in questo momento.
          Riprova tra qualche secondo.
        </p>
      `;
    }

    updateCounter(0);

  } finally {
    if (loadingTimeout) {
      clearTimeout(
        loadingTimeout
      );
    }

    if (
      current === requestId
    ) {
      setLoading(false);
    }
  }
}


// ========================================
// RISULTATI VISIBILI
//
// Se esistono offerte utilizzabili,
// nascondiamo dalla griglia principale
// quelle stale / non disponibili / senza
// link valido. Se nessuna è utilizzabile,
// manteniamo il fallback completo così
// DaniSua può spiegare cosa va ricontrollato.
// ========================================

function selectDisplayResults(
  list
) {
  const source =
    Array.isArray(list)
      ? list
      : [];

  // Se abbiamo almeno una offerta con prezzo
  // abbastanza affidabile per il ranking,
  // mostriamo solo quelle nella griglia principale.
  //
  // Se invece tutte le offerte hanno il prezzo
  // da ricontrollare, NON blocchiamo la navigazione:
  // lasciamo visibili le schede, ma il prezzo resta
  // escluso dalla raccomandazione.
  const priceReliable =
    source.filter(
      product =>
        getOfferActionState(
          product
        ).priceReliable
    );

  return priceReliable.length > 0
    ? priceReliable
    : source;
}


// ========================================
// AZIONE OFFERTA
// ========================================

function getOfferActionState(
  product
) {
  const rawUrl =
    String(
      product?.url ||
      ""
    )
      .trim();

  let hasValidUrl =
    true;

  try {
    const parsed =
      new URL(
        rawUrl
      );

    if (
      parsed.protocol !==
        "http:" &&
      parsed.protocol !==
        "https:"
    ) {
      throw new Error(
        "unsupported protocol"
      );
    }
  } catch {
    hasValidUrl =
      false;
  }

  if (
    product?.stock ===
      false
  ) {
    return {
      enabled:
        hasValidUrl,
      priceReliable:
        false,
      label:
        hasValidUrl
          ? "Vedi pagina prodotto →"
          : "Non disponibile",
      reason:
        "out_of_stock",
    };
  }

  const reliabilityBlocked =
    product
      ?.reliability
      ?.eligibleForHourlyPolicy ===
      false;

  const freshnessBlocked =
    !product?.reliability &&
    product
      ?.freshness
      ?.eligibleForRecommendation ===
      false;

  if (
    reliabilityBlocked ||
    freshnessBlocked
  ) {
    return {
      // Un prezzo non affidabile NON deve
      // bloccare il link del negozio.
      enabled:
        hasValidUrl,
      priceReliable:
        false,
      label:
        hasValidUrl
          ? "Controlla prezzo sul sito →"
          : "Prezzo temporaneamente non disponibile",
      reason:
        reliabilityBlocked
          ? "reliability_blocked"
          : "freshness_blocked",
    };
  }

  if (!hasValidUrl) {
    return {
      enabled: false,
      priceReliable:
        true,
      label:
        "Link non disponibile",
      reason:
        "invalid_url",
    };
  }

  return {
    enabled: true,
    priceReliable:
      true,
    label:
      "Vedi offerta →",
    reason:
      "actionable",
  };
}


// ========================================
// ORDINE OFFERTE VISIBILI
// ========================================

function getDisplayOfferCost(
  product
) {
  const price =
    Number(
      product
        ?.offer_price
    );

  if (
    !Number.isFinite(
      price
    )
  ) {
    return Infinity;
  }

  const shipping =
    product
      ?.shipping_price;

  return (
    typeof shipping ===
      "number" &&
    Number.isFinite(
      shipping
    ) &&
    shipping >= 0
  )
    ? price +
      shipping
    : price;
}


function orderProductsForDisplay(
  list,
  bestOffer
) {
  const source =
    Array.isArray(
      list
    )
      ? [
          ...list,
        ]
      : [];

  const bestId =
    bestOffer
      ?.id != null
      ? String(
          bestOffer.id
        )
      : null;

  return source.sort(
    (
      left,
      right
    ) => {
      const leftBest =
        bestId &&
        String(
          left?.id
        ) ===
          bestId;

      const rightBest =
        bestId &&
        String(
          right?.id
        ) ===
          bestId;

      if (
        leftBest !==
        rightBest
      ) {
        return leftBest
          ? -1
          : 1;
      }

      const leftState =
        getOfferActionState(
          left
        );

      const rightState =
        getOfferActionState(
          right
        );

      // Prima vengono sempre le offerte il cui
      // prezzo è abbastanza affidabile da essere
      // confrontato. Un link valido da solo non
      // rende il prezzo raccomandabile.
      if (
        leftState.priceReliable !==
        rightState.priceReliable
      ) {
        return leftState.priceReliable
          ? -1
          : 1;
      }

      if (
        leftState.enabled !==
        rightState.enabled
      ) {
        return leftState.enabled
          ? -1
          : 1;
      }

      const leftShippingKnown =
        typeof left
          ?.shipping_price ===
          "number" &&
        Number.isFinite(
          left.shipping_price
        );

      const rightShippingKnown =
        typeof right
          ?.shipping_price ===
          "number" &&
        Number.isFinite(
          right.shipping_price
        );

      if (
        leftShippingKnown !==
        rightShippingKnown
      ) {
        return leftShippingKnown
          ? -1
          : 1;
      }

      return (
        getDisplayOfferCost(
          left
        ) -
        getDisplayOfferCost(
          right
        )
      );
    }
  );
}


// ========================================
// PRODOTTI
// ========================================

function renderProducts(
  list,
  bestOffer = null,
  searchRequestId = null
) {
  if (!containerProdotti) {
    return;
  }

  if (
    !list ||
    list.length === 0
  ) {
    containerProdotti.innerHTML = `
      <p class="no-resultados">
        Nessun prodotto trovato.
        Prova con altri termini.
      </p>
    `;

    return;
  }

  const imgFallback =
    "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect width='600' height='400' fill='%23f3f4f6'/%3E%3Ctext x='300' y='190' text-anchor='middle' font-family='Arial,sans-serif' font-size='24' fill='%236b7280'%3EFoto non disponibile%3C/text%3E%3Ctext x='300' y='225' text-anchor='middle' font-family='Arial,sans-serif' font-size='16' fill='%239ca3af'%3EDaniSuai mostrerà solo immagini verificate%3C/text%3E%3C/svg%3E";

  const orderedList =
    orderProductsForDisplay(
      list,
      bestOffer
    );

  containerProdotti.innerHTML =
    orderedList
      .map((product, index) => {
        const hasDiscount =
          typeof product.old_price ===
            "number" &&
          typeof product.offer_price ===
            "number" &&
          product.old_price >
            product.offer_price;

        const discountText =
          hasDiscount
            ? `-${getDiscountPercent(product)}%`
            : "";

        const oldPrice =
          hasDiscount
            ? formatPrice(
                product.old_price,
                product.currency || "EUR"
              )
            : "";

        const offerPrice =
          formatPrice(
            product.offer_price,
            product.currency || "EUR"
          );

        const shippingKnown =
          typeof product
            .shipping_price ===
            "number" &&
          Number.isFinite(
            product.shipping_price
          );

        const shippingText =
          shippingKnown
            ? (
                product.shipping_price ===
                  0
                  ? "Spedizione: gratuita"
                  : `Spedizione: ${formatPrice(
                      product.shipping_price,
                      product.currency || "EUR"
                    )}`
              )
            : "Spedizione: da verificare";

        const finalCost =
          shippingKnown &&
          typeof product
            .offer_price ===
            "number"
            ? product.offer_price +
              product.shipping_price
            : null;

        const finalCostText =
          typeof finalCost ===
            "number"
            ? `Costo finale: ${formatPrice(
                finalCost,
                product.currency || "EUR"
              )}`
            : "";

        // IMPORTANTE:
        // solo marcamos ganador si el backend
        // realmente ha elegido bestOffer.
        const isBest =
          bestOffer &&
          String(product.id) ===
            String(bestOffer.id);

        const cardClass =
          isBest
            ? "producto-card mejor-oferta"
            : "producto-card";

        const title =
          escapeHtml(
            product.title ||
            "Prodotto"
          );

        const brand =
          escapeHtml(
            product.brand || ""
          );

        const category =
          escapeHtml(
            product.category || ""
          );

        const store =
          escapeHtml(
            product.store || ""
          );

        const image =
          escapeHtml(
            product.image ||
            (
              product.productId
                ? `${API_BASE}/product-image/${encodeURIComponent(
                    product.productId
                  )}`
                : imgFallback
            )
          );

        const action =
          getOfferActionState(
            product
          );

        const url =
          escapeHtml(
            action.enabled
              ? product.url
              : ""
          );

        const actionLabel =
          escapeHtml(
            action.label
          );

        return `
          <div class="${cardClass}">

            <div class="producto-imagen-wrapper">

              ${
                hasDiscount
                  ? `
                    <div class="producto-badges-bar">
                      <span class="badge-descuento">
                        ${discountText}
                      </span>
                    </div>
                  `
                  : ""
              }

              <img
                src="${image}"
                alt="${title}"
                loading="lazy"
                onerror="this.onerror=null;this.src='${imgFallback}'"
              >

            </div>

            <div class="producto-info">

              <h3 class="producto-titulo">
                ${title}
              </h3>

              <p class="producto-marca">
                ${brand}
                ${
                  category
                    ? " · " + category
                    : ""
                }
              </p>

              <p class="producto-tienda">
                Negozio: ${store}
              </p>

              <p class="producto-meta-actualizacion">
                ${formatVerified(
                  product.verifiedAt,
                  product.updatedAt,
                  product.freshness,
                  product.reliability
                )}
              </p>

              ${
                product.color
                  ? `
                    <p class="producto-meta-actualizacion">
                      Colore: ${escapeHtml(product.color)}
                    </p>
                  `
                  : ""
              }

              ${
                getPaymentText(product)
                  ? `
                    <p class="producto-meta-actualizacion">
                      ${escapeHtml(
                        getPaymentText(product)
                      )}
                    </p>
                  `
                  : ""
              }

              ${
                getConditionText(product)
                  ? `
                    <p class="producto-meta-actualizacion">
                      ${escapeHtml(
                        getConditionText(product)
                      )}
                    </p>
                  `
                  : ""
              }

              ${
                isBest
                  ? `
                    <span class="badge-best-body">
                      ${
                        bestOffer
                          ?.costComparison
                          ?.confirmedFinalCost ===
                            true
                          ? "Migliore costo finale verificato"
                          : "Prezzo più basso · spedizione da verificare"
                      }
                    </span>
                  `
                  : ""
              }

              <div class="producto-precios">

                ${
                  hasDiscount
                    ? `
                      <span class="producto-precio-antiguo">
                        ${oldPrice}
                      </span>
                    `
                    : ""
                }

                <span class="producto-precio-oferta">
                  ${offerPrice}
                </span>

              </div>

              <p class="producto-meta-actualizacion">
                ${escapeHtml(shippingText)}
              </p>

              ${
                finalCostText
                  ? `
                    <p class="producto-meta-actualizacion">
                      ${escapeHtml(finalCostText)}
                    </p>
                  `
                  : ""
              }

              <button
                class="producto-btn-ver"
                data-url="${url}"
                data-action-reason="${escapeHtml(action.reason)}"
                data-offer-id="${escapeHtml(product.id || "")}"
                data-family-id="${escapeHtml(product.familyId || "")}"
                data-store="${escapeHtml(product.store || "")}"
                data-position="${index}"
                ${action.enabled ? "" : "disabled aria-disabled=\"true\""}
              >
                ${actionLabel}
              </button>

            </div>

          </div>
        `;
      })
      .join("");

  containerProdotti
    .querySelectorAll(
      ".producto-btn-ver"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const url =
            button.dataset.url;

          if (
            url &&
            url !== "#"
          ) {
            const position =
              Number(
                button
                  .dataset
                  .position
              );

            sendClientEvent({
              type:
                "offer_click",
              offerId:
                button
                  .dataset
                  .offerId ||
                null,
              familyId:
                button
                  .dataset
                  .familyId ||
                null,
              store:
                button
                  .dataset
                  .store ||
                null,
              searchRequestId,
              position:
                Number.isInteger(
                  position
                )
                  ? position
                  : null,
            });

            window.open(
              url,
              "_blank",
              "noopener,noreferrer"
            );
          }
        }
      );
    });
}


// ========================================
// CONTATORE
// ========================================

function updateCounter(n) {
  if (!contatoreRisultati) {
    return;
  }

  contatoreRisultati.textContent =
    `${n} ${
      n === 1
        ? "risultato"
        : "risultati"
    }`;
}


// ========================================
// DATA VERIFICA OFFERTA
// ========================================

function formatVerified(
  verifiedAt,
  updatedAt,
  freshness = null,
  reliability = null
) {
  const value =
    verifiedAt ||
    updatedAt;

  const status =
    reliability?.status ||
    freshness?.status ||
    null;

  if (
    status === "future" ||
    status === "invalid"
  ) {
    return "Data di verifica non affidabile";
  }

  if (!value) {
    return "Data di verifica non disponibile";
  }

  const time =
    new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return "Data di verifica non disponibile";
  }

  const base =
    `Prezzo verificato il ${new Date(
      time
    ).toLocaleDateString("it-IT")}`;

  if (
    reliability
      ?.timestampPrecision ===
      "date"
  ) {
    return (
      base +
      " · orario non registrato · da ricontrollare"
    );
  }

  const relative =
    formatUpdated(
      value
    )
      .replace(
        /^Aggiornato/,
        "Verificato"
      );

  if (status === "fresh") {
    return relative;
  }

  if (status === "review") {
    return (
      relative +
      " · da ricontrollare"
    );
  }

  if (status === "stale") {
    return (
      base +
      " · da ricontrollare"
    );
  }

  return base;
}


function getPaymentText(product) {
  const options =
    product?.pricing
      ?.paymentOptions;

  if (!Array.isArray(options)) {
    return "";
  }

  const installment =
    options.find(
      option =>
        option?.type ===
        "installment"
    );

  if (!installment) {
    return "";
  }

  if (
    Number.isInteger(
      installment.installments
    ) &&
    typeof installment.installment_amount ===
      "number"
  ) {
    return `${installment.installments} rate da ${formatPrice(
      installment.installment_amount,
      product.currency || "EUR"
    )}`;
  }

  return "Finanziamento disponibile: verifica le condizioni nel negozio.";
}


function getConditionText(product) {
  const conditions =
    product?.pricing
      ?.conditions;

  if (!Array.isArray(conditions)) {
    return "";
  }

  const active =
    conditions.find(
      condition =>
        condition &&
        condition.affects_price ===
          true
    );

  if (!active) {
    return "";
  }

  return active.code
    ? `Promozione con codice ${active.code}: non inclusa nel ranking finché non verificata al checkout.`
    : "Offerta con condizioni: verifica i requisiti prima dell'acquisto.";
}


// ========================================
// DATA AGGIORNAMENTO
// ========================================

function formatUpdated(updatedAt) {

  // Se la fonte non fornisce una data,
  // DaniSua non deve inventare freschezza.
  if (!updatedAt) {
    return "Data di aggiornamento non disponibile";
  }

  const time =
    new Date(updatedAt).getTime();

  if (!Number.isFinite(time)) {
    return "Data di aggiornamento non disponibile";
  }

  const now =
    Date.now();

  // Timestamp troppo nel futuro:
  // dato non affidabile.
  if (time > now + 60000) {
    return "Data di aggiornamento non disponibile";
  }

  const diffMs =
    now - time;

  const diffMin =
    Math.floor(
      diffMs / 60000
    );

  if (diffMin < 1) {
    return "Aggiornato ora";
  }

  if (diffMin === 1) {
    return "Aggiornato 1 min fa";
  }

  if (diffMin < 60) {
    return `Aggiornato ${diffMin} min fa`;
  }

  const diffH =
    Math.floor(
      diffMin / 60
    );

  if (diffH === 1) {
    return "Aggiornato 1 ora fa";
  }

  if (diffH < 24) {
    return `Aggiornato ${diffH} ore fa`;
  }

  const diffDays =
    Math.floor(
      diffH / 24
    );

  if (diffDays === 1) {
    return "Aggiornato 1 giorno fa";
  }

  if (diffDays < 7) {
    return `Aggiornato ${diffDays} giorni fa`;
  }

  return `Aggiornato il ${new Date(
    time
  ).toLocaleDateString("it-IT")}`;
}


// ========================================
// EVENTI
// ========================================

if (inputRicerca) {
  inputRicerca.addEventListener(
    "input",
    () => {
      const raw =
        inputRicerca.value;

      clearTimeout(
        debounceTimer
      );

      if (pendingClarification) {
        if (aiHint) {
          aiHint.textContent =
            raw.trim()
              ? "Premi Invio e continuo con questo dettaglio."
              : "Aggiungi il dettaglio che manca.";
        }

        return;
      }

      updateAiHint(raw);
    }
  );

  inputRicerca.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter"
      ) {
        event.preventDefault();

        clearTimeout(
          debounceTimer
        );

        const raw =
          resolveConversationQuery(
            inputRicerca.value
          );

        if (!raw) {
          return;
        }

        updateAiHint(raw);

        runSearchWithNormalize(
          raw,
          {
            showLoadingIfSlow:
              true,
          }
        );
      }
    }
  );
}


if (btnRicerca) {
  btnRicerca.addEventListener(
    "click",
    () => {
      clearTimeout(
        debounceTimer
      );

      const raw =
        resolveConversationQuery(
          inputRicerca?.value || ""
        );

      if (!raw) {
        return;
      }

      updateAiHint(raw);

      runSearchWithNormalize(
        raw,
        {
          showLoadingIfSlow:
            true,
        }
      );
    }
  );
}


searchExamples.forEach(
  button => {
    button.addEventListener(
      "click",
      () => {
        const query =
          button.dataset.query || "";

        if (!query) {
          return;
        }

        clearPendingClarification();

        if (inputRicerca) {
          inputRicerca.value =
            query;
        }

        updateAiHint(query);

        runSearchWithNormalize(
          query,
          {
            showLoadingIfSlow:
              true,
          }
        );
      }
    );
  }
);


// ========================================
// AVVIO DANISUA
// ========================================

updateAiHint("");

runSearchWithNormalize(
  "",
  {
    showLoadingIfSlow: false,
  }
);



