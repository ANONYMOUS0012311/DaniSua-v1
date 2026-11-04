function normalizeError(error) {
  if (!error || typeof error !== "object") {
    return {
      name: "Error",
      message:
        String(
          error ||
          "unknown_error"
        ),
    };
  }

  return {
    name:
      typeof error.name ===
        "string"
        ? error.name
        : "Error",

    message:
      typeof error.message ===
        "string"
        ? error.message
        : "unknown_error",

    code:
      error.code ||
      null,
  };
}


function writeLog(
  level,
  event,
  fields = {}
) {
  const payload = {
    timestamp:
      new Date()
        .toISOString(),

    level,

    event,

    ...fields,
  };

  const line =
    JSON.stringify(
      payload
    );

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}


function logInfo(
  event,
  fields = {}
) {
  writeLog(
    "info",
    event,
    fields
  );
}


function logError(
  event,
  error,
  fields = {}
) {
  writeLog(
    "error",
    event,
    {
      ...fields,
      error:
        normalizeError(
          error
        ),
    }
  );
}


module.exports = {
  logInfo,
  logError,
};
