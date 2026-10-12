// normalize.js — Normalizzatore IT (gratis, regole semplici)

const BRAND_MAP = [
  { brand: "Apple", terms: ["apple", "iphone", "ipad", "macbook", "airpods"] },
  { brand: "Samsung", terms: ["samsung", "galaxy"] },
  { brand: "Sony", terms: ["sony", "playstation", "ps5", "ps4", "wh-1000xm", "xm5", "xm4"] },
  { brand: "Nintendo", terms: ["nintendo", "switch"] },
  { brand: "Microsoft", terms: ["microsoft", "xbox"] },
  { brand: "Xiaomi", terms: ["xiaomi", "redmi", "poco"] },
];

const CATEGORY_MAP = [
  { category: "smartphone", terms: ["iphone", "smartphone", "telefono", "cellulare", "galaxy"] },
  { category: "consola", terms: ["ps5", "playstation", "xbox", "switch", "console", "consola"] },
  { category: "auriculares", terms: ["cuffie", "auricolari", "headphones", "earbuds", "airpods", "xm5", "xm4"] },
  { category: "portatil", terms: ["macbook", "laptop", "notebook", "portatile"] },
  { category: "monitor", terms: ["monitor", "display", "schermo"] },
  { category: "gpu", terms: ["rtx", "gpu", "scheda", "grafica", "graphics"] },
];

// parole “rumore” (non aiutano la ricerca del prodotto)
const STOP_WORDS = new Set([
  "miglior","migliore","piu","più","meno","costo","costare"
  "offerta","offerte","sconto","sconti","ribasso","saldi",
  "economico","economica","piu","più","migliore","prezzo","prezzi",
  "spedizione","gratis","gratuita","consegna","oggi","subito",
  "nuovo","nuova","italia","roma","online","internet","amazon","ebay"
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/\biphon\b/g, "iphone")
    .replace(/\bsamsng\b/g, "samsung")
    .replace(/\bplay\s?station\b/g, "playstation")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function guessBrand(tokens) {
  const text = tokens.join(" ");
  for (const b of BRAND_MAP) {
    if (b.terms.some(t => text.includes(t))) return b.brand;
  }
  return null;
}

function guessCategory(tokens) {
  const text = tokens.join(" ");
  for (const c of CATEGORY_MAP) {
    if (c.terms.some(t => text.includes(t))) return c.category;
  }
  return null;
}

function normalizeQuery(raw) {
  const tokens = tokenize(raw);

  const brand_guess = guessBrand(tokens);
  const category_guess = guessCategory(tokens);

  const keywords = tokens.filter(t => !STOP_WORDS.has(t));
  const normalized_query = keywords.join(" ").trim();

  const dealTerms = ["offerta","offerte","sconto","sconti","saldi","ribasso","economico","economica"];
  const intent = tokens.some(t => dealTerms.includes(t)) ? "deal" : "search";

  return {
    raw_query: raw,
    normalized_query,
    brand_guess,
    category_guess,
    keywords,
    filters: { intent }
  };
}

window.normalizeQuery = normalizeQuery;
