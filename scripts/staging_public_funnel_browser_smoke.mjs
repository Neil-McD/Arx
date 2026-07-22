import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const CANONICAL_STAGING_HOST = "polynet-staging.vercel.app";
const FUNNEL_PATH = "/c/polynet";
const MARKER_PATH = "/version.json";
const MARKER_REQUEST_TIMEOUT_MS = 10_000;
const MARKER_POLL_INTERVAL_MS = 5_000;
const PAGE_TIMEOUT_MS = 30_000;
const RUNTIME_SETTLE_MS = 1_500;
const MAX_REPORTED_MESSAGE_LENGTH = 1_000;

class CanaryFailure extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CanaryFailure";
    this.details = details;
  }
}

function requiredEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new CanaryFailure(`${name} is required.`);
  return value;
}

function readNonNegativeInteger(name, fallback) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;
  if (!/^\d+$/.test(rawValue)) {
    throw new CanaryFailure(`${name} must be a non-negative integer.`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    throw new CanaryFailure(`${name} is outside the safe integer range.`);
  }
  return value;
}

function readStagingBaseUrl() {
  const rawValue = requiredEnvironmentValue("STAGING_DEPLOYMENT_URL");
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new CanaryFailure("STAGING_DEPLOYMENT_URL must be a valid URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== CANONICAL_STAGING_HOST ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new CanaryFailure(
      `STAGING_DEPLOYMENT_URL must be exactly https://${CANONICAL_STAGING_HOST}.`,
    );
  }
  return new URL(`https://${CANONICAL_STAGING_HOST}`);
}

function readExpectedBuildId() {
  const value = requiredEnvironmentValue("EXPECTED_BUILD_ID").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new CanaryFailure("EXPECTED_BUILD_ID must be a full 40-character Git SHA.");
  }
  return value;
}

function truncate(value) {
  const text = String(value ?? "");
  return text.length <= MAX_REPORTED_MESSAGE_LENGTH
    ? text
    : `${text.slice(0, MAX_REPORTED_MESSAGE_LENGTH)}...`;
}

function sanitizeUrl(rawValue) {
  try {
    const url = new URL(rawValue);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

function sanitizeMessage(rawValue) {
  return truncate(rawValue).replace(/https?:\/\/[^\s)\]}]+/g, (match) =>
    sanitizeUrl(match),
  );
}

function isPlatformRuntimeUrl(rawValue, stagingOrigin) {
  try {
    const url = new URL(rawValue);
    return (
      url.origin === stagingOrigin ||
      url.hostname.endsWith(".convex.cloud") ||
      url.hostname.endsWith(".convex.site")
    );
  } catch {
    return false;
  }
}

async function readBuildMarker(baseUrl) {
  const response = await fetch(new URL(MARKER_PATH, baseUrl), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(MARKER_REQUEST_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new CanaryFailure(`Build marker returned HTTP ${response.status}.`);
  }
  const body = await response.text();
  if (body.length > 10_000) {
    throw new CanaryFailure("Build marker response exceeded 10 KB.");
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new CanaryFailure("Build marker response was not valid JSON.");
  }
  const buildId = typeof payload?.buildId === "string" ? payload.buildId.toLowerCase() : null;
  if (!buildId || !/^[0-9a-f]{40}$/.test(buildId)) {
    throw new CanaryFailure("Build marker did not contain a full Git SHA.");
  }
  return buildId;
}

async function waitForExpectedBuild(baseUrl, expectedBuildId, waitMs) {
  const deadline = Date.now() + waitMs;
  let lastBuildId = null;
  let lastError = null;

  while (true) {
    try {
      lastBuildId = await readBuildMarker(baseUrl);
      lastError = null;
      if (lastBuildId === expectedBuildId) return lastBuildId;
    } catch (error) {
      lastError = error;
    }

    if (Date.now() >= deadline) {
      const reason = lastError
        ? `Last marker error: ${sanitizeMessage(lastError.message)}`
        : `Observed build ${lastBuildId}.`;
      throw new CanaryFailure(
        `Staging did not serve expected build ${expectedBuildId}. ${reason}`,
        { actualBuildId: lastBuildId },
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(MARKER_POLL_INTERVAL_MS, deadline - Date.now())),
    );
  }
}

async function requireVisible(locator, label) {
  try {
    await locator.waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
  } catch {
    throw new CanaryFailure(`${label} was not visible.`);
  }
}

async function requireEnabledJoinButton(page) {
  const buttons = page.getByRole("button", { name: "Join now", exact: true });
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if ((await button.isVisible()) && (await button.isEnabled())) return;
  }
  throw new CanaryFailure("No visible, enabled Join now button was present.");
}

