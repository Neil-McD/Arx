import {
  assert,
  buildMaintenancePayload,
  convexRunJson,
  parseCommonOptions,
  readFlag,
  withMaintenanceToken,
} from "./staging_maintenance_cli.ts";

const options = parseCommonOptions();
const ownerId = readFlag("--owner-id");

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url);
  return {
    status: response.status,
    text: await response.text(),
  };
}

async function readStagingBundleFingerprint(stagingUrl: string, deploymentName: string) {
  const normalizedBase = stagingUrl.replace(/\/+$/, "");
  const versionResponse = await fetchText(`${normalizedBase}/version.json`);
  assert(versionResponse.status >= 200 && versionResponse.status < 300, "staging version.json must load");
  const version = JSON.parse(versionResponse.text);

  const htmlResponse = await fetchText(normalizedBase);
  assert(htmlResponse.status >= 200 && htmlResponse.status < 300, "staging root HTML must load");
  const assetPaths = Array.from(htmlResponse.text.matchAll(/\/assets\/[^"'\s>]+\.js/g)).map((match) => match[0]);
  assert(assetPaths.length > 0, "staging root HTML must reference JS assets");

  const expectedConvexUrl = `https://${deploymentName}.convex.cloud`;
  let convexUrlPresent = false;
  let stagingHostPresent = false;
  let codexPrimaryCanaryFlagPresent = false;
  let codexPrimaryCanaryTogglePresent = false;
  for (const assetPath of assetPaths.slice(0, 6)) {
    const asset = await fetchText(`${normalizedBase}${assetPath}`);
    if (asset.status < 200 || asset.status >= 300) continue;
    if (asset.text.includes(expectedConvexUrl)) convexUrlPresent = true;
    if (asset.text.includes("polynet-staging")) stagingHostPresent = true;
    if (asset.text.includes("codex_primary_canary")) codexPrimaryCanaryFlagPresent = true;
    if (asset.text.includes("workspace-codex-canary-toggle")) codexPrimaryCanaryTogglePresent = true;
    if (
      convexUrlPresent &&
      stagingHostPresent &&
      codexPrimaryCanaryFlagPresent &&
      codexPrimaryCanaryTogglePresent
    ) break;
  }

  return {
    version,
    assetCount: assetPaths.length,
    expectedConvexUrl,
    convexUrlPresent,
    stagingHostPresent,
    codexPrimaryCanaryFlagPresent,
    codexPrimaryCanaryTogglePresent,
  };
}

const fingerprint = withMaintenanceToken(options, (token) =>
  convexRunJson(
    options,
    "stagingMaintenance:getStagingWorldFingerprint",
    buildMaintenancePayload(options, token, {
      ownerId: ownerId ?? undefined,
    }),
  ),
);

const web = await readStagingBundleFingerprint(options.stagingUrl, options.deploymentName);

assert(fingerprint?.staging?.hostname === "polynet-staging.vercel.app", "Convex staging hostname must be polynet-staging.vercel.app");
if (ownerId) {
  assert(fingerprint?.owner?.id === ownerId, "staging owner id must match expected owner");
} else {
  const observedOwnerEmail = String(
    fingerprint?.owner?.normalizedEmail ?? fingerprint?.owner?.email ?? "",
  ).toLowerCase();
  assert(observedOwnerEmail === options.ownerEmail.toLowerCase(), "staging owner email must match expected owner");
}
assert(Array.isArray(fingerprint?.communities), "staging communities fingerprint missing");
for (const slug of ["polynet", "distribution-engineering"]) {
  const community = fingerprint.communities.find((item: any) => item.slug === slug);
  assert(community?.exists === true, `staging community missing: ${slug}`);
  assert(community?.ownedByExpectedUser === true, `staging community owner mismatch: ${slug}`);
  assert(community?.visibility === "published", `staging community visibility mismatch: ${slug}`);
}
assert(fingerprint?.project?.exists === true, "staging default project missing");
assert(fingerprint?.codex?.harnessEnabled === true, "Codex harness flag must be enabled in staging");
assert(fingerprint?.codex?.executorEnabled === true, "Codex executor flag must be enabled in staging");
assert(fingerprint?.codex?.primaryEnabled === true, "Codex primary flag must be enabled in staging");
assert(fingerprint?.codex?.probeMode === "canary", "Codex probe mode must be canary in staging");
assert(fingerprint?.codex?.dynamicToolBridgeUrlConfigured === true, "Codex dynamic tool bridge URL must resolve in staging");
assert(fingerprint?.codex?.nonStreamingCanaryFallbackEnabled === false, "Codex primary canary fallback must be disabled once the staging web bundle sends the explicit flag");
assert(fingerprint?.codex?.daytonaApiKeyPresent === true, "Daytona API key must be present in staging");
assert(fingerprint?.codex?.daytonaOrgIdPresent === true, "Daytona org id must be present in staging");
assert(fingerprint?.codex?.daytonaSnapshotPresent === true, "Daytona snapshot must be present in staging");
assert(fingerprint?.codex?.chatgptConnectionCount > 0, "ChatGPT provider connection must exist for the staging owner");
assert(fingerprint?.codex?.operability, "Codex operability fingerprint must be present");
assert(
  Number.isFinite(Number(fingerprint?.codex?.operability?.bridgeSessions?.activeCount)),
  "Codex bridge session operability count must be present",
);
assert(
  Number.isFinite(Number(fingerprint?.codex?.operability?.bindingLocks?.activeCount)),
  "Codex binding lock operability count must be present",
);
assert(
  Number(fingerprint?.codex?.operability?.bindingLocks?.duplicateActiveKeyCount ?? 0) === 0,
  "Codex binding locks must not have duplicate active keys in staging",
);
assert(
  Number(fingerprint?.codex?.operability?.threadBindings?.duplicateActiveKeyCount ?? 0) === 0,
  "Codex thread bindings must not have duplicate active keys in staging",
);
assert(web.convexUrlPresent, `staging web bundle must point at ${web.expectedConvexUrl}`);
assert(web.stagingHostPresent, "staging web bundle must include staging host wiring");
assert(web.codexPrimaryCanaryFlagPresent, "staging web bundle must send the explicit codex_primary_canary flag");
assert(web.codexPrimaryCanaryTogglePresent, "staging web bundle must include the Codex primary canary toggle");

console.log(
  JSON.stringify(
    {
      ok: true,
      deploymentName: options.deploymentName,
      stagingUrl: options.stagingUrl,
      buildId: web.version?.buildId ?? null,
      owner: fingerprint.owner,
      communities: fingerprint.communities,
      project: fingerprint.project,
      codex: fingerprint.codex,
      codexOperability: fingerprint.codex?.operability ?? null,
      web: {
        assetCount: web.assetCount,
        expectedConvexUrl: web.expectedConvexUrl,
        convexUrlPresent: web.convexUrlPresent,
        stagingHostPresent: web.stagingHostPresent,
        codexPrimaryCanaryFlagPresent: web.codexPrimaryCanaryFlagPresent,
        codexPrimaryCanaryTogglePresent: web.codexPrimaryCanaryTogglePresent,
      },
    },
    null,
    2,
  ),
);
