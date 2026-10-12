function pickBestOffer(products) {
  if (!products || products.length === 0) return null;

  // Regla simple v1: el precio más bajo gana
  let best = products[0];

  for (const product of products) {
    if (product.offer_price < best.offer_price) {
      best = product;
    }
  }

  return best;
}

module.exports = pickBestOffer;
