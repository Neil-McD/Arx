import assert from "node:assert/strict";
import { POLYNET_MCP_PROTOCOL_VERSION } from "../shared/polynetMcp.ts";

type SmokeMode = "metadata" | "authenticated" | "acceptance";

type HttpJsonResponse = {
  url: string;
  status: number;
  headers: Headers;
  body: unknown;
  text: string;
};

const PROVIDER_TOOLS = [
  "polynet_list_workspaces",
  "polynet_open_workspace",
  "polynet_get_workspace_context",
  "polynet_product_docs_search",
  "polynet_product_doc_read",
  "polynet_workspace_memory_search",
  "polynet_workspace_memory_read",
  "polynet_workspace_record_outcome",
  "polynet_workspace_resources_map",
  "polynet_workspace_resources_list",
  "polynet_workspace_resource_read",
  "polynet_workspace_resources_search",
  "polynet_workspace_builder_resources_map",
  "polynet_workspace_builder_resources_list",
  "polynet_workspace_builder_resource_read",
] as const;

const MCP_ACCESS_RELATIONS = [
  "owner",
  "admin",
  "moderator",
  "member",
  "pending",
  "no_access",
] as const;

const MCP_AUTHORITY_LENSES = [
  "owner_builder",
  "owner",
  "admin_builder",
  "admin",
  "moderator",
  "member",
  "pending",
  "no_access",
] as const;

const MCP_TOOLSETS = [
  "workspace_context",
  "accepted_memory",
  "raw_evidence_search",
  "member_resources",
  "builder_resources",
  "join_request_review",
  "community_admin",
  "owner_controls",
] as const;

let requestId = 1;

function printHelp(): never {
  console.log(`PolyNet Workspace MCP external smoke

Usage:
  npm run smoke:polynet-workspace-mcp-metadata -- --url=https://example.com/runtime/mcp
  npm run smoke:polynet-workspace-mcp-authenticated -- --url=https://example.com/runtime/mcp
  npm run smoke:polynet-workspace-mcp-acceptance -- --url=https://example.com/runtime/mcp
  node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_external_smoke.ts --mode=metadata --url=https://example.com/runtime/mcp
  node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_external_smoke.ts --mode=authenticated --url=https://example.com/runtime/mcp
  node --experimental-strip-types --experimental-specifier-resolution=node scripts/polynet_workspace_mcp_external_smoke.ts --mode=acceptance --url=https://example.com/runtime/mcp

Environment:
  POLYNET_MCP_URL                  Remote MCP endpoint. If only an origin is supplied, /runtime/mcp is appended.
  POLYNET_MCP_BEARER_TOKEN         Required for authenticated and acceptance modes.
  POLYNET_MCP_COMMUNITY_SLUG       Optional workspace slug to open. Defaults to the first listed workspace.
  POLYNET_MCP_MEMORY_QUERY         Optional memory query. Defaults to "strategy".
  POLYNET_MCP_MEMORY_NODE_ID       Optional memory node id override for read.
  POLYNET_MCP_RETRIEVAL_LOG_ID     Optional retrieval log id override for read/outcome.
  POLYNET_MCP_RESOURCE_QUERY       Optional resource search query. Defaults to "platform".
  POLYNET_MCP_EXPECT_RELATION      Optional exact expected workspace authority relation.
  POLYNET_MCP_EXPECT_AUTHORITY_LENS Optional exact expected workspace authority lens.
  POLYNET_MCP_EXPECT_TOOLSETS      Optional comma-separated toolsets that must be available.
  POLYNET_MCP_REQUIRE_MEMORY       Set to 1 to make authenticated mode fail if no memory node is readable.
  POLYNET_MCP_REQUIRE_RESOURCES    Set to 1 to make authenticated mode fail if resources are unavailable or unreadable.
  POLYNET_MCP_REQUIRE_BUILDER_RESOURCES Set to 1 to make authenticated mode fail if builder resources are unavailable or not builder-scoped.
  POLYNET_MCP_RECORD_OUTCOME       Set to 1 to run the write-path outcome smoke.
  POLYNET_MCP_TIMEOUT_MS           Request timeout in milliseconds. Defaults to 15000.
`);
  process.exit(0);
}

