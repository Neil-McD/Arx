import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const host = (process.env.WEB_BOOTSTRAP_HOST ?? "127.0.0.1").trim();
const port = Number.parseInt(process.env.WEB_BOOTSTRAP_PORT ?? "4174", 10);
const routeHash = (process.env.WEB_BOOTSTRAP_ROUTE_HASH ?? "#page=workspace&view=home").trim();
const appPrefix = (process.env.WEB_BOOTSTRAP_APP_PREFIX ?? "apps/web").trim();
const waitTimeoutMs = Number.parseInt(process.env.WEB_BOOTSTRAP_WAIT_TIMEOUT_MS ?? "30000", 10);
const settleMs = Number.parseInt(process.env.WEB_BOOTSTRAP_SETTLE_MS ?? "1200", 10);

const baseUrl = `http://${host}:${port}`;
const targetUrl = `${baseUrl}/${routeHash.startsWith("#") ? routeHash : `#${routeHash}`}`;

function fail(message) {
  throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function pushLog(logs, chunk) {
  const lines = chunk
    .toString("utf8")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (const line of lines) {
    logs.push(line);
    if (logs.length > 120) logs.shift();
  }
}

async function waitForServerReady(url, timeoutMs, previewExited, previewExitCode, previewLogs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (previewExited()) {
      const logTail = previewLogs.slice(-30).join("\n");
      fail(
        [
          `preview server exited before ready (exit=${String(previewExitCode())})`,
          logTail ? `preview logs:\n${logTail}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status < 500) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  const logTail = previewLogs.slice(-30).join("\n");
  fail(
    [
      `timed out waiting for preview server at ${url}`,
      lastError ? `last error: ${String(lastError)}` : "",
      logTail ? `preview logs:\n${logTail}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
}

async function main() {
  console.log("== Web bootstrap smoke checks ==");
  console.log(`Target URL: ${targetUrl}`);

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const previewArgs = [
    "run",
    "preview",
    "--prefix",
    appPrefix,
    "--",
    "--host",
    host,
    "--port",
    String(port),
    "--strictPort",
  ];

  const previewLogs = [];
  let previewExited = false;
  let previewExitCode = null;

  const previewProcess = spawn(npmCmd, previewArgs, {
    cwd: repoRoot,
    env: { ...process.env, CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  previewProcess.stdout.on("data", (chunk) => {
    pushLog(previewLogs, chunk);
  });
  previewProcess.stderr.on("data", (chunk) => {
    pushLog(previewLogs, chunk);
  });
  previewProcess.on("exit", (code) => {
    previewExited = true;
    previewExitCode = code;
  });

  const cleanupPreview = () => {
    if (!previewProcess.killed) {
      previewProcess.kill("SIGTERM");
    }
  };
  process.on("exit", cleanupPreview);
  process.on("SIGINT", () => {
    cleanupPreview();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanupPreview();
    process.exit(143);
  });

  let browser = null;
  try {
    await waitForServerReady(
      baseUrl,
      waitTimeoutMs,
      () => previewExited,
      () => previewExitCode,
      previewLogs,
    );

    const consoleErrors = [];
    const pageErrors = [];

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error instanceof Error ? error.message : String(error));
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: waitTimeoutMs });
    await page.waitForTimeout(settleMs);

    const shellState = await page.evaluate(() => {
      const root = document.querySelector("#root");
      const text = (root?.textContent ?? "").replace(/\s+/g, " ").trim();
      const nodeCount = root ? root.querySelectorAll("*").length : 0;
      const hasMain = Boolean(root?.querySelector("main"));
      const hasCrashBanner = /arx ui crashed|ui crashed/i.test(text);
      return {
        hasRoot: Boolean(root),
        nodeCount,
        hasMain,
        textLength: text.length,
        textSample: text.slice(0, 180),
        hasCrashBanner,
      };
    });

    if (!shellState.hasRoot) {
      fail("missing #root element after bootstrap.");
    }
    if (shellState.hasCrashBanner) {
      fail(`crash banner detected in app shell: ${shellState.textSample}`);
    }
    if (!shellState.hasMain || shellState.nodeCount < 8 || shellState.textLength < 40) {
      fail(
        `app shell render is unexpectedly empty (hasMain=${shellState.hasMain}, nodeCount=${shellState.nodeCount}, textLength=${shellState.textLength}).`,
      );
    }

    if (pageErrors.length > 0) {
      const sample = pageErrors.slice(0, 8).map((error) => `- ${error}`).join("\n");
      fail(`page runtime errors detected:\n${sample}`);
    }
    if (consoleErrors.length > 0) {
      const sample = consoleErrors.slice(0, 12).map((error) => `- ${error}`).join("\n");
      fail(`console errors detected during bootstrap:\n${sample}`);
    }

    console.log("PASS: web bootstrap smoke checks passed.");
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    cleanupPreview();
    process.off("exit", cleanupPreview);
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
