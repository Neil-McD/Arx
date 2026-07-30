import assert from "node:assert/strict";
import {
  POLYNET_MCP_PROTOCOL_VERSION,
  getPolynetMcpToolDefinitions,
} from "../shared/polynetMcp.ts";

type SmokeMode = "metadata" | "authenticated" | "acceptance";
type HttpJsonResponse = {
  status: number;
  headers: Headers;
  body: unknown;
  text: string;
};

const CANONICAL_TOOLS = getPolynetMcpToolDefinitions().map(
  (definition) => definition.name,
);
let requestId = 1;

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === name) return process.argv[index + 1] ?? null;
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return null;
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolEnv(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(readEnv(name) ?? "").toLowerCase(),
  );
}

function readMode(): SmokeMode {
  const value =
    argValue("--mode") ?? readEnv("POLYNET_MCP_SMOKE_MODE") ?? "metadata";
  if (
    value === "metadata" ||
    value === "authenticated" ||
    value === "acceptance"
  ) {
    return value;
  }
  throw new Error(`Unsupported smoke mode: ${value}`);
}

function normalizeMcpUrl(raw: string | null): string {
  if (!raw) throw new Error("POLYNET_MCP_URL or --url is required.");
  const parsed = new URL(raw);
  if (parsed.pathname === "/" || !parsed.pathname) {
    parsed.pathname = "/runtime/mcp";
  }
  if (parsed.pathname.replace(/\/+$/, "") !== "/runtime/mcp") {
    throw new Error("The MCP URL must end in /runtime/mcp.");
  }
  parsed.pathname = "/runtime/mcp";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fetchJson(
  url: string,
  init: RequestInit = {},
): Promise<HttpJsonResponse> {
  const controller = new AbortController();
  const timeoutMs = Number(readEnv("POLYNET_MCP_TIMEOUT_MS") ?? "15000");
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? timeoutMs : 15_000,
  );
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json, text/event-stream",
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return {
      status: response.status,
      headers: response.headers,
      body,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function postJsonRpc(args: {
  mcpUrl: string;
  token?: string | null;
  method: string;
  params?: Record<string, unknown>;
}): Promise<HttpJsonResponse> {
  return await fetchJson(args.mcpUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(args.token
        ? { authorization: `Bearer ${args.token}` }
        : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId++,
      method: args.method,
      ...(args.params ? { params: args.params } : {}),
    }),
  });
}

function jsonRpcResult(
  response: HttpJsonResponse,
  label: string,
): Record<string, unknown> {
  assert.equal(
    response.status,
    200,
    `${label} returned HTTP ${response.status}: ${response.text}`,
  );
  const envelope = asRecord(response.body);
  assert.equal(
    envelope.error,
    undefined,
    `${label} returned JSON-RPC error: ${response.text}`,
  );
  return asRecord(envelope.result);
}

async function callTool(args: {
  mcpUrl: string;
  token: string;
  name: string;
  toolArgs?: Record<string, unknown>;
  expectError?: boolean;
}): Promise<Record<string, unknown>> {
  const result = jsonRpcResult(
    await postJsonRpc({
      mcpUrl: args.mcpUrl,
      token: args.token,
      method: "tools/call",
      params: {
        name: args.name,
        arguments: args.toolArgs ?? {},
      },
    }),
    `tools/call ${args.name}`,
  );
  assert.equal(
    result.isError === true,
    args.expectError === true,
    `${args.name} returned unexpected error state: ${JSON.stringify(result)}`,
  );
  return asRecord(result.structuredContent);
}

function entries(value: Record<string, unknown>): Record<string, unknown>[] {
  return asArray(value.entries).map(asRecord);
}

function results(value: Record<string, unknown>): Record<string, unknown>[] {
  return asArray(value.results).map(asRecord);
}

function firstPath(
  value: Record<string, unknown>,
  predicate: (path: string, row: Record<string, unknown>) => boolean,
): string | null {
  for (const row of [...entries(value), ...results(value)]) {
    const path = asString(row.path);
    if (path && predicate(path, row)) return path;
  }
  return null;
}

function challengeMetadataUrl(response: HttpJsonResponse): string {
  assert.equal(response.status, 401, "Unauthenticated MCP request must return 401.");
  const challenge = response.headers.get("www-authenticate") ?? "";
  assert.match(challenge, /^Bearer /, "OAuth Bearer challenge is required.");
  const match = /resource_metadata="([^"]+)"/.exec(challenge);
  assert.ok(match?.[1], "OAuth challenge must include resource_metadata.");
  return match[1];
}