async function writeFailureArtifacts({
  artifactDirectory,
  page,
  context,
  tracingStarted,
  report,
}) {
  await mkdir(artifactDirectory, { recursive: true });
  if (page) {
    try {
      await page.screenshot({
        path: path.join(artifactDirectory, "failure.png"),
        fullPage: true,
      });
    } catch {
      // The redacted report remains authoritative if the page cannot be captured.
    }
  }
  if (context && tracingStarted.value) {
    try {
      await context.tracing.stop({ path: path.join(artifactDirectory, "trace.zip") });
      tracingStarted.value = false;
    } catch {
      // Browser startup or teardown failures may make a trace unavailable.
    }
  }
  await writeFile(
    path.join(artifactDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}

async function main() {
  let phase = "configuration";
  let baseUrl = null;
  let expectedBuildId = null;
  let actualBuildId = null;
  let browser = null;
  let context = null;
  let page = null;
  const tracingStarted = { value: false };
  const consoleErrors = [];
  const pageErrors = [];
  const failedRuntimeRequests = [];
  const runtimeServerErrors = [];
  const artifactDirectory = path.resolve(
    process.env.STAGING_UI_ARTIFACT_DIR?.trim() || "artifacts/staging-ui-canary",
  );

  try {
    baseUrl = readStagingBaseUrl();
    expectedBuildId = readExpectedBuildId();
    const deploymentWaitMs = readNonNegativeInteger("STAGING_DEPLOYMENT_WAIT_MS", 0);

    phase = "build-marker";
    actualBuildId = await waitForExpectedBuild(baseUrl, expectedBuildId, deploymentWaitMs);

    phase = "browser-launch";
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    tracingStarted.value = true;
    page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(sanitizeMessage(message.text()));
    });
    page.on("pageerror", (error) => {
      pageErrors.push(sanitizeMessage(error.message));
    });
    page.on("requestfailed", (request) => {
      if (!isPlatformRuntimeUrl(request.url(), baseUrl.origin)) return;
      failedRuntimeRequests.push({
        url: sanitizeUrl(request.url()),
        error: sanitizeMessage(request.failure()?.errorText ?? "request failed"),
      });
    });
    page.on("response", (response) => {
      if (response.status() < 500 || !isPlatformRuntimeUrl(response.url(), baseUrl.origin)) return;
      runtimeServerErrors.push({
        url: sanitizeUrl(response.url()),
        status: response.status(),
      });
    });

    phase = "funnel-navigation";
    const navigationResponse = await page.goto(new URL(FUNNEL_PATH, baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    if (!navigationResponse || navigationResponse.status() >= 400) {
      throw new CanaryFailure(
        `Funnel navigation returned HTTP ${navigationResponse?.status() ?? "unknown"}.`,
      );
    }
    if (new URL(page.url()).pathname !== FUNNEL_PATH) {
      throw new CanaryFailure(`Funnel redirected to ${sanitizeUrl(page.url())}.`);
    }

    phase = "funnel-assertions";
    await requireVisible(
      page.getByRole("img", { name: "Polynet avatar", exact: true }),
      "Polynet avatar",
    );
    await requireVisible(
      page.getByRole("textbox", {
        name: "Join to message the community",
        exact: true,
      }),
      "anonymous community composer",
    );
    await requireVisible(
      page.getByText("Free to join · instant access", { exact: true }),
      "free instant-access policy",
    );
    await requireEnabledJoinButton(page);
    await page.waitForTimeout(RUNTIME_SETTLE_MS);

    if (pageErrors.length > 0) {
      throw new CanaryFailure("The page emitted an uncaught browser error.");
    }
    if (consoleErrors.length > 0) {
      throw new CanaryFailure("The page emitted a console error.");
    }
    if (failedRuntimeRequests.length > 0) {
      throw new CanaryFailure("A Polynet or Convex runtime request failed.");
    }
    if (runtimeServerErrors.length > 0) {
      throw new CanaryFailure("A Polynet or Convex runtime request returned HTTP 5xx.");
    }

    phase = "complete";
    await context.tracing.stop();
    tracingStarted.value = false;
    console.log(
      JSON.stringify({
        status: "passed",
        journey: "anonymous-public-funnel",
        url: `${baseUrl.origin}${FUNNEL_PATH}`,
        buildId: actualBuildId,
      }),
    );
  } catch (error) {
    const report = {
      status: "failed",
      journey: "anonymous-public-funnel",
      phase,
      url: baseUrl ? `${baseUrl.origin}${FUNNEL_PATH}` : null,
      expectedBuildId,
      actualBuildId: error?.details?.actualBuildId ?? actualBuildId,
      error: sanitizeMessage(error instanceof Error ? error.message : error),
      consoleErrors,
      pageErrors,
      failedRuntimeRequests,
      runtimeServerErrors,
    };
    await writeFailureArtifacts({
      artifactDirectory,
      page,
      context,
      tracingStarted,
      report,
    });
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    if (context && tracingStarted.value) {
      try {
        await context.tracing.stop();
      } catch {
        // Best-effort cleanup after the report has been written.
      }
    }
    if (browser) await browser.close();
  }
}

await main();