function argValue(name: string): string | null {
  const equalPrefix = `${name}=`;
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === name) return process.argv[index + 1] ?? null;
    if (arg.startsWith(equalPrefix)) return arg.slice(equalPrefix.length);
  }
  return null;
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolEnv(name: string): boolean {
  const value = readEnv(name);
  if (!value) return false;
  return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase());
}

function readMode(): SmokeMode {
  const value = argValue("--mode") ?? readEnv("POLYNET_MCP_SMOKE_MODE") ?? "metadata";
  if (value === "metadata" || value === "authenticated" || value === "acceptance") return value;
  throw new Error(`Unsupported smoke mode: ${value}`);
}

function readTimeoutMs(): number {
  const raw = argValue("--timeout-ms") ?? readEnv("POLYNET_MCP_TIMEOUT_MS");
  if (!raw) return 15_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 120_000) {
    throw new Error("POLYNET_MCP_TIMEOUT_MS must be between 1000 and 120000.");
  }
  return Math.floor(parsed);
}

function normalizeMcpUrl(raw: string | null): string {
  if (!raw) {
    throw new Error("POLYNET_MCP_URL or --url is required for external smoke.");
  }
  const url = new URL(raw);
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = "/runtime/mcp";
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function wellKnownUrl(mcpUrl: string, path: string): string {
  const url = new URL(mcpUrl);
  url.pathname = path;
  url.hash = "";
  url.search = "";
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "Expected object.");
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function envList(name: string): string[] {
  const value = readEnv(name);
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertOneOf<T extends readonly string[]>(
  value: string | null,
  allowed: T,
  label: string,
): asserts value is T[number] {
  assert.ok(value, `${label} is required.`);
  assert.ok(
    (allowed as readonly string[]).includes(value),
    `${label} must be one of ${allowed.join(", ")}; received ${value}.`,
  );
}

type WorkspaceAuthorityProjection = {
  relation: string;
  authority_lens: string;
  available_toolsets: string[];
};

function assertWorkspaceAuthority(
  workspace: Record<string, unknown>,
  label: string,
): WorkspaceAuthorityProjection {
  const authority = asRecord(workspace.authority);
  const relation = asString(authority.relation);
  assertOneOf(relation, MCP_ACCESS_RELATIONS, `${label}.authority.relation`);

  const authorityLens = asString(authority.authority_lens);
  assertOneOf(authorityLens, MCP_AUTHORITY_LENSES, `${label}.authority.authority_lens`);

  const availableToolsets = asArray(authority.available_toolsets)
    .map(asString)
    .filter((item): item is string => Boolean(item));
  assert.ok(
    availableToolsets.length > 0,
    `${label}.authority.available_toolsets should not be empty.`,
  );
  assert.ok(
    availableToolsets.includes("workspace_context"),
    `${label}.authority.available_toolsets should include workspace_context.`,
  );
  for (const toolset of availableToolsets) {
    assertOneOf(toolset, MCP_TOOLSETS, `${label}.authority.available_toolsets[]`);
  }

  const expectedRelation = readEnv("POLYNET_MCP_EXPECT_RELATION");
  if (expectedRelation) {
    assert.equal(
      relation,
      expectedRelation,
      `${label}.authority.relation should match POLYNET_MCP_EXPECT_RELATION.`,
    );
  }

  const expectedAuthorityLens = readEnv("POLYNET_MCP_EXPECT_AUTHORITY_LENS");
  if (expectedAuthorityLens) {
    assert.equal(
      authorityLens,
      expectedAuthorityLens,
      `${label}.authority.authority_lens should match POLYNET_MCP_EXPECT_AUTHORITY_LENS.`,
    );
  }

  for (const toolset of envList("POLYNET_MCP_EXPECT_TOOLSETS")) {
    assert.ok(
      availableToolsets.includes(toolset),
      `${label}.authority.available_toolsets should include expected toolset: ${toolset}.`,
    );
  }

  return {
    relation,
    authority_lens: authorityLens,
    available_toolsets: availableToolsets,
  };
}

function assertMatchingAuthority(
  opened: WorkspaceAuthorityProjection,
  context: WorkspaceAuthorityProjection,
): void {
  assert.equal(
    context.relation,
    opened.relation,
    "polynet_get_workspace_context authority relation should match polynet_open_workspace.",
  );
  assert.equal(
    context.authority_lens,
    opened.authority_lens,
    "polynet_get_workspace_context authority lens should match polynet_open_workspace.",
  );
  assert.deepEqual(
    context.available_toolsets.slice().sort(),
    opened.available_toolsets.slice().sort(),
    "polynet_get_workspace_context available toolsets should match polynet_open_workspace.",
  );
}

function parseJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<HttpJsonResponse> {
  const timeoutMs = readTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      url,
      status: response.status,
      headers: response.headers,
      body: parseJson(text),
      text,
    };
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson(url: string): Promise<HttpJsonResponse> {
  return fetchJson(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
}

async function postJsonRpc(args: {
  mcpUrl: string;
  method: string;
  params?: Record<string, unknown>;
  token?: string | null;
}): Promise<HttpJsonResponse> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": POLYNET_MCP_PROTOCOL_VERSION,
  };
  if (args.token) headers.Authorization = `Bearer ${args.token}`;
  return fetchJson(args.mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId++,
      method: args.method,
      params: args.params ?? {},
    }),
  });
}

