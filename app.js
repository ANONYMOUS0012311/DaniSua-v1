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

async function fetchSearch(query) {
  const url =
    `${API_BASE}/search?q=${encodeURIComponent(query || "")}`;

  console.log(
    "Ricerca DaniSua:",
    url
  );

  const res =
    await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Errore backend /search (${res.status})`
    );
  }

  return res.json();
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
      `Per ${useCase}, questo è il modello che risulta più adatto tra quelli con dati comparabili.` +
      criteriaText +
      " Poi ho cercato l'offerta più conveniente per quella scelta."
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
      ? `Tra i modelli compatibili, questo è quello che combina meglio ${criteria.join(", ")}; poi ho scelto la sua offerta più conveniente.`
      : "Tra i modelli compatibili, questo risulta il più adatto; poi ho scelto la sua offerta più conveniente.";
  }

  if (
    reason ===
    "generic_price_first"
  ) {
    return "Non hai indicato una configurazione precisa: ho confrontato le varianti compatibili e scelto quella che oggi conviene di più.";
  }

  if (
    reason ===
      "lowest_price_equivalent_offers" ||
    reason ===
      "lowest_price_requested"
  ) {
    return "Hai indicato un prodotto preciso: ho confrontato le offerte equivalenti e questa è quella che conviene di più.";
  }

  return "Ho confrontato le opzioni compatibili e scelto quella con il miglior equilibrio tra richiesta e prezzo disponibile.";
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
    return "Tutte le configurazioni monitorate hanno un prezzo standard comparabile.";
  }

  if (
    coverage.marketComplete === true
  ) {
    const missing =
      coverage
        .missingConfigurationLabels ||
      [];

    return missing.length > 0
      ? `Conosco tutte le configurazioni del modello; per ${missing.join(", ")} oggi manca un prezzo standard comparabile.`
      : "Conosco lo stato di tutte le configurazioni monitorate.";
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

  return `Non ho ancora dati comparabili sufficienti per: ${labels.join(", ")}.`;
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
      product.freshness
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
        results,
        null
      );

      updateCounter(
        results.length
      );

      return;
    }

    clearPendingClarification();

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
      results,
      data.bestOffer || null
    );

    updateCounter(
      results.length
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
          Impossibile completare la ricerca.
          Controlla che il backend sia attivo su
          ${escapeHtml(API_BASE)}.
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
// PRODOTTI
// ========================================

function renderProducts(
  list,
  bestOffer = null
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

  containerProdotti.innerHTML =
    list
      .map(product => {
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
            imgFallback
          );

        const url =
          escapeHtml(
            product.url || "#"
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
                  product.freshness
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
              >
                Vedi offerta →
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
  freshness = null
) {
  const value =
    verifiedAt ||
    updatedAt;

  if (
    freshness?.status ===
      "future" ||
    freshness?.status ===
      "invalid"
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
    freshness?.status ===
      "stale"
  ) {
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



