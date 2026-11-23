const {
  runAwinPreflight,
} = require("../server/integrations/awinPreflight");


const strict =
  process.argv.includes(
    "--strict"
  );


runAwinPreflight({
  env:
    process.env,
})
  .then(
    result => {
      console.log(
        JSON.stringify(
          {
            generatedAt:
              new Date()
                .toISOString(),
            ...result,
          },
          null,
          2
        )
      );

      if (
        strict &&
        result.ready !==
          true
      ) {
        process.exitCode = 1;
      }
    }
  )
  .catch(
    error => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            ready: false,
            reason:
              "exception",
            error:
              error
                ?.message ||
              String(
                error
              ),
          },
          null,
          2
        )
      );

      process.exitCode = 1;
    }
  );