function assertStatus(response: HttpJsonResponse, status: number, label: string): void {
  assert.equal(
    response.status,
    status,
    `${label} returned HTTP ${response.status}: ${response.text.slice(0, 500)}`,
  );
}

function assertJsonRpcResult(response: HttpJsonResponse, label: string): Record<string, unknown> {
  assertStatus(response, 200, label);
  const body = asRecord(response.body);
  assert.equal(body.jsonrpc, "2.0", `${label} should return a JSON-RPC response.`);
  assert.ok(!body.error, `${label} returned JSON-RPC error: ${JSON.stringify(body.error)}`);
  return asRecord(body.result);
}

async function callTool(args: {
  mcpUrl: string;
  token: string;
  name: string;
  toolArgs?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const response = await postJsonRpc({
    mcpUrl: args.mcpUrl,
    token: args.token,
    method: "tools/call",
    params: {
      name: args.name,
      arguments: args.toolArgs ?? {},
    },
  });
  const result = assertJsonRpcResult(response, args.name);
  assert.notEqual(result.isError, true, `${args.name} returned tool error: ${JSON.stringify(result)}`);
  return asRecord(result.structuredContent);
}

function readAuthenticateParam(header: string, paramName: string): string | null {
  const quoted = new RegExp(`${paramName}="([^"]+)"`).exec(header);
  if (quoted?.[1]) return quoted[1];
  const unquoted = new RegExp(`${paramName}=([^,\\s]+)`).exec(header);
  return unquoted?.[1] ?? null;
}

function normalizeComparableUrl(raw: string): string {
  return new URL(raw).toString().replace(/\/$/, "");
}

function deepFindFirstString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindFirstString(item, keys);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const found = asString(record[key]);
    if (found) return found;
  }
  for (const child of Object.values(record)) {
    const found = deepFindFirstString(child, keys);
    if (found) return found;
  }
  return null;
}

function firstNodeId(memory: Record<string, unknown>): string | null {
  const nodes = asArray(memory.nodes);
  for (const node of nodes) {
    const record = optionalRecord(node);
    if (!record) continue;
    const id = asString(record.node_id) ?? asString(record.nodeId) ?? asString(record.id);
    if (id) return id;
  }
  return deepFindFirstString(memory, ["node_id", "nodeId"]);
}

function firstRetrievalLogId(memory: Record<string, unknown>): string | null {
  const retrievalLog = optionalRecord(memory.retrieval_log);
  return (
    asString(memory.retrieval_log_id) ??
    asString(memory.retrievalLogId) ??
    (retrievalLog ? asString(retrievalLog.id) : null) ??
    deepFindFirstString(memory, ["retrieval_log_id", "retrievalLogId"])
  );
}

