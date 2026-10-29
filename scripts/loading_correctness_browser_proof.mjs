import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { createServer } = await import(require.resolve("vite"));
const gateway = (names) =>
  names
    .map(
      (name) =>
        `export const ${name} = args => window.fixtureRequest(${JSON.stringify(name)}, args);`,
    )
    .join("\n");
const mocks = {
  "shared/cloudFounderBillingGateway.ts": `export const EMPTY_FOUNDER_BILLING_OVERVIEW = { communities: [] };\n${gateway(["loadCloudFounderBillingOverview", "startCloudFounderBillingPortal", "startCloudFounderSubscriptionCheckout"])}`,
  "shared/cloudCommunityAdminGateway.ts": gateway([
    "archiveCloudCommunity",
    "restoreCloudCommunityWithoutPayment",
    "banCloudCommunityMember",
    "fetchCloudCommunityAnalyticsSnapshot",
    "removeCloudCommunityMember",
    "setCloudCommunityMemberRole",
    "deleteCloudCommunityResource",
    "deleteCloudCommunityResourceModule",
    "ingestCloudCommunitySources",
    "listCloudCommunityResourceModuleRows",
    "listCloudCommunityResourceRows",
    "moveCloudCommunityResourceToModule",
    "prepareCloudCommunityBrandingField",
    "reorderCloudCommunityResourceModules",
    "reorderCloudCommunityResources",
    "saveCloudCommunityResource",
    "saveCloudCommunityResourceModule",
    "uploadCloudCommunityResourceSourceFile",
    "uploadCloudCommunityResourceImage",
    "listCloudCommunityResourceRevisions",
    "restoreCloudCommunityResourceRevision",
  ]),
  "shared/cloudCommunityEventsGateway.ts": gateway([
    "listCloudCommunityEvents",
    "saveCloudCommunityEvent",
    "cancelCloudCommunityEvent",
  ]),
  "shared/cloudCommunityMembershipGateway.ts": gateway([
    "countCloudCommunityMembershipRows",
  ]),
  "shared/cloudProfilesGateway.ts": gateway([
    "fetchCloudProfileDetailByUserId",
    "prepareCloudProfileAvatarField",
    "upsertCloudProfileDetail",
  ]),
};
const baselineArg = process.argv.find(
  (arg) => arg === "--baseline" || arg.startsWith("--baseline="),
);
const baseline = Boolean(baselineArg);
const baselineRef = baselineArg?.split("=").slice(1).join("=") || "HEAD";
const baselineFiles = new Map();
if (baseline)
  for (const path of execFileSync("git", ["diff", "--name-only", baselineRef], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")) {
    if (
      /\.(ts|tsx)$/.test(path) &&
      !path.startsWith("scripts/") &&
      execFileSync("git", ["ls-tree", baselineRef, "--", path], {
        cwd: root,
        encoding: "utf8",
      }).trim()
    ) {
      baselineFiles.set(
        join(root, path),
        execFileSync("git", ["show", `${baselineRef}:${path}`], {
          cwd: root,
          encoding: "utf8",
        }),
      );
    }
  }
const server = await createServer({
  configFile: join(root, "apps/web/vite.config.ts"),
  root: join(root, "apps/web"),
  server: { port: 0, host: "127.0.0.1" },
  plugins: [
    {
      name: "loading-proof",
      enforce: "pre",
      load(id) {
        for (const [path, code] of Object.entries(mocks))
          if (id === join(root, path)) return code;
        if (baselineFiles.has(id)) return baselineFiles.get(id);
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/__loading-proof")) return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            await server.transformIndexHtml(
              req.url,
              `<!doctype html><html><body><div id="root"></div><script type="module" src="/@fs/${root}scripts/fixtures/loadingCorrectness.tsx"></script></body></html>`,
            ),
          );
        });
      },
    },
  ],
});
await server.listen();
if (process.argv.includes("--preview-events")) {
  console.log(`Local Events preview: ${server.resolvedUrls.local[0]}__loading-proof?events-preview`);
  await new Promise(() => {});
}
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  let pendingImage;
  let imageReady = false;
  const imageBody =
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#39756c"/><circle cx="40" cy="30" r="12" fill="#e8e8e8"/><path d="M15 75a25 25 0 0 1 50 0" fill="#e8e8e8"/></svg>';
  const requests = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (request) => requests.push(request.url()));
  await page.route("**/*", (route) => {
    if (route.request().url() === "https://fixture.invalid/avatar.svg") {
      if (imageReady)
        return route.fulfill({ contentType: "image/svg+xml", body: imageBody });
      pendingImage = route;
      return;
    }
    return new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort();
  });
  await page.goto(server.resolvedUrls.local[0] + "__loading-proof");
  await page.waitForFunction(
    () => typeof window.runLoadingProof === "function",
  );
  const output = join(root, "artifacts/loading-correctness");
  await mkdir(output, { recursive: true });
  await page.exposeFunction("captureLoadingProofState", async (name) => {
    assert(["events-session-error", "profile-session-error", "events-ongoing", "events-history", "events-agenda", "events-agenda-history", "resources-partial-error"].includes(name));
    await page.screenshot({ path: join(output, `${name}.png`) });
  });
  const results = await page.evaluate(
    (baseline) => window.runLoadingProof(baseline),
    baseline,
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
  await writeFile(
    join(output, baseline ? "baseline.json" : "results.json"),
    JSON.stringify({ results, errors }, null, 2),
  );
  if (!baseline) {
    await page.evaluate(() =>
      window.showLoadingVisual("loading", "https://fixture.invalid/avatar.svg"),
    );
    await page.getByRole("status").getByText("Loading profile…").waitFor();
    const avatar = page.locator(".proof-avatar");
    const before = await avatar.boundingBox();
    const nameBefore = await page
      .getByRole("textbox", { name: "Name", exact: true })
      .boundingBox();
    assert.equal(await avatar.textContent(), "");
    assert.notEqual(
      await avatar.evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(255, 255, 0)",
    );
    assert(
      await page
        .getByRole("button", { name: "Save", exact: true })
        .isDisabled(),
    );
    await page.screenshot({ path: join(output, "profile-loading.png") });
    assert(pendingImage, "image request was not started");
    imageReady = true;
    await pendingImage.fulfill({
      contentType: "image/svg+xml",
      body: imageBody,
    });
    await avatar.locator("img").waitFor();
    const after = await avatar.boundingBox();
    assert.equal(before.width, after.width);
    assert.equal(before.height, after.height);
    await page.evaluate(() =>
      window.showLoadingVisual("ready", "https://fixture.invalid/avatar.svg"),
    );
    await page
      .getByRole("status")
      .getByText("Saved", { exact: true })
      .waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("img")].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
    assert.equal(
      nameBefore.y,
      (
        await page
          .getByRole("textbox", { name: "Name", exact: true })
          .boundingBox()
      ).y,
      "profile fields shifted after photo hydration",
    );
    assert(
      await page
        .getByRole("button", { name: "Save", exact: true })
        .isDisabled(),
    );
    await page.screenshot({ path: join(output, "profile-ready.png") });
    await page.getByRole("textbox", { name: /^Bio/ }).fill("");
    await page
      .getByRole("status")
      .getByText("Unsaved changes", { exact: true })
      .waitFor();
    assert(
      await page.getByRole("button", { name: "Save", exact: true }).isEnabled(),
    );
    await page.screenshot({ path: join(output, "profile-dirty.png") });
    await page.evaluate(() => window.showLoadingVisual("error", null));
    await page.getByRole("alert").waitFor();
    await page.screenshot({ path: join(output, "profile-error.png") });
    await writeFile(
      join(output, "visual.json"),
      JSON.stringify(
        {
          avatarBefore: before,
          avatarAfter: after,
          imageRequests: requests.filter(
            (url) => url === "https://fixture.invalid/avatar.svg",
          ).length,
          errors,
        },
        null,
        2,
      ),
    );
  }
  if (errors.length || results.some((result) => result.error))
    process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
