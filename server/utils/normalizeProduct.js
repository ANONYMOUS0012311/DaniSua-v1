function parsePrice(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value;

  const s = String(value)
    .replace(/[€\s]/g, "")
    .replace(",", ".");

  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
}

function normalizeProduct(p) {
  const title = pick(p, ["title", "título", "titulo"]);
  const brand = pick(p, ["brand", "marca"]);
  const store = pick(p, ["store", "tienda"]);
  const category = pick(p, ["category", "categoría", "categoria"]);

  const oldRaw = pick(p, ["old_price", "precio anterior", "precio_anterior"]);
  const offerRaw = pick(p, ["offer_price", "precio de oferta", "precio_oferta"]);

  const old_price = parsePrice(oldRaw);
  const offer_price = parsePrice(offerRaw);

  const currency = pick(p, ["currency", "moneda"]) || "EUR";
  const url = pick(p, ["url"]) || "#";
  const image = pick(p, ["image"]) || "";

  const updatedAt = new Date().toISOString();

  return {
    id: p.id ?? null,
    title: title || "",
    brand: brand || "",
    store: store || "",
    category: category || "",
    old_price,
    offer_price,
    currency,
    url,
    image,
    updatedAt,
  };
}

module.exports = { normalizeProduct };