function firstResourceRef(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstResourceRef(item);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const resourceId = asString(record.resource_id) ?? asString(record.resourceId);
  if (resourceId) return resourceId;

  if (asString(record.type) === "resource") {
    const directoryUri = asString(record.directory_uri) ?? asString(record.directoryUri);
    if (directoryUri) return directoryUri;
    const directoryPath = asString(record.directory_path) ?? asString(record.path);
    if (directoryPath) return directoryPath;
  }

  for (const child of Object.values(record)) {
    const found = firstResourceRef(child);
    if (found) return found;
  }
  return null;
}

function firstProductDocSlug(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstProductDocSlug(item);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  const slug = asString(record.slug);
  if (slug) return slug;
  for (const child of Object.values(record)) {
    const found = firstProductDocSlug(child);
    if (found) return found;
  }
  return null;
}

function arrayLengthField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  return Array.isArray(value) ? value.length : 0;
}

function numericField(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toolNamesFromToolsList(result: Record<string, unknown>): string[] {
  return asArray(result.tools)
    .map(optionalRecord)
    .filter(Boolean)
    .map((tool) => asString(tool.name))
    .filter((name): name is string => Boolean(name));
}

async function runMetadataSmoke(mcpUrl: string): Promise<Record<string, unknown>> {
  const unauthorizedInitialize = await postJsonRpc({
    mcpUrl,
    method: "initialize",
    params: {
      protocolVersion: POLYNET_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "polynet-workspace-mcp-external-smoke",
        version: "0.1.0",
      },
    },
  });
  assertStatus(unauthorizedInitialize, 401, "unauthenticated initialize");
  const authenticateHeader = unauthorizedInitialize.headers.get("www-authenticate");
  assert.ok(authenticateHeader, "unauthenticated initialize should return WWW-Authenticate.");
  assert.ok(
    authenticateHeader.includes("Bearer"),
    "unauthenticated initialize should return a bearer challenge.",
  );
  assert.ok(
    authenticateHeader.includes("resource_metadata="),
    "unauthenticated initialize should include resource_metadata.",
  );

  const unauthorizedToolsList = await postJsonRpc({
    mcpUrl,
    method: "tools/list",
  });
  assertStatus(unauthorizedToolsList, 401, "unauthenticated tools/list");

  const unauthorizedCall = await postJsonRpc({
    mcpUrl,
    method: "tools/call",
    params: {
      name: "polynet_list_workspaces",
      arguments: {},
    },
  });
  assertStatus(unauthorizedCall, 401, "unauthenticated tools/call");
  const resourceMetadataUrl = readAuthenticateParam(authenticateHeader, "resource_metadata");
  assert.ok(resourceMetadataUrl, "WWW-Authenticate should expose resource_metadata URL.");

  const protectedResource = await getJson(resourceMetadataUrl);
  assertStatus(protectedResource, 200, "oauth-protected-resource metadata");
  const protectedResourceBody = asRecord(protectedResource.body);
  assert.equal(
    normalizeComparableUrl(String(protectedResourceBody.resource)),
    normalizeComparableUrl(mcpUrl),
    "protected resource metadata should identify the remote MCP endpoint.",
  );
  const authorizationServers = asArray(protectedResourceBody.authorization_servers)
    .map(asString)
    .filter(Boolean);
  assert.ok(authorizationServers.length > 0, "protected resource metadata should name an issuer.");
  assert.ok(
    asArray(protectedResourceBody.bearer_methods_supported).includes("header"),
    "protected resource metadata should support bearer header auth.",
  );

  const authServerMetadataUrl = wellKnownUrl(mcpUrl, "/.well-known/oauth-authorization-server");
  const authServer = await getJson(authServerMetadataUrl);
  assertStatus(authServer, 200, "oauth-authorization-server metadata");
  const authServerBody = asRecord(authServer.body);
  assert.equal(
    authServerBody.issuer,
    authorizationServers[0],
    "authorization-server compatibility metadata should proxy the advertised issuer.",
  );
  assert.ok(asString(authServerBody.authorization_endpoint), "authorization endpoint is required.");
  assert.ok(asString(authServerBody.token_endpoint), "token endpoint is required.");
  assert.ok(
    asArray(authServerBody.grant_types_supported).includes("authorization_code"),
    "authorization code grant should be advertised.",
  );
  assert.ok(
    asArray(authServerBody.code_challenge_methods_supported).includes("S256"),
    "PKCE S256 should be advertised.",
  );
  assert.ok(
    asArray(authServerBody.token_endpoint_auth_methods_supported).includes("none"),
    "public client token exchange should be advertised.",
  );

  return {
    unauthenticated_initialize_challenge: "ok",
    unauthenticated_tools_list_challenge: "ok",
    unauthenticated_tools_call_challenge: "ok",
    resource_metadata_url: resourceMetadataUrl,
    authorization_server_metadata_url: authServerMetadataUrl,
    advertised_issuer: authorizationServers[0],
  };
}