async function runMetadataSmoke(mcpUrl: string) {
  const initialize = await postJsonRpc({
    mcpUrl,
    method: "initialize",
    params: {
      protocolVersion: POLYNET_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "polynet-stage-smoke", version: "1" },
    },
  });
  const metadataUrl = challengeMetadataUrl(initialize);
  challengeMetadataUrl(await postJsonRpc({ mcpUrl, method: "tools/list" }));
  challengeMetadataUrl(
    await postJsonRpc({
      mcpUrl,
      method: "tools/call",
      params: { name: "polynet_list", arguments: { path: "/" } },
    }),
  );
  const resourceMetadata = await fetchJson(metadataUrl);
  assert.equal(resourceMetadata.status, 200);
  const resource = asRecord(resourceMetadata.body);
  assert.equal(
    new URL(String(resource.resource)).toString(),
    new URL(mcpUrl).toString(),
  );
  assert.ok(asArray(resource.authorization_servers).length > 0);
  assert.ok(asArray(resource.bearer_methods_supported).includes("header"));
  return {
    oauth_challenge: "ok",
    protected_resource_metadata: "ok",
    resource_metadata_url: metadataUrl,
  };
}

async function runAuthenticatedSmoke(args: {
  mcpUrl: string;
  acceptance: boolean;
}) {
  const token = readEnv("POLYNET_MCP_BEARER_TOKEN");
  if (!token) {
    throw new Error("POLYNET_MCP_BEARER_TOKEN is required.");
  }
  const tools = jsonRpcResult(
    await postJsonRpc({
      mcpUrl: args.mcpUrl,
      token,
      method: "tools/list",
    }),
    "tools/list",
  );
  const names = asArray(tools.tools)
    .map((tool) => asString(asRecord(tool).name))
    .filter((name): name is string => Boolean(name));
  assert.deepEqual(
    names,
    CANONICAL_TOOLS,
    "Official MCP must advertise exactly the canonical five tools.",
  );

  const root = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_list",
    toolArgs: { path: "/" },
  });
  assert.ok(firstPath(root, (path) => path === "/communities/"));
  assert.ok(firstPath(root, (path) => path === "/users/"));

  const communities = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_list",
    toolArgs: { path: "/communities/" },
  });
  const requestedSlug = readEnv("POLYNET_MCP_COMMUNITY_SLUG");
  const requestedPath = requestedSlug
    ? `/communities/${requestedSlug}/`
    : null;
  const communityPath =
    (requestedPath &&
    entries(communities).some((row) => row.path === requestedPath)
      ? requestedPath
      : firstPath(
          communities,
          (path, row) => row.type === "community" && path.endsWith("/"),
        )) ?? null;
  assert.ok(communityPath, "Authenticated actor needs one accessible community.");
  const slug = communityPath.split("/").filter(Boolean).at(-1)!;

  const community = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_list",
    toolArgs: { path: communityPath },
  });
  const authority = asRecord(community.authority);
  assert.ok(["member", "builder"].includes(String(authority.lane)));
  assert.ok(["owner", "admin", "moderator", "member"].includes(String(authority.relation)));
  for (const directory of [
    "resources/",
    "channels/",
    "ai-feed/",
    "memory/",
    "capabilities/",
  ]) {
    assert.ok(
      entries(community).some(
        (row) => row.path === `${communityPath}${directory}`,
      ),
      `${communityPath} must expose ${directory}`,
    );
  }
  assert.equal(
    entries(community).some((row) =>
      String(row.path).includes("/builder/"),
    ),
    authority.lane === "builder",
    "Builder projection must match server-derived authority.",
  );

  const resourceRoot = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_list",
    toolArgs: { path: `${communityPath}resources/`, limit: 20 },
  });
  let resourceDocumentPath = firstPath(
    resourceRoot,
    (path, row) => row.kind === "document" || path.endsWith(".md"),
  );
  if (!resourceDocumentPath) {
    const firstModulePath = firstPath(
      resourceRoot,
      (path, row) => row.kind === "directory" && path.endsWith("/"),
    );
    if (firstModulePath) {
      const resourceModule = await callTool({
        mcpUrl: args.mcpUrl,
        token,
        name: "polynet_list",
        toolArgs: { path: firstModulePath, limit: 20 },
      });
      resourceDocumentPath = firstPath(
        resourceModule,
        (path, row) => row.kind === "document" || path.endsWith(".md"),
      );
    }
  }
  if (resourceDocumentPath) {
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_read",
      toolArgs: { path: resourceDocumentPath, limit: 2_000 },
    });
  } else if (args.acceptance) {
    throw new Error(
      "Acceptance requires one real community resource reachable through repository traversal.",
    );
  }

  const query = readEnv("POLYNET_MCP_RECENT_QUERY") ?? "community";
  const searched = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_search",
    toolArgs: { path: communityPath, query, limit: 10 },
  });
  if (args.acceptance || readBoolEnv("POLYNET_MCP_REQUIRE_RECENT_ACTIVITY")) {
    assert.ok(
      results(searched).length > 0,
      "Acceptance requires real searchable community evidence.",
    );
  }
  const searchedDocumentPath = firstPath(
    searched,
    (path) => path.endsWith(".md") || path.endsWith(".json"),
  );
  if (searchedDocumentPath) {
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_read",
      toolArgs: { path: searchedDocumentPath, limit: 2_000 },
    });
  } else if (args.acceptance) {
    throw new Error(
      "Acceptance requires search to return a follow-up document path.",
    );
  }

  const deniedSlug =
    readEnv("POLYNET_MCP_DENIED_COMMUNITY_SLUG") ??
    `inaccessible-${Date.now().toString(36)}`;
  assert.notEqual(deniedSlug, slug);
  await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_list",
    toolArgs: { path: `/communities/${deniedSlug}/` },
    expectError: true,
  });

  let participation: Record<string, unknown> | null = null;
  if (args.acceptance || readBoolEnv("POLYNET_MCP_WRITE_CHAT")) {
    const idempotencyKey = `stage-acceptance-${Date.now().toString(36)}`;
    const writeInput = {
      path: `${communityPath}channels/general/`,
      mode: "create",
      content: {
        text:
          "Stage acceptance: the official Polynet MCP used the canonical five-tool harness to inspect this community and publish this bounded verification post.",
      },
      idempotency_key: idempotencyKey,
    };
    const written = await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_write",
      toolArgs: writeInput,
    });
    const retried = await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_write",
      toolArgs: writeInput,
    });
    assert.equal(retried.deduped, true, "Retry must reuse the canonical receipt.");
    const writtenPath = asString(written.path);
    assert.ok(writtenPath, "Participation write must return a readable path.");
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_read",
      toolArgs: { path: writtenPath },
    });
    participation = {
      write: "ok",
      retry_deduped: "ok",
      read_after_write: "ok",
      path: writtenPath,
    };
  }

  let builder: Record<string, unknown> | null = null;
  if (
    authority.lane === "builder" &&
    (args.acceptance || readBoolEnv("POLYNET_MCP_EXERCISE_BUILDER"))
  ) {
    const id = Date.now().toString(36);
    const staged = await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_write",
      toolArgs: {
        path: `${communityPath}builder/resources/`,
        mode: "create",
        content: {
          summary: "Stage acceptance changeset; reject after proving call.",
          operations: [
            {
              op: "create_module",
              module_key: `stage-acceptance-${id}`,
              name: `Stage acceptance ${id}`,
              module_status: "draft",
            },
          ],
        },
        idempotency_key: `stage-builder-write-${id}`,
      },
    });
    const changesetId = asString(staged.ref);
    assert.ok(changesetId);
    const capabilities = await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_list",
      toolArgs: { path: `${communityPath}capabilities/` },
    });
    const rejectPath = `${communityPath}capabilities/community.resources.changeset.reject.json`;
    assert.ok(entries(capabilities).some((row) => row.path === rejectPath));
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_read",
      toolArgs: { path: rejectPath },
    });
    const rejectInput = {
      operation: "community.resources.changeset.reject",
      version: 1,
      target: rejectPath,
      input: {
        changeset_id: changesetId,
        reason: "Stage acceptance completed without applying the test changeset.",
      },
      idempotency_key: `stage-builder-reject-${id}`,
    };
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_call",
      toolArgs: rejectInput,
    });
    const retried = await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_call",
      toolArgs: rejectInput,
    });
    assert.equal(retried.deduped, true);
    builder = {
      stage: "ok",
      discovered_call: "ok",
      rejected_without_apply: "ok",
      retry_deduped: "ok",
    };
  }

  return {
    tools_list: "exact_canonical_five",
    advertised_tool_count: names.length,
    repository_root: "ok",
    selected_community_slug: slug,
    authority,
    resource_read: resourceDocumentPath ? "ok" : "skipped_no_resource",
    search_result_count: results(searched).length,
    search_read: searchedDocumentPath ? "ok" : "skipped_no_result_path",
    inaccessible_community_fail_closed: "ok",
    ...(participation ? { participation } : {}),
    ...(builder ? { builder } : {}),
  };
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Polynet canonical MCP smoke

Required:
  --url or POLYNET_MCP_URL
  POLYNET_MCP_BEARER_TOKEN for authenticated/acceptance

Optional:
  POLYNET_MCP_COMMUNITY_SLUG
  POLYNET_MCP_DENIED_COMMUNITY_SLUG
  POLYNET_MCP_RECENT_QUERY
  POLYNET_MCP_REQUIRE_RECENT_ACTIVITY=1
  POLYNET_MCP_WRITE_CHAT=1
  POLYNET_MCP_EXERCISE_BUILDER=1
  POLYNET_MCP_TIMEOUT_MS
`);
    return;
  }
  const mode = readMode();
  const mcpUrl = normalizeMcpUrl(
    argValue("--url") ?? readEnv("POLYNET_MCP_URL"),
  );
  const metadata = await runMetadataSmoke(mcpUrl);
  const authenticated =
    mode === "authenticated" || mode === "acceptance"
      ? await runAuthenticatedSmoke({
          mcpUrl,
          acceptance: mode === "acceptance",
        })
      : null;
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        mcp_url: mcpUrl,
        metadata,
        ...(authenticated ? { authenticated } : {}),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    `polynet_workspace_mcp_external_smoke: failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
