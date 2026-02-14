#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

function usage() {
  console.error(
    [
      "Usage: node scripts/run_latency_report.mjs <trace-log-path> [--min-ok=N] [--json] [--max-p95-preflight-ms=N] [--max-p95-first-text-token-ms=N] [--max-p95-turn-total-ms=N]",
      "",
      "Parses [thread-context-trace] run_latency events and reports p50/p95 metrics.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    usage();
    process.exit(2);
  }

  let logPath = null;
  let minOk = 0;
  let asJson = false;
  let maxP95PreflightMs = null;
  let maxP95FirstTextTokenMs = null;
  let maxP95TurnTotalMs = null;

  for (const arg of args) {
    if (arg.startsWith("--min-ok=")) {
      const raw = arg.slice("--min-ok=".length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`invalid --min-ok value: ${raw}`);
      }
      minOk = parsed;
      continue;
    }
    if (arg === "--json") {
      asJson = true;
      continue;
    }
    if (arg.startsWith("--max-p95-preflight-ms=")) {
      const raw = arg.slice("--max-p95-preflight-ms=".length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`invalid --max-p95-preflight-ms value: ${raw}`);
      }
      maxP95PreflightMs = parsed;
      continue;
    }
    if (arg.startsWith("--max-p95-first-text-token-ms=")) {
      const raw = arg.slice("--max-p95-first-text-token-ms=".length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`invalid --max-p95-first-text-token-ms value: ${raw}`);
      }
      maxP95FirstTextTokenMs = parsed;
      continue;
    }
    if (arg.startsWith("--max-p95-turn-total-ms=")) {
      const raw = arg.slice("--max-p95-turn-total-ms=".length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`invalid --max-p95-turn-total-ms value: ${raw}`);
      }
      maxP95TurnTotalMs = parsed;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`unknown flag: ${arg}`);
    }
    if (logPath) {
      throw new Error(`unexpected positional argument: ${arg}`);
    }
    logPath = arg;
  }

  if (!logPath) {
    throw new Error("trace log path is required");
  }

  return {
    logPath,
    minOk,
    asJson,
    maxP95PreflightMs,
    maxP95FirstTextTokenMs,
    maxP95TurnTotalMs,
  };
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const index = (sortedValues.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) {
    return sortedValues[low];
  }
  const weight = index - low;
  return sortedValues[low] + (sortedValues[high] - sortedValues[low]) * weight;
}

function summarizeNumeric(values) {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  return {
    n: sorted.length,
    min: sorted[0],
    p50,
    p95,
    max: sorted[sorted.length - 1],
  };
}

function numberOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function metricFromRun(run, keyPath) {
  const keys = keyPath.split(".");
  let current = run;
  for (const key of keys) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = current[key];
  }
  return numberOrNull(current);
}

function metricSummary(runs, keyPath) {
  const numbers = runs.map((run) => metricFromRun(run, keyPath)).filter((n) => n !== null);
  return summarizeNumeric(numbers);
}