async function runResourceSmoke(args: {
  mcpUrl: string;
  token: string;
  workspaceContextId: string;
  availableToolsets: string[];
  requireResources: boolean;
}): Promise<Record<string, unknown>> {
  if (!args.availableToolsets.includes("member_resources")) {
    if (args.requireResources) {
      throw new Error("POLYNET_MCP_REQUIRE_RESOURCES requires the member_resources toolset.");
    }
    return {
      resource_map: "skipped_member_resources_unavailable",
      resource_list: "skipped_member_resources_unavailable",
      resource_search: "skipped_member_resources_unavailable",
      resource_read: "skipped_member_resources_unavailable",
      resource_found: false,
      resource_map_scope: null,
      mapped_resource_count: null,
    };
  }

  const list = await callTool({
    mcpUrl: args.mcpUrl,
    token: args.token,
    name: "polynet_workspace_resources_list",
    toolArgs: {
      workspace_context_id: args.workspaceContextId,
      limit: 25,
    },
  });
  const listedResources = asRecord(list.resources);
  assert.notEqual(
    listedResources.ok,
    false,
    `polynet_workspace_resources_list returned failure: ${JSON.stringify(listedResources)}`,
  );

  const map = await callTool({
    mcpUrl: args.mcpUrl,
    token: args.token,
    name: "polynet_workspace_resources_map",
    toolArgs: {
      workspace_context_id: args.workspaceContextId,
      limit: 50,
      per_module_limit: 10,
    },
  });
  const mappedResources = asRecord(map.resources);
  assert.notEqual(
    mappedResources.ok,
    false,
    `polynet_workspace_resources_map returned failure: ${JSON.stringify(mappedResources)}`,
  );

  const resourceQuery = readEnv("POLYNET_MCP_RESOURCE_QUERY") ?? "platform";
  const search = await callTool({
    mcpUrl: args.mcpUrl,
    token: args.token,
    name: "polynet_workspace_resources_search",
    toolArgs: {
      workspace_context_id: args.workspaceContextId,
      query: resourceQuery,
      limit: 5,
    },
  });
  const searchedResources = asRecord(search.resources);
  assert.notEqual(
    searchedResources.ok,
    false,
    `polynet_workspace_resources_search returned failure: ${JSON.stringify(searchedResources)}`,
  );

  const resourceRef = firstResourceRef(listedResources) ?? firstResourceRef(searchedResources);
  let readStatus: "ok" | "skipped_no_resource" = "skipped_no_resource";
  if (resourceRef) {
    const read = await callTool({
      mcpUrl: args.mcpUrl,
      token: args.token,
      name: "polynet_workspace_resource_read",
      toolArgs: {
        workspace_context_id: args.workspaceContextId,
        ref: resourceRef,
        limit: 1000,
      },
    });
    const readResource = asRecord(read.resource);
    assert.notEqual(
      readResource.ok,
      false,
      `polynet_workspace_resource_read returned failure: ${JSON.stringify(readResource)}`,
    );
    readStatus = "ok";
  } else if (args.requireResources) {
    throw new Error("POLYNET_MCP_REQUIRE_RESOURCES requires at least one readable workspace resource.");
  }

  return {
    resource_map: "ok",
    resource_list: "ok",
    resource_search: "ok",
    resource_read: readStatus,
    resource_found: Boolean(resourceRef),
    resource_query: resourceQuery,
    resource_map_scope: asString(mappedResources.scope),
    mapped_resource_count: numericField(mappedResources, "returned_resources"),
    listed_entry_count: arrayLengthField(listedResources, "entries"),
    search_match_count: arrayLengthField(searchedResources, "matches"),
  };
}

