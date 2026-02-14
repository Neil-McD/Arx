#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

function usage() {
  console.error(
    [
      "Usage: node scripts/runtime_thread_invoke_report.mjs <log-path> [--max-list-tool-calls-per-window=N] [--max-list-events-since-per-window=N]",
      "",
      "Parses [runtime-thread-invokes] windows and reports per-command call rates.",
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
  let maxListToolCallsPerWindow = null;
  let maxListEventsSincePerWindow = null;

  for (const arg of args) {
    if (arg.startsWith("--max-list-tool-calls-per-window=")) {
      const raw = arg.slice("--max-list-tool-calls-per-window=".length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`invalid --max-list-tool-calls-per-window value: ${raw}`);
      }
      maxListToolCallsPerWindow = parsed;
      continue;
    }
    if (arg.startsWith("--max-list-events-since-per-window=")) {
      const raw = arg.slice("--max-list-events-since-per-window=".length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`invalid --max-list-events-since-per-window value: ${raw}`);
      }
      maxListEventsSincePerWindow = parsed;
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
    throw new Error("log path is required");
  }

  return {
    logPath,
    maxListToolCallsPerWindow,
    maxListEventsSincePerWindow,
  };
}

function parseInvokeLines(content) {
  const lines = content.split(/\r?\n/);
  const windows = [];
  for (const line of lines) {
    const marker = "[runtime-thread-invokes]";
    const idx = line.indexOf(marker);
    if (idx === -1) continue;
    const tail = line.slice(idx + marker.length).trim();
    const stats = {};
    const commandMatches = tail.matchAll(/([a-z_]+_cmd):calls=(\d+)/g);
    for (const match of commandMatches) {
      const command = match[1];
      const calls = Number.parseInt(match[2], 10);
      if (!Number.isFinite(calls)) continue;
      stats[command] = calls;
    }
    windows.push(stats);
  }
  return windows;
}

function summarizeCommand(windows, command) {
  let samples = 0;
  let maxCalls = 0;
  let totalCalls = 0;
  for (const stats of windows) {
    const calls = Number(stats[command] ?? 0);
    if (!Number.isFinite(calls)) continue;
    samples += 1;
    totalCalls += calls;
    if (calls > maxCalls) maxCalls = calls;
  }
  return {
    samples,
    totalCalls,
    maxCalls,
    avgCalls: samples > 0 ? totalCalls / samples : 0,
  };
}

async function main() {
  const {
    logPath,
    maxListToolCallsPerWindow,
    maxListEventsSincePerWindow,
  } = parseArgs(process.argv);
  const resolved = path.resolve(logPath);
  const content = await fs.readFile(resolved, "utf8");
  const windows = parseInvokeLines(content);
  if (windows.length === 0) {
    throw new Error("no [runtime-thread-invokes] lines found");
  }

  const toolCalls = summarizeCommand(windows, "list_tool_calls_cmd");
  const eventsSince = summarizeCommand(windows, "list_events_since_cmd");

  console.log("== Runtime Thread Invoke Summary ==");
  console.log(`log_file: ${resolved}`);
  console.log(`windows: ${windows.length}`);
  console.log(
    [
      "command",
      "samples",
      "total_calls",
      "avg_calls_per_window",
      "max_calls_per_window",
    ].join("\t"),
  );
  const formatRow = (command, summary) =>
    [
      command,
      String(summary.samples),
      String(summary.totalCalls),
      summary.avgCalls.toFixed(1),
      String(summary.maxCalls),
    ].join("\t");
  console.log(formatRow("list_tool_calls_cmd", toolCalls));
  console.log(formatRow("list_events_since_cmd", eventsSince));

  const failures = [];
  if (
    maxListToolCallsPerWindow !== null &&
    toolCalls.maxCalls > maxListToolCallsPerWindow
  ) {
    failures.push(
      `list_tool_calls_cmd max ${toolCalls.maxCalls} exceeds budget ${maxListToolCallsPerWindow}`,
    );
  }
  if (
    maxListEventsSincePerWindow !== null &&
    eventsSince.maxCalls > maxListEventsSincePerWindow
  ) {
    failures.push(
      `list_events_since_cmd max ${eventsSince.maxCalls} exceeds budget ${maxListEventsSincePerWindow}`,
    );
  }
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
