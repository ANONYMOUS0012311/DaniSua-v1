// DaniSuai reusable load tester
// Measures controlled concurrency without retrying failed requests.

const { performance } = require("perf_hooks");

function getArg(name, fallback = null) {
  const index =
    process.argv.indexOf(name);

  if (
    index !== -1 &&
    process.argv[index + 1]
  ) {
    return process.argv[
      index + 1
    ];
  }

  const prefix =
    name + "=";

  const inline =
    process.argv.find(
      arg =>
        arg.startsWith(
          prefix
        )
    );

  return inline
    ? inline.slice(
        prefix.length
      )
    : fallback;
}


function percentile(
  sorted,
  value
) {
  if (sorted.length === 0) {
    return null;
  }

  const index =
    Math.min(
      sorted.length - 1,
      Math.max(
        0,
        Math.ceil(
          value *
          sorted.length
        ) - 1
      )
    );

  return sorted[index];
}


async function requestOnce(
  url,
  timeoutMs
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  const started =
    performance.now();

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,
          headers: {
            "User-Agent":
              "DaniSuai-Load-Test/1.0",
          },
        }
      );

    await response
      .arrayBuffer();

    return {
      ok:
        response.ok,
      status:
        response.status,
      latencyMs:
        performance.now() -
        started,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs:
        performance.now() -
        started,
      error:
        error?.name ||
        "request_error",
    };
  } finally {
    clearTimeout(
      timer
    );
  }
}


async function runLevel({
  url,
  concurrency,
  totalRequests,
  timeoutMs,
}) {
  let cursor = 0;

  const results = [];

  const started =
    performance.now();

  async function worker() {
    while (true) {
      const index =
        cursor;

      cursor += 1;

      if (
        index >=
        totalRequests
      ) {
        return;
      }

      results.push(
        await requestOnce(
          url,
          timeoutMs
        )
      );
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            concurrency,
            totalRequests
          ),
      },
      () => worker()
    )
  );

  const durationMs =
    performance.now() -
    started;

  const latencies =
    results
      .map(
        result =>
          result.latencyMs
      )
      .sort(
        (a, b) =>
          a - b
      );

  const failed =
    results.filter(
      result =>
        !result.ok
    );

  const statusCounts = {};

  for (
    const result of
    results
  ) {
    const key =
      result.status === null
        ? (
            result.error ||
            "network_error"
          )
        : String(
            result.status
          );

    statusCounts[key] =
      (
        statusCounts[key] ||
        0
      ) + 1;
  }

  return {
    concurrency,
    totalRequests,
    success:
      results.length -
      failed.length,
    failed:
      failed.length,
    errorRate:
      Number(
        (
          failed.length /
          Math.max(
            1,
            results.length
          )
        ).toFixed(4)
      ),
    durationMs:
      Number(
        durationMs.toFixed(2)
      ),
    requestsPerSecond:
      Number(
        (
          results.length /
          Math.max(
            durationMs / 1000,
            0.001
          )
        ).toFixed(2)
      ),
    p50Ms:
      Number(
        percentile(
          latencies,
          0.50
        )?.toFixed(2) ||
        0
      ),
    p95Ms:
      Number(
        percentile(
          latencies,
          0.95
        )?.toFixed(2) ||
        0
      ),
    p99Ms:
      Number(
        percentile(
          latencies,
          0.99
        )?.toFixed(2) ||
        0
      ),
    maxMs:
      Number(
        (
          latencies[
            latencies.length - 1
          ] ||
          0
        ).toFixed(2)
      ),
    statusCounts,
  };
}


async function main() {
  const url =
    getArg(
      "--url"
    );

  if (!url) {
    throw new Error(
      "--url is required"
    );
  }

  const levels =
    String(
      getArg(
        "--levels",
        "10,25,50,100"
      )
    )
      .split(",")
      .map(Number)
      .filter(
        value =>
          Number.isInteger(
            value
          ) &&
          value > 0
      );

  const requestsPerLevel =
    Number(
      getArg(
        "--requests-per-level",
        "100"
      )
    );

  const maxP95Ms =
    Number(
      getArg(
        "--max-p95-ms",
        "5000"
      )
    );

  const maxErrorRate =
    Number(
      getArg(
        "--max-error-rate",
        "0.01"
      )
    );

  const timeoutMs =
    Number(
      getArg(
        "--timeout-ms",
        "15000"
      )
    );

  const summary = {
    url:
      new URL(
        url
      ).origin +
      new URL(
        url
      ).pathname,
    levels: [],
    thresholds: {
      maxP95Ms,
      maxErrorRate,
    },
  };

  for (
    const concurrency of
    levels
  ) {
    const result =
      await runLevel({
        url,
        concurrency,
        totalRequests:
          Math.max(
            concurrency,
            requestsPerLevel
          ),
        timeoutMs,
      });

    summary
      .levels
      .push(
        result
      );

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    if (
      result.errorRate >
        maxErrorRate ||
      result.p95Ms >
        maxP95Ms
    ) {
      summary.passed =
        false;

      console.log(
        JSON.stringify(
          summary,
          null,
          2
        )
      );

      process.exitCode =
        1;

      return;
    }
  }

  summary.passed =
    true;

  console.log(
    JSON.stringify(
      summary,
      null,
      2
    )
  );
}


main().catch(
  error => {
    console.error(
      error?.stack ||
      error
    );

    process.exitCode = 1;
  }
);