async function runProductDocsSmoke(args: {
  mcpUrl: string;
  token: string;
}): Promise<Record<string, unknown>> {
  const productDocsSearch = await callTool({
    mcpUrl: args.mcpUrl,
    token: args.token,
    name: "polynet_product_docs_search",
    toolArgs: {
      query: "community workspace context",
      limit: 3,
    },
  });
  const productDocs = asRecord(productDocsSearch.product_docs);
  assert.equal(productDocs.ok, true, `polynet_product_docs_search failed: ${JSON.stringify(productDocs)}`);
  const slug = firstProductDocSlug(productDocs);
  let readStatus: "ok" | "skipped_no_product_doc" = "skipped_no_product_doc";
  if (slug) {
    const productDocRead = await callTool({
      mcpUrl: args.mcpUrl,
      token: args.token,
      name: "polynet_product_doc_read",
      toolArgs: { slug },
    });
    const productDoc = asRecord(productDocRead.product_doc);
    assert.equal(productDoc.ok, true, `polynet_product_doc_read failed: ${JSON.stringify(productDoc)}`);
    readStatus = "ok";
  }
  return {
    product_docs_search: "ok",
    product_doc_read: readStatus,
    product_doc_found: Boolean(slug),
    product_doc_result_count: numericField(productDocs, "result_count"),
  };
}

async function runBuilderResourceSmoke(args: {
  mcpUrl: string;
  token: string;
  workspaceContextId: string;
  availableToolsets: string[];
  requireBuilderResources: boolean;
}): Promise<Record<string, unknown>> {
  if (!args.availableToolsets.includes("builder_resources")) {
    if (args.requireBuilderResources) {
      throw new Error("POLYNET_MCP_REQUIRE_BUILDER_RESOURCES requires the builder_resources toolset.");
    }
    return {
      builder_resource_map: "skipped_builder_resources_unavailable",
      builder_resource_list: "skipped_builder_resources_unavailable",
      builder_resource_read: "skipped_builder_resources_unavailable",
      builder_resource_scope: null,
      builder_resource_total_resources: null,
      builder_resource_module_count: null,
      builder_resource_returned_resources: null,
      builder_resource_found: false,
    };
  }

  const map = await callTool({
    mcpUrl: args.mcpUrl,
    token: args.token,
    name: "polynet_workspace_builder_resources_map",
    toolArgs: {
      workspace_context_id: args.workspaceContextId,
      limit: 50,
      per_module_limit: 10,
    },
  });
  const resources = asRecord(map.resources);
  assert.notEqual(
    resources.ok,
    false,
    `polynet_workspace_builder_resources_map returned failure: ${JSON.stringify(resources)}`,
  );
  assert.equal(
    asString(resources.scope),
    "builder",
    `polynet_workspace_builder_resources_map should return builder scope: ${JSON.stringify(resources)}`,
  );

  const list = await callTool({
    mcpUrl: args.mcpUrl,
    token: args.token,
    name: "polynet_workspace_builder_resources_list",
    toolArgs: {
      workspace_context_id: args.workspaceContextId,
      limit: 25,
    },
  });
  const listedResources = asRecord(list.resources);
  assert.notEqual(
    listedResources.ok,
    false,
    `polynet_workspace_builder_resources_list returned failure: ${JSON.stringify(listedResources)}`,
  );

  const resourceRef = firstResourceRef(listedResources) ?? firstResourceRef(resources);
  let readStatus: "ok" | "skipped_no_resource" = "skipped_no_resource";
  if (resourceRef) {
    const read = await callTool({
      mcpUrl: args.mcpUrl,
      token: args.token,
      name: "polynet_workspace_builder_resource_read",
      toolArgs: {
        workspace_context_id: args.workspaceContextId,
        ref: resourceRef,
      },
    });
    const resource = asRecord(read.resource);
    assert.notEqual(
      resource.ok,
      false,
      `polynet_workspace_builder_resource_read returned failure: ${JSON.stringify(resource)}`,
    );
    readStatus = "ok";
  } else if (args.requireBuilderResources) {
    throw new Error("POLYNET_MCP_REQUIRE_BUILDER_RESOURCES requires at least one readable builder resource.");
  }

  return {
    builder_resource_map: "ok",
    builder_resource_list: "ok",
    builder_resource_read: readStatus,
    builder_resource_scope: asString(resources.scope),
    builder_resource_total_resources: numericField(resources, "total_resources"),
    builder_resource_module_count: numericField(resources, "total_modules"),
    builder_resource_returned_resources: numericField(resources, "returned_resources"),
    builder_resource_found: Boolean(resourceRef),
  };
}