function formatMs(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${Math.round(value)}ms`;
}

function printSummary(summary) {
  console.log("== Run Latency Summary ==");
  console.log(`log_file: ${summary.logFile}`);
  console.log(`trace_lines: ${summary.traceLines}`);
  console.log(`run_latency_events: ${summary.runLatencyEvents}`);
  console.log(`ok_runs: ${summary.okRuns}`);
  console.log(`error_runs: ${summary.errorRuns}`);
  console.log("");

  const rows = [
    ["turn_total_ms (ok)", summary.metrics.turnTotalOk],
    ["preflight_ms (ok)", summary.metrics.preflightOk],
    ["run_loop_ms (ok)", summary.metrics.runLoopOk],
    ["model_resolve_ms (ok)", summary.metrics.modelResolveOk],
    ["auth_prefetch_ms (ok)", summary.metrics.authPrefetchOk],
    ["engine_input_blob_write_ms (ok)", summary.metrics.engineInputBlobWriteOk],
    ["request_start_to_headers_ms (ok)", summary.metrics.requestStartToHeadersOk],
    ["headers_to_first_io_chunk_ms (ok)", summary.metrics.headersToFirstIoChunkOk],
    ["platform_preflight_ms (ok)", summary.metrics.platformPreflightOk],
    ["platform_auth_ms (ok)", summary.metrics.platformAuthOk],
    ["platform_tier_ms (ok)", summary.metrics.platformTierOk],
    ["platform_user_rl_ms (ok)", summary.metrics.platformUserRlOk],
    ["platform_ip_rl_ms (ok)", summary.metrics.platformIpRlOk],
    ["platform_model_ms (ok)", summary.metrics.platformModelOk],
    ["platform_quota_ms (ok)", summary.metrics.platformQuotaOk],
    ["first_io_chunk_ms (ok)", summary.metrics.firstIoChunkOk],
    ["first_text_token_ms (ok)", summary.metrics.firstTextTokenOk],
    ["io_gap_avg_ms (ok)", summary.metrics.ioGapAvgOk],
    ["io_gap_max_ms (ok)", summary.metrics.ioGapMaxOk],
    ["turn_total_ms (all)", summary.metrics.turnTotalAll],
  ];

  const header = ["metric", "n", "min", "p50", "p95", "max"];
  console.log(header.join("\t"));
  for (const [label, stats] of rows) {
    if (!stats) {
      console.log([label, "0", "n/a", "n/a", "n/a", "n/a"].join("\t"));
      continue;
    }
    console.log(
      [
        label,
        String(stats.n),
        formatMs(stats.min),
        formatMs(stats.p50),
        formatMs(stats.p95),
        formatMs(stats.max),
      ].join("\t"),
    );
  }

  console.log("");
  console.log("by_inference_source (ok):");
  const bySource = summary.byInferenceSource || {};
  const sources = Object.keys(bySource).sort();
  if (!sources.length) {
    console.log("none");
  } else {
    console.log(["source", "runs", "preflight_p50", "request_headers_p50", "first_text_p50"].join("\t"));
    for (const source of sources) {
      const record = bySource[source] || {};
      console.log(
        [
          source,
          String(record.runs ?? 0),
          formatMs(record.preflight?.p50 ?? null),
          formatMs(record.requestStartToHeaders?.p50 ?? null),
          formatMs(record.firstTextToken?.p50 ?? null),
        ].join("\t"),
      );
    }
  }

  console.log("");
  console.log("slowest_runs (top 5 by turn_total_ms):");
  if (!summary.slowestRuns.length) {
    console.log("none");
    return;
  }
  for (const run of summary.slowestRuns) {
    const tt = metricFromRun(run, "turn_total_ms");
    const pf = metricFromRun(run, "preflight_ms");
    const headers = metricFromRun(run, "stream.request_start_to_headers_ms");
    const platformPf = metricFromRun(run, "stream.platform_preflight_ms");
    const ttft = metricFromRun(run, "stream.first_text_token_ms");
    console.log(
      [
        `run_id=${run.run_id || "n/a"}`,
        `status=${run.status || "n/a"}`,
        `reason=${run.reason || "n/a"}`,
        `turn_total=${formatMs(tt)}`,
        `preflight=${formatMs(pf)}`,
        `request_headers=${formatMs(headers)}`,
        `platform_preflight=${formatMs(platformPf)}`,
        `first_text=${formatMs(ttft)}`,
      ].join("  "),
    );
  }
}

function parseTraceLines(content) {
  const lines = content.split(/\r?\n/);
  let traceLines = 0;
  const runs = [];

  for (const line of lines) {
    const marker = "[thread-context-trace]";
    const markerIndex = line.indexOf(marker);
    if (markerIndex === -1) {
      continue;
    }
    traceLines += 1;
    const jsonStart = line.indexOf("{", markerIndex);
    if (jsonStart === -1) {
      continue;
    }
    const raw = line.slice(jsonStart).trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || parsed.event !== "run_latency" || typeof parsed.payload !== "object") {
      continue;
    }
    runs.push(parsed.payload);
  }

  return { traceLines, runs };
}

function buildSummary(logFile, traceLines, runs) {
  const okRuns = runs.filter((run) => run.status === "ok");
  const errorRuns = runs.filter((run) => run.status !== "ok");
  const byInferenceSource = {};
  for (const run of okRuns) {
    const source =
      typeof run.inference_source === "string" && run.inference_source.trim().length > 0
        ? run.inference_source.trim()
        : "unknown";
    if (!byInferenceSource[source]) {
      byInferenceSource[source] = [];
    }
    byInferenceSource[source].push(run);
  }
  const slowestRuns = [...runs]
    .sort((a, b) => {
      const aValue = metricFromRun(a, "turn_total_ms") ?? -1;
      const bValue = metricFromRun(b, "turn_total_ms") ?? -1;
      return bValue - aValue;
    })
    .slice(0, 5);

  return {
    logFile,
    traceLines,
    runLatencyEvents: runs.length,
    okRuns: okRuns.length,
    errorRuns: errorRuns.length,
    metrics: {
      turnTotalOk: metricSummary(okRuns, "turn_total_ms"),
      preflightOk: metricSummary(okRuns, "preflight_ms"),
      runLoopOk: metricSummary(okRuns, "run_loop_ms"),
      modelResolveOk: metricSummary(okRuns, "stream.model_resolve_ms"),
      authPrefetchOk: metricSummary(okRuns, "stream.auth_prefetch_ms"),
      engineInputBlobWriteOk: metricSummary(okRuns, "stream.engine_input_blob_write_ms"),
      requestStartToHeadersOk: metricSummary(okRuns, "stream.request_start_to_headers_ms"),
      headersToFirstIoChunkOk: metricSummary(okRuns, "stream.headers_to_first_io_chunk_ms"),
      platformPreflightOk: metricSummary(okRuns, "stream.platform_preflight_ms"),
      platformAuthOk: metricSummary(okRuns, "stream.platform_auth_ms"),
      platformTierOk: metricSummary(okRuns, "stream.platform_tier_ms"),
      platformUserRlOk: metricSummary(okRuns, "stream.platform_user_rl_ms"),
      platformIpRlOk: metricSummary(okRuns, "stream.platform_ip_rl_ms"),
      platformModelOk: metricSummary(okRuns, "stream.platform_model_ms"),
      platformQuotaOk: metricSummary(okRuns, "stream.platform_quota_ms"),
      firstIoChunkOk: metricSummary(okRuns, "stream.first_io_chunk_ms"),
      firstTextTokenOk: metricSummary(okRuns, "stream.first_text_token_ms"),
      ioGapAvgOk: metricSummary(okRuns, "stream.io_gap_avg_ms"),
      ioGapMaxOk: metricSummary(okRuns, "stream.io_gap_max_ms"),
      turnTotalAll: metricSummary(runs, "turn_total_ms"),
    },
    byInferenceSource: Object.fromEntries(
      Object.entries(byInferenceSource).map(([source, sourceRuns]) => [
        source,
        {
          runs: sourceRuns.length,
          preflight: metricSummary(sourceRuns, "preflight_ms"),
          requestStartToHeaders: metricSummary(sourceRuns, "stream.request_start_to_headers_ms"),
          firstTextToken: metricSummary(sourceRuns, "stream.first_text_token_ms"),
        },
      ]),
    ),
    slowestRuns,
  };
}

async function main() {
  const {
    logPath,
    minOk,
    asJson,
    maxP95PreflightMs,
    maxP95FirstTextTokenMs,
    maxP95TurnTotalMs,
  } = parseArgs(process.argv);
  const resolved = path.resolve(logPath);
  const content = await fs.readFile(resolved, "utf8");
  const { traceLines, runs } = parseTraceLines(content);
  const summary = buildSummary(resolved, traceLines, runs);

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printSummary(summary);
  }

  if (summary.okRuns < minOk) {
    console.error(
      `FAIL: expected at least ${minOk} ok run_latency samples, found ${summary.okRuns}.`,
    );
    process.exit(1);
  }

  const budgetFailures = [];
  const checkP95Budget = (label, stats, budget) => {
    if (budget === null) return;
    const p95 = stats?.p95;
    if (!Number.isFinite(p95)) {
      budgetFailures.push(`missing p95 for ${label} (budget ${budget}ms)`);
      return;
    }
    if (p95 > budget) {
      budgetFailures.push(`${label} p95 ${Math.round(p95)}ms exceeds budget ${budget}ms`);
    }
  };

  checkP95Budget("preflight_ms (ok)", summary.metrics.preflightOk, maxP95PreflightMs);
  checkP95Budget(
    "first_text_token_ms (ok)",
    summary.metrics.firstTextTokenOk,
    maxP95FirstTextTokenMs,
  );
  checkP95Budget("turn_total_ms (ok)", summary.metrics.turnTotalOk, maxP95TurnTotalMs);

  if (budgetFailures.length > 0) {
    for (const failure of budgetFailures) {
      console.error(`FAIL: ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
