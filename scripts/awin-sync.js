const path = require("path");

const {
  syncAwinFeeds,
} = require("../server/integrations/awinSync");


function getArg(
  name
) {
  const prefix =
    name + "=";

  const inline =
    process.argv.find(
      arg =>
        arg.startsWith(
          prefix
        )
    );

  if (inline) {
    return inline.slice(
      prefix.length
    );
  }

  const index =
    process.argv.indexOf(
      name
    );

  if (
    index !== -1 &&
    process.argv[index + 1]
  ) {
    return process.argv[
      index + 1
    ];
  }

  return null;
}


const apply =
  process.argv.includes(
    "--apply"
  );

const databasePath =
  getArg(
    "--db"
  );

const statePath =
  getArg(
    "--state"
  );

const maxFeeds =
  Number(
    getArg(
      "--max-feeds"
    ) ||
    5
  );


syncAwinFeeds({
  env:
    process.env,

  apply,

  databasePath:
    databasePath
      ? path.resolve(
          databasePath
        )
      : null,

  statePath:
    statePath
      ? path.resolve(
          statePath
        )
      : null,

  maxFeeds,
})
  .then(
    result => {
      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      if (
        result.ok ===
          false &&
        result.reason !==
          "missing_credentials" &&
        result.reason !==
          "missing_advertiser_allowlist"
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
