import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertNotIncludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} not to include ${needle}`);
}

function assertOrdered(haystack: string, needles: string[], label: string) {
  let previousIndex = -1;
  for (const needle of needles) {
    const index = haystack.indexOf(needle);
    assert.ok(index >= 0, `expected ${label} to include ${needle}`);
    assert.ok(
      index > previousIndex,
      `expected ${needle} to appear after the previous marker in ${label}`,
    );
    previousIndex = index;
  }
}

function extractBetween(
  source: string,
  startMarker: string,
  endMarker: string,
  label: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `${label} start marker missing`);
  assert.ok(end > start, `${label} end marker missing`);
  return source.slice(start, end);
}

function main() {
  const types = readText("shared/communityAppMountTypes.ts");
  const gateway = readText("shared/cloudCommunityAppMountGateway.ts");
  const controller = readText("apps/web/src/controllers/useWebCommunityAppsController.ts");
  const editor = readText("apps/web/src/components/WebCommunityAiAgentAppsEditor.tsx");
  const app = readText("apps/web/src/App.tsx");
  const css = readText("apps/web/src/base.css");
  const packageJson = readText("package.json");

  const listGateway = extractBetween(
    gateway,
    "export async function listCloudPrivateCommunityMcpOptions",
    "export async function addCloudPrivateCommunityMcpApp",
    "private MCP options gateway",
  );
  const addGateway = extractBetween(
    gateway,
    "export async function addCloudPrivateCommunityMcpApp",
    "export async function connectCloudCommunityApp",
    "private MCP add gateway",
  );
  const pickerBlock = extractBetween(
    editor,
    "{isPrivateMcpPickerOpen ? (",
    "{error ? <div className=\"auth-error\">{error}</div> : null}",
    "private MCP picker UI",
  );
  const addController = extractBetween(
    controller,
    "const addPrivateCommunityMcpApp = useCallback(",
    "const updateCommunityAppMount = useCallback(",
    "private MCP add controller callback",
  );

  assertIncludes(types, "export type PrivateCommunityMcpOption", "private MCP option UI type");
  assertIncludes(
    types,
    "export type AddPrivateCommunityMcpAppResult",
    "private MCP add result UI type",
  );
  for (const expectedSafeField of [
    "mcp_registry_id",
    "add_status",
    "addable",
    "setup_required",
    "setup_reason",
    "error_message",
  ]) {
    assertIncludes(types, expectedSafeField, `private MCP UI types include ${expectedSafeField}`);
  }

  assertIncludes(
    listGateway,
    "community:listPrivateCommunityMcpOptions",
    "private MCP options gateway uses reviewed options query",
  );
  assertIncludes(
    addGateway,
    "community:addPrivateCommunityMcpApp",
    "private MCP add gateway uses typed product action",
  );
  assertIncludes(addGateway, "mcpRegistryId", "private MCP add gateway sends registry id");
  for (const forbiddenAddGatewayField of [
    "endpointUrl",
    "authType",
    "manifest",
    "secret",
    "command",
    "stdio",
  ]) {
    assertNotIncludes(
      addGateway,
      forbiddenAddGatewayField,
      `private MCP add gateway must not send ${forbiddenAddGatewayField}`,
    );
  }

  assertIncludes(
    controller,
    "listCloudPrivateCommunityMcpOptions",
    "community apps controller loads private MCP options",
  );
  assertIncludes(
    controller,
    "addCloudPrivateCommunityMcpApp",
    "community apps controller adds private MCP apps",
  );
  assertIncludes(
    controller,
    "privateCommunityMcpOptions",
    "community apps controller exposes private MCP options",
  );
  assertIncludes(
    controller,
    "addingPrivateCommunityMcpRegistryId",
    "community apps controller exposes per-option add state",
  );
  assertIncludes(
    controller,
    "hasLoadedPrivateCommunityMcpOptionsForActiveCommunity",
    "community apps controller exposes active-community private MCP load state",
  );
  assertIncludes(
    addController,
    "Added, but couldn't refresh the community app list. Refresh to see latest state.",
    "private MCP add distinguishes add success from post-add refresh failure",
  );
  assertOrdered(
    addController,
    [
      "const result = await addCloudPrivateCommunityMcpApp({",
      "const rows = await listCloudCommunityAppMounts({",
      "setCommunityAppMounts(rows);",
    ],
    "private MCP add refreshes community app mounts after success",
  );

  assertIncludes(
    editor,
    "isPrivateMcpPickerOpen",
    "community apps editor has inline private MCP picker state",
  );
  assertIncludes(
    editor,
    "aria-label=\"Reviewed MCP options\"",
    "community apps editor labels reviewed MCP options",
  );
  assertIncludes(
    editor,
    "!hasLoadedPrivateMcpOptionsForActiveCommunity",
    "community apps editor reloads private MCP options for the active community",
  );
  assertIncludes(
    editor,
    "shouldShowPrivateMcpLoading",
    "community apps editor hides stale private MCP options while the active community loads",
  );
  assertIncludes(
    editor,
    "mountedMcpRegistryIds.has(option.mcp_registry_id)",
    "community apps editor disables already mounted private MCPs",
  );
  assertIncludes(
    editor,
    "onAddPrivateMcpApp(option.mcp_registry_id)",
    "community apps editor adds private MCPs by registry id only",
  );
  for (const forbiddenPickerCopy of [
    "endpoint_url",
    "endpointUrl",
    "auth_type",
    "authType",
    "manifest",
    "stdio",
    "command",
    "Paste",
  ]) {
    assertNotIncludes(
      pickerBlock,
      forbiddenPickerCopy,
      `private MCP picker must not expose ${forbiddenPickerCopy}`,
    );
  }

  assertIncludes(app, "privateMcpOptions: privateCommunityMcpOptions", "App wires private MCP options into editor");
  assertIncludes(app, "hasLoadedPrivateMcpOptionsForActiveCommunity", "App wires active-community private MCP load state into editor");
  assertIncludes(app, "onLoadPrivateMcpOptions: loadPrivateCommunityMcpOptions", "App wires private MCP option loading into editor");
  assertIncludes(app, "onAddPrivateMcpApp: handleAddPrivateCommunityMcpApp", "App wires private MCP add into editor");
  assertIncludes(app, 'addButtonLabel: "Add MCP"', "App labels private MCP picker action");
  assertIncludes(app, "void reloadEffectiveMcpApps();", "App refreshes effective MCP projection after private MCP add");

  assertIncludes(css, ".community-private-mcp-picker", "private MCP picker CSS exists");
  assertIncludes(css, ".community-private-mcp-option", "private MCP option CSS exists");

  assertIncludes(
    packageJson,
    "\"check:private-community-mcp-ui-proof\"",
    "package script for private MCP UI proof",
  );

  console.log("private_community_mcp_ui_contract_proof: ok");
}

main();
