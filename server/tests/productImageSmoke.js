const assert =
  require("assert");

const {
  extractProductImageUrl,
  getProductImageSourcePage,
  fetchProductImageUrl,
  clearProductImageCache,
} = require("../utils/productImage");


async function main() {
  const sourcePage =
    "https://www.apple.com/it/iphone-17/";

  const absolute =
    extractProductImageUrl(
      '<html><head><meta property="og:image" content="https://cdn.example.com/iphone17.jpg"></head></html>',
      sourcePage
    );

  assert.strictEqual(
    absolute,
    "https://cdn.example.com/iphone17.jpg",
    "Deve leggere og:image assoluto"
  );

  const relative =
    extractProductImageUrl(
      '<meta content="/images/pixel11.webp" property="og:image">',
      "https://store.google.com/it/product/pixel_11"
    );

  assert.strictEqual(
    relative,
    "https://store.google.com/images/pixel11.webp",
    "Deve risolvere og:image relativo"
  );

  const products = [
    {
      id:
        "apple-iphone-17-256-black",
      imageSourcePage:
        sourcePage,
    },
  ];

  assert.strictEqual(
    getProductImageSourcePage(
      products,
      "apple-iphone-17-256-black"
    ),
    sourcePage,
    "Deve usare solo la pagina sorgente presente nel catalogo"
  );

  clearProductImageCache();

  let calls = 0;

  const fetchImpl =
    async () => {
      calls += 1;

      return {
        ok: true,
        async text() {
          return '<meta property="og:image" content="https://cdn.example.com/verified.jpg">';
        },
      };
    };

  const first =
    await fetchProductImageUrl({
      products,
      productId:
        "apple-iphone-17-256-black",
      fetchImpl,
      now:
        1000,
    });

  const second =
    await fetchProductImageUrl({
      products,
      productId:
        "apple-iphone-17-256-black",
      fetchImpl,
      now:
        2000,
    });

  assert.strictEqual(
    first,
    "https://cdn.example.com/verified.jpg",
    "Deve risolvere la foto verificata"
  );

  assert.strictEqual(
    second,
    first,
    "La cache deve restituire la stessa foto"
  );

  assert.strictEqual(
    calls,
    1,
    "La cache deve evitare fetch ripetuti"
  );

  console.log(
    "✅ PRODUCT IMAGE — official source, og:image, cache e fallback safety"
  );
}


main()
  .catch(
    error => {
      console.error(
        "❌ PRODUCT IMAGE",
        error
          ?.stack ||
        error
      );

      process.exitCode =
        1;
    }
  );