async function runAuthenticatedSmoke(args: {
  mcpUrl: string;
  requireMemoryRead: boolean;
  requireResources: boolean;
  requireBuilderResources: boolean;
}): Promise<Record<string, unknown>> {
  const token = readEnv("POLYNET_MCP_BEARER_TOKEN");
  if (!token) {
    throw new Error("POLYNET_MCP_BEARER_TOKEN is required for authenticated smoke.");
  }

  const toolsListResponse = await postJsonRpc({
    mcpUrl: args.mcpUrl,
    token,
    method: "tools/list",
  });
  const toolsList = assertJsonRpcResult(toolsListResponse, "authenticated tools/list");
  const toolNames = toolNamesFromToolsList(toolsList);
  for (const providerTool of PROVIDER_TOOLS) {
    assert.ok(toolNames.includes(providerTool), `tools/list should advertise ${providerTool}.`);
  }

  const list = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_list_workspaces",
  });
  const workspaces = asArray(list.workspaces).map(optionalRecord).filter(Boolean);
  assert.ok(workspaces.length > 0, "authenticated user should have at least one accessible workspace.");

  const requestedSlug = readEnv("POLYNET_MCP_COMMUNITY_SLUG");
  const workspace =
    (requestedSlug
      ? workspaces.find((item) => asString(item?.slug) === requestedSlug)
      : workspaces[0]) ?? null;
  assert.ok(
    workspace,
    requestedSlug
      ? `authenticated user cannot access requested workspace slug: ${requestedSlug}`
      : "no accessible workspace found.",
  );
  const slug = asString(workspace.slug);
  assert.ok(slug, "selected workspace should include a slug.");

  const opened = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_open_workspace",
    toolArgs: {
      community_slug: slug,
    },
  });
  const openedWorkspace = asRecord(opened.workspace);
  const workspaceContextId = asString(openedWorkspace.workspace_context_id);
  assert.ok(workspaceContextId, "polynet_open_workspace should return workspace_context_id.");
  const openedAuthority = assertWorkspaceAuthority(openedWorkspace, "polynet_open_workspace");

  const context = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_get_workspace_context",
    toolArgs: {
      workspace_context_id: workspaceContextId,
    },
  });
  const contextWorkspace = asRecord(context.workspace);
  const contextAuthority = assertWorkspaceAuthority(contextWorkspace, "polynet_get_workspace_context");
  assertMatchingAuthority(openedAuthority, contextAuthority);

  const productDocsSmoke = await runProductDocsSmoke({
    mcpUrl: args.mcpUrl,
    token,
  });

  const query = readEnv("POLYNET_MCP_MEMORY_QUERY") ?? "strategy";
  const search = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_workspace_memory_search",
    toolArgs: {
      workspace_context_id: workspaceContextId,
      query,
      limit: 3,
    },
  });
  const searchMemory = asRecord(search.memory);
  const searchRetrievalLogId =
    readEnv("POLYNET_MCP_RETRIEVAL_LOG_ID") ?? firstRetrievalLogId(searchMemory);
  let retrievalLogId = searchRetrievalLogId;
  const nodeId = readEnv("POLYNET_MCP_MEMORY_NODE_ID") ?? firstNodeId(searchMemory);

  let readStatus: "ok" | "skipped_basic_mode" | "skipped_no_memory" = "skipped_basic_mode";
  if (args.requireMemoryRead && nodeId) {
    const readArgs: Record<string, unknown> = {
      workspace_context_id: workspaceContextId,
      node_id: nodeId,
    };
    if (retrievalLogId) readArgs.retrieval_log_id = retrievalLogId;
    const read = await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_workspace_memory_read",
      toolArgs: readArgs,
    });
    const readMemory = asRecord(read.memory);
    retrievalLogId = retrievalLogId ?? firstRetrievalLogId(readMemory);
    readStatus = "ok";
  } else if (args.requireMemoryRead) {
    throw new Error("Acceptance smoke requires a readable memory node from search or POLYNET_MCP_MEMORY_NODE_ID.");
  } else if (!nodeId) {
    readStatus = "skipped_no_memory";
  }

  const resourceSmoke = await runResourceSmoke({
    mcpUrl: args.mcpUrl,
    token,
    workspaceContextId,
    availableToolsets: openedAuthority.available_toolsets,
    requireResources: args.requireResources,
  });

  const builderResourceSmoke = await runBuilderResourceSmoke({
    mcpUrl: args.mcpUrl,
    token,
    workspaceContextId,
    availableToolsets: openedAuthority.available_toolsets,
    requireBuilderResources: args.requireBuilderResources,
  });

  let outcomeStatus: "ok" | "skipped_opt_in_disabled" = "skipped_opt_in_disabled";
  if (readBoolEnv("POLYNET_MCP_RECORD_OUTCOME")) {
    assert.ok(
      retrievalLogId,
      "POLYNET_MCP_RECORD_OUTCOME requires a retrieval log id from search/read or POLYNET_MCP_RETRIEVAL_LOG_ID.",
    );
    const outcomeArgs: Record<string, unknown> = {
      workspace_context_id: workspaceContextId,
      retrieval_log_id: retrievalLogId,
      result_status: "mixed",
      notes: "external MCP smoke observed authenticated workspace memory retrieval path",
    };
    if (nodeId) outcomeArgs.node_id = nodeId;
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_workspace_record_outcome",
      toolArgs: outcomeArgs,
    });
    outcomeStatus = "ok";
  }

  return {
    tools_list: "ok",
    advertised_tool_count: toolNames.length,
    list_workspaces: "ok",
    open_workspace: "ok",
    get_workspace_context: "ok",
    ...productDocsSmoke,
    memory_search: "ok",
    memory_read: readStatus,
    ...resourceSmoke,
    ...builderResourceSmoke,
    record_outcome: outcomeStatus,
    selected_workspace_slug: slug,
    workspace_context_id: workspaceContextId,
    authority_relation: openedAuthority.relation,
    authority_lens: openedAuthority.authority_lens,
    available_toolsets: openedAuthority.available_toolsets,
    memory_node_found: Boolean(nodeId),
    retrieval_log_found: Boolean(retrievalLogId),
  };
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
  }
  const mode = readMode();
  const mcpUrl = normalizeMcpUrl(argValue("--url") ?? readEnv("POLYNET_MCP_URL"));
  const metadata = await runMetadataSmoke(mcpUrl);
  const authenticated =
    mode === "authenticated" || mode === "acceptance"
      ? await runAuthenticatedSmoke({
          mcpUrl,
          requireMemoryRead: mode === "acceptance" || readBoolEnv("POLYNET_MCP_REQUIRE_MEMORY"),
          requireResources: readBoolEnv("POLYNET_MCP_REQUIRE_RESOURCES"),
          requireBuilderResources: readBoolEnv("POLYNET_MCP_REQUIRE_BUILDER_RESOURCES"),
        })
      : null;
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        mcp_url: mcpUrl,
        metadata,
        ...(authenticated ? { authenticated } : null),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`polynet_workspace_mcp_external_smoke: failed: ${message}`);
  process.exit(1);
});
