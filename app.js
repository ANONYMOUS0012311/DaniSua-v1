// app.js â€” DaniSua IT
console.log("DaniSua app.js loaded");

const API_BASE = "http://localhost:3000";

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

const BTN_TEXT_DEFAULT =
  btnRicerca
    ? btnRicerca.textContent
    : "Cerca";

let debounceTimer = null;
let requestId = 0;


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
      ? "Ricercaâ€¦"
      : BTN_TEXT_DEFAULT;
}


function showInlineLoading(rawQuery) {
  if (!containerProdotti) return;

  const q =
    rawQuery
      ? `: <strong>${escapeHtml(rawQuery)}</strong>`
      : "";

  containerProdotti.innerHTML =
    `<p class="loading">Ricerca${q}â€¦</p>`;
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

  if (
    typeof window.normalizeQuery !==
    "function"
  ) {
    aiHint.textContent = "";
    return;
  }

  if (
    !raw ||
    raw.trim().length === 0
  ) {
    aiHint.textContent = "";
    return;
  }

  const info =
    window.normalizeQuery(raw);

  const brand =
    info.brand_guess
      ? escapeHtml(
          info.brand_guess
        )
      : "â€”";

  const category =
    info.category_guess
      ? escapeHtml(
          info.category_guess
        )
      : "â€”";

  const intentLabel =
    info.filters?.intent === "deal"
      ? " Â· offerta"
      : "";

  aiHint.innerHTML = `
    <strong>Capito:</strong>
    ${brand} Â· ${category}${intentLabel}
    <br>
    <strong>Ricerca:</strong>
    ${escapeHtml(
      info.normalized_query || raw
    )}
  `;
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

  box.style.display = "block";

  const message =
    clarification?.message ||
    "Ho bisogno di qualche dettaglio in piÃ¹.";

  const options =
    clarification?.options || {};

  let choices = [];

  if (
    Array.isArray(options.models)
  ) {
    choices = options.models;
  } else if (
    Array.isArray(options.storages)
  ) {
    choices = options.storages;
  }

  let buttonsHtml = "";

  if (choices.length > 0) {
    buttonsHtml = `
      <div class="danisua-choices">
        ${choices
          .map(
            choice => `
              <button
                type="button"
                class="danisua-choice-btn"
                data-choice="${escapeHtml(choice)}"
              >
                ${escapeHtml(choice)}
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  content.innerHTML = `
    <div class="danisua-clarification">
      <strong>
        Ho bisogno di un dettaglio in piÃ¹
      </strong>

      <p>
        ${escapeHtml(message)}
      </p>

      ${buttonsHtml}
    </div>
  `;

  content
    .querySelectorAll(
      ".danisua-choice-btn"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const choice =
            button.dataset.choice || "";

          applyClarificationChoice(
            originalQuery,
            choice,
            clarification
          );
        }
      );
    });
}


// ========================================
// APPLICARE RISPOSTA UTENTE
// ========================================

function applyClarificationChoice(
  originalQuery,
  choice,
  clarification
) {
  if (!choice) {
    return;
  }

  const missing =
    clarification?.missing || [];

  let nextQuery =
    (originalQuery || "").trim();

  // Se stiamo scegliendo un modello,
  // sostituiamo la ricerca generica
  // con il modello scelto.
  if (
    missing.includes("model")
  ) {
    nextQuery = choice;
  } else {
    // Per storage / configurazioni
    // aggiungiamo la scelta alla ricerca.
    nextQuery =
      `${nextQuery} ${choice}`.trim();
  }

  if (inputRicerca) {
    inputRicerca.value =
      nextQuery;
  }

  updateAiHint(nextQuery);

  runSearchWithNormalize(
    nextQuery,
    {
      showLoadingIfSlow: true,
    }
  );
}


// ========================================
// MIGLIORE OFFERTA
// ========================================

function renderBestOffer(
  product,
  recommendation
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

  const price =
    formatPrice(
      product.offer_price,
      product.currency || "EUR"
    );

  const comparedOffers =
    recommendation?.comparedOffers || 1;

  const savings =
    recommendation?.savingsVsNextOffer;

  let savingsText = "";

  if (
    typeof savings === "number" &&
    savings > 0
  ) {
    savingsText = `
      <p class="danisua-saving">
        Risparmi
        <strong>
          ${formatPrice(
            savings,
            product.currency || "EUR"
          )}
        </strong>
        rispetto alla seconda offerta piÃ¹ economica.
      </p>
    `;
  }

  const explanation =
    recommendation?.message
      ? escapeHtml(
          recommendation.message
        )
      : "";

  content.innerHTML = `
    <div class="danisua-recommendation">

      <strong class="danisua-product-name">
        ${title}
      </strong>

      <p>
        <strong>
          ${price}
        </strong>
        Â· ${store}
      </p>

      ${
        explanation
          ? `
            <p>
              ${explanation}
            </p>
          `
          : ""
      }

      ${
        comparedOffers > 1
          ? `
            <p>
              Ho confrontato
              <strong>
                ${comparedOffers}
              </strong>
              offerte equivalenti.
            </p>
          `
          : ""
      }

      ${savingsText}

      <p class="danisua-rule-note">
        La raccomandazione attuale considera
        il prezzo delle offerte equivalenti.
      </p>

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

    // ------------------------------------
    // PRODOTTO IDENTIFICATO
    // ------------------------------------

    if (
      data.canRecommend === true &&
      data.bestOffer
    ) {
      renderBestOffer(
        data.bestOffer,
        data.recommendation
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
    "https://via.placeholder.com/300x200/eeeeee/aaaaaa?text=Prodotto";

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
                    ? " Â· " + category
                    : ""
                }
              </p>

              <p class="producto-tienda">
                Negozio: ${store}
              </p>

              <p class="producto-meta-actualizacion">
                ${formatUpdated(
                  product.updatedAt
                )}
              </p>

              ${
                isBest
                  ? `
                    <span class="badge-best-body">
                      Migliore offerta trovata
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

              <button
                class="producto-btn-ver"
                data-url="${url}"
              >
                Vedi offerta âž
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

      updateAiHint(raw);

      clearTimeout(
        debounceTimer
      );

      debounceTimer =
        setTimeout(
          () =>
            runSearchWithNormalize(
              raw
            ),
          350
        );
    }
  );

  inputRicerca.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter"
      ) {
        clearTimeout(
          debounceTimer
        );

        const raw =
          inputRicerca.value;

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
        inputRicerca?.value || "";

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



