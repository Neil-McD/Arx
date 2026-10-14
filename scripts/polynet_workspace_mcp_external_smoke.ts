import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertContextFlags, contextFingerprint, createContextBaseline, runContextAcceptance, runContextRevocation, validateContextBaseline, validateContextFixture, type ContextFixture, type ContextRequest } from "./polynet_mcp_context_acceptance.ts";
import {
  POLYNET_MCP_PROTOCOL_VERSION,
  getPolynetMcpToolDefinitions,
} from "../shared/polynetMcp.ts";

type SmokeMode = "metadata" | "authenticated" | "acceptance" | "context" | "context-revoked";
type ExpectedAuthorityLane = "member" | "builder";
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

function requiredEnv(name: string, message: string): string {
  const value = readEnv(name);
  if (!value) throw new Error(message);
  return value;
}

function readExpectedAuthorityLane(
  required: boolean,
): ExpectedAuthorityLane | null {
  const value = readEnv("POLYNET_MCP_EXPECT_AUTHORITY_LANE");
  if (!value) {
    if (required) {
      throw new Error(
        "Acceptance requires POLYNET_MCP_EXPECT_AUTHORITY_LANE=member or builder.",
      );
    }
    return null;
  }
  if (value !== "member" && value !== "builder") {
    throw new Error(
      "POLYNET_MCP_EXPECT_AUTHORITY_LANE must be member or builder.",
    );
  }
  return value;
}

function readAcceptanceRunId(required: boolean): string | null {
  const value = readEnv("POLYNET_MCP_ACCEPTANCE_RUN_ID");
  if (!value) {
    if (required) {
      throw new Error(
        "Acceptance requires POLYNET_MCP_ACCEPTANCE_RUN_ID set to the exact candidate SHA.",
      );
    }
    return null;
  }
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(
      "POLYNET_MCP_ACCEPTANCE_RUN_ID must be the exact 40-character lowercase candidate SHA.",
    );
  }
  return value;
}

function acceptanceKey(args: {
  runId: string;
  lane: ExpectedAuthorityLane;
  purpose: string;
}): string {
  return `stage-mcp-${args.runId}-${args.lane}-${args.purpose}`;
}

function readMode(): SmokeMode {
  const value =
    argValue("--mode") ?? readEnv("POLYNET_MCP_SMOKE_MODE") ?? "metadata";
  if (
    value === "metadata" ||
    value === "authenticated" ||
    value === "acceptance" || value === "context" || value === "context-revoked"
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
      ...(args.token ? { authorization: `Bearer ${args.token}` } : {}),
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
  expectedErrorCode?: string;
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
    Boolean(args.expectedErrorCode),
    `${args.name} returned unexpected error state: ${JSON.stringify(result)}`,
  );
  const structuredContent = asRecord(result.structuredContent);
  if (args.expectedErrorCode) {
    const error = asString(structuredContent.error);
    assert.ok(error, `${args.name} must return one structured error message.`);
    assert.ok(
      error === args.expectedErrorCode ||
        error.startsWith(`${args.expectedErrorCode}:`),
      `${args.name} expected ${args.expectedErrorCode}, received ${error}`,
    );
  }
  return structuredContent;
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
  assert.equal(
    response.status,
    401,
    "Unauthenticated MCP request must return 401.",
  );
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
  const controlToken = args.acceptance
    ? requiredEnv(
        "POLYNET_MCP_CONTROL_BEARER_TOKEN",
        "Acceptance requires POLYNET_MCP_CONTROL_BEARER_TOKEN for an independent control identity.",
      )
    : null;
  if (controlToken) {
    assert.notEqual(
      controlToken,
      token,
      "Acceptance actor and control identities must use different bearer tokens.",
    );
  }
  const requestedSlug = args.acceptance
    ? requiredEnv(
        "POLYNET_MCP_COMMUNITY_SLUG",
        "Acceptance requires POLYNET_MCP_COMMUNITY_SLUG.",
      )
    : readEnv("POLYNET_MCP_COMMUNITY_SLUG");
  const deniedSlug = args.acceptance
    ? requiredEnv(
        "POLYNET_MCP_DENIED_COMMUNITY_SLUG",
        "Acceptance requires POLYNET_MCP_DENIED_COMMUNITY_SLUG for a control-proven real community.",
      )
    : readEnv("POLYNET_MCP_DENIED_COMMUNITY_SLUG");
  const expectedAuthorityLane = readExpectedAuthorityLane(args.acceptance);
  const mutationRequested =
    args.acceptance ||
    readBoolEnv("POLYNET_MCP_WRITE_CHAT") ||
    readBoolEnv("POLYNET_MCP_EXERCISE_BUILDER");
  const acceptanceRunId = readAcceptanceRunId(mutationRequested);
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

  let communities = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_list",
    toolArgs: { path: "/communities/", limit: 50 },
  });
  const accessibleCommunities = entries(communities);
  const seenCommunityCursors = new Set<string>();
  let nextCommunityCursor = asString(communities.next_cursor);
  while (nextCommunityCursor) {
    assert.equal(
      seenCommunityCursors.has(nextCommunityCursor),
      false,
      "Community pagination cursor must advance.",
    );
    seenCommunityCursors.add(nextCommunityCursor);
    communities = await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_list",
      toolArgs: {
        path: "/communities/",
        limit: 50,
        cursor: nextCommunityCursor,
      },
    });
    accessibleCommunities.push(...entries(communities));
    nextCommunityCursor = asString(communities.next_cursor);
  }
  const requestedPath = requestedSlug ? `/communities/${requestedSlug}/` : null;
  if (requestedPath) {
    assert.ok(
      accessibleCommunities.some((row) => row.path === requestedPath),
      `Requested community ${requestedPath} is not accessible; refusing to substitute another community.`,
    );
  }
  const communityPath =
    requestedPath ??
    firstPath(
      { entries: accessibleCommunities },
      (path, row) => row.type === "community" && path.endsWith("/"),
    );
  assert.ok(
    communityPath,
    "Authenticated actor needs one accessible community.",
  );
  const slug = communityPath.split("/").filter(Boolean).at(-1)!;

  const community = await callTool({
    mcpUrl: args.mcpUrl,
    token,
    name: "polynet_list",
    toolArgs: { path: communityPath },
  });
  const authority = asRecord(community.authority);
  assert.ok(["member", "builder"].includes(String(authority.lane)));
  assert.ok(
    ["owner", "admin", "moderator", "member"].includes(
      String(authority.relation),
    ),
  );
  if (expectedAuthorityLane) {
    assert.equal(
      authority.lane,
      expectedAuthorityLane,
      `Expected ${expectedAuthorityLane} authority for ${communityPath}.`,
    );
  }
  for (const directory of [
    "resources/",
    "channels/",
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
    entries(community).some((row) => row.path === `${communityPath}ai-feed/`),
    false,
    "Retired AI Feed directory must not be projected.",
  );
  assert.equal(
    entries(community).some((row) => String(row.path).includes("/builder/")),
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

  if (deniedSlug) {
    assert.notEqual(deniedSlug, slug);
    if (args.acceptance) {
      assert.ok(controlToken);
      const controlTools = jsonRpcResult(
        await postJsonRpc({
          mcpUrl: args.mcpUrl,
          token: controlToken,
          method: "tools/list",
        }),
        "control tools/list",
      );
      const controlNames = asArray(controlTools.tools)
        .map((tool) => asString(asRecord(tool).name))
        .filter((name): name is string => Boolean(name));
      assert.deepEqual(
        controlNames,
        CANONICAL_TOOLS,
        "Control identity must discover the canonical five tools.",
      );
      const controlCommunity = await callTool({
        mcpUrl: args.mcpUrl,
        token: controlToken,
        name: "polynet_list",
        toolArgs: { path: `/communities/${deniedSlug}/` },
      });
      const controlAuthority = asRecord(controlCommunity.authority);
      assert.ok(
        ["member", "builder"].includes(String(controlAuthority.lane)),
        "Control identity must prove authorized access to the denied community.",
      );
    }
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_list",
      toolArgs: { path: `/communities/${deniedSlug}/` },
      expectedErrorCode: "semantic_not_found",
    });
  }

  let memberBuilderDenials: Record<string, unknown> | null = null;
  if (args.acceptance && authority.lane === "member") {
    assert.ok(acceptanceRunId);
    const builderRoot = `${communityPath}builder/`;
    const builderResources = `${builderRoot}resources/`;
    const builderReject = `${communityPath}capabilities/community.resources.changeset.reject.json`;
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_list",
      toolArgs: { path: builderRoot },
      expectedErrorCode: "semantic_not_found",
    });
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_write",
      toolArgs: {
        path: builderResources,
        mode: "create",
        content: {
          summary: "This member-authority changeset must be denied.",
          operations: [
            {
              op: "create_module",
              module_key: `denied-${acceptanceRunId}`,
              name: "Denied member acceptance module",
              module_status: "draft",
            },
          ],
        },
        idempotency_key: acceptanceKey({
          runId: acceptanceRunId,
          lane: "member",
          purpose: "builder-write-denied",
        }),
      },
      expectedErrorCode: "builder_authority_required",
    });
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_call",
      toolArgs: {
        operation: "community.resources.changeset.reject",
        version: 1,
        target: builderReject,
        input: { changeset_id: `denied-${acceptanceRunId}` },
        idempotency_key: acceptanceKey({
          runId: acceptanceRunId,
          lane: "member",
          purpose: "builder-call-denied",
        }),
      },
      expectedErrorCode: "operation_not_found",
    });
    memberBuilderDenials = {
      list: "semantic_not_found",
      write: "builder_authority_required",
      call: "operation_not_found",
    };
  }

  let participation: Record<string, unknown> | null = null;
  let retiredAiFeedDenials: Record<string, unknown> | null = null;
  if (args.acceptance) {
    assert.ok(acceptanceRunId);
    const retiredAiFeedPath = `${communityPath}ai-feed/`;
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_list",
      toolArgs: { path: retiredAiFeedPath },
      expectedErrorCode: "semantic_not_found",
    });
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_read",
      toolArgs: { path: retiredAiFeedPath },
      expectedErrorCode: "semantic_not_found",
    });
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_write",
      toolArgs: {
        path: retiredAiFeedPath,
        mode: "create",
        content: { text: "Retired AI Feed writes must remain impossible." },
        idempotency_key: acceptanceKey({
          runId: acceptanceRunId,
          lane: authority.lane as ExpectedAuthorityLane,
          purpose: "retired-ai-feed-write-denied",
        }),
      },
      expectedErrorCode: "semantic_not_found",
    });
    retiredAiFeedDenials = {
      projected: false,
      list: "semantic_not_found",
      read: "semantic_not_found",
      write: "semantic_not_found",
    };
  }
  if (args.acceptance || readBoolEnv("POLYNET_MCP_WRITE_CHAT")) {
    assert.ok(acceptanceRunId);
    const lane = authority.lane as ExpectedAuthorityLane;
    const idempotencyKey = acceptanceKey({
      runId: acceptanceRunId,
      lane,
      purpose: "chat",
    });
    const chatText =
      "Stage acceptance: the official Polynet MCP used the canonical five-tool harness to inspect this community and publish this bounded verification post.";
    const writeInput = {
      path: `${communityPath}channels/general/`,
      mode: "create",
      content: {
        text: chatText,
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
    assert.equal(
      retried.deduped,
      true,
      "Retry must reuse the canonical receipt.",
    );
    const writtenPath = asString(written.path);
    assert.ok(writtenPath, "Participation write must return a readable path.");
    const readChat = await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_read",
      toolArgs: { path: writtenPath },
    });
    assert.ok(
      String(readChat.body ?? "").includes(chatText),
      "Chat read-back must contain the acceptance post.",
    );

    participation = {
      chat: {
        write: "ok",
        retry_deduped: "ok",
        read_after_write: "ok",
        path: writtenPath,
      },
    };
  }

  let builder: Record<string, unknown> | null = null;
  if (
    authority.lane === "builder" &&
    readBoolEnv("POLYNET_MCP_EXERCISE_BUILDER")
  ) {
    assert.ok(acceptanceRunId);
    const id = acceptanceRunId;
    const staged = await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_write",
      toolArgs: {
        path: `${communityPath}builder/resources/`,
        mode: "create",
        content: {
          summary: "Stage an explicit builder-exercise changeset for product review.",
          operations: [
            {
              op: "create_module",
              module_key: `stage-acceptance-${id}`,
              name: `Stage acceptance ${id}`,
              module_status: "draft",
            },
          ],
        },
        idempotency_key: acceptanceKey({
          runId: id,
          lane: "builder",
          purpose: "builder-write",
        }),
      },
    });
    const changesetId = asString(staged.ref);
    assert.ok(changesetId);
    const rejectPath = `${communityPath}capabilities/community.resources.changeset.reject.json`;
    await callTool({
      mcpUrl: args.mcpUrl,
      token,
      name: "polynet_call",
      toolArgs: {
        operation: "community.resources.changeset.reject",
        version: 1,
        target: rejectPath,
        input: {
          changeset_id: changesetId,
        },
        idempotency_key: acceptanceKey({
          runId: id,
          lane: "builder",
          purpose: "builder-reject-denied",
        }),
      },
      expectedErrorCode: "operation_not_found",
    });
    builder = {
      stage: "ok",
      status: "product_query_required",
      terminal_agent_call: "operation_not_found",
      pending_product_review: "required",
    };
  }

  return {
    tools_list: "exact_canonical_five",
    advertised_tool_count: names.length,
    repository_root: "ok",
    selected_community_slug: slug,
    ...(acceptanceRunId ? { acceptance_run_id: acceptanceRunId } : {}),
    authority,
    resource_read: resourceDocumentPath ? "ok" : "skipped_no_resource",
    search_result_count: results(searched).length,
    search_read: searchedDocumentPath ? "ok" : "skipped_no_result_path",
    ...(deniedSlug
      ? {
          inaccessible_community_fail_closed: "semantic_not_found",
          denied_community_slug: deniedSlug,
          control_read: args.acceptance ? "ok" : "not_requested",
        }
      : {}),
    ...(memberBuilderDenials
      ? { member_builder_denials: memberBuilderDenials }
      : {}),
    ...(participation ? { participation } : {}),
    ...(retiredAiFeedDenials ? { retired_ai_feed: retiredAiFeedDenials } : {}),
    ...(builder ? { builder } : {}),
  };
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Polynet canonical MCP smoke

Required:
  --url or POLYNET_MCP_URL
  POLYNET_MCP_BEARER_TOKEN for authenticated/acceptance

Required for acceptance:
  POLYNET_MCP_CONTROL_BEARER_TOKEN (a different control identity)
  POLYNET_MCP_COMMUNITY_SLUG
  POLYNET_MCP_DENIED_COMMUNITY_SLUG (a real community proven by a control actor)
  POLYNET_MCP_EXPECT_AUTHORITY_LANE=member|builder
  POLYNET_MCP_ACCEPTANCE_RUN_ID (exact 40-character lowercase candidate SHA)

Optional:
  POLYNET_MCP_RECENT_QUERY
  POLYNET_MCP_REQUIRE_RECENT_ACTIVITY=1
  POLYNET_MCP_WRITE_CHAT=1
  POLYNET_MCP_EXERCISE_BUILDER=1
  POLYNET_MCP_TIMEOUT_MS

Bounded staging context modes: --mode=context or --mode=context-revoked
  POLYNET_MCP_BEARER_TOKEN (member) and POLYNET_MCP_CONTROL_BEARER_TOKEN (builder)
  POLYNET_MCP_COMMUNITY_SLUG and POLYNET_MCP_DENIED_COMMUNITY_SLUG
  POLYNET_MCP_PUBLIC_DOCUMENT_PATH and POLYNET_MCP_PRIVATE_DOCUMENT_PATH
  POLYNET_MCP_PUBLIC_CANARY and POLYNET_MCP_PRIVATE_CANARY
  POLYNET_MCP_ACCEPTANCE_RUN_ID (deployed runtime SHA, distinct from harness revision)
  POLYNET_MCP_CONTEXT_BASELINE_FILE (required for context-revoked; successful context JSON)
Save context stdout as the positive baseline. Revocation requires the same fixture,
runtime, canonical users and unchanged member bearer; no credentials are emitted.
These modes forbid content-write switches and invoke only list/read/search.
Membership revocation is a separate, explicitly scoped fixture operation.
`);
    return;
  }
  const mode = readMode();
  const mcpUrl = normalizeMcpUrl(
    argValue("--url") ?? readEnv("POLYNET_MCP_URL"),
  );
  if (mode === "context" || mode === "context-revoked") {
    assertContextFlags(process.env);
    assert.equal(mcpUrl, "https://polynet-staging.vercel.app/runtime/mcp", "context acceptance is pinned to staging");
    const memberToken = requiredEnv("POLYNET_MCP_BEARER_TOKEN", "Member bearer is required.");
    const builderToken = requiredEnv("POLYNET_MCP_CONTROL_BEARER_TOKEN", "Builder control bearer is required.");
    assert.ok(memberToken !== builderToken, "Context identities must use separate credentials.");
    const fixture: ContextFixture = {
      communitySlug: requiredEnv("POLYNET_MCP_COMMUNITY_SLUG", "Fixture community is required."),
      deniedCommunitySlug: requiredEnv("POLYNET_MCP_DENIED_COMMUNITY_SLUG", "Control-only community is required."),
      publicDocumentPath: requiredEnv("POLYNET_MCP_PUBLIC_DOCUMENT_PATH", "Published fixture document is required."),
      privateDocumentPath: requiredEnv("POLYNET_MCP_PRIVATE_DOCUMENT_PATH", "Private fixture document is required."),
      publicCanary: requiredEnv("POLYNET_MCP_PUBLIC_CANARY", "Public canary is required."),
      privateCanary: requiredEnv("POLYNET_MCP_PRIVATE_CANARY", "Private canary is required."),
    };
    validateContextFixture(fixture);
    const runtimeSha = readAcceptanceRunId(true)!;
    const memberBearerSha256 = contextFingerprint(memberToken);
    let baseline: unknown;
    if (mode === "context-revoked") {
      const path = requiredEnv("POLYNET_MCP_CONTEXT_BASELINE_FILE", "Revocation requires POLYNET_MCP_CONTEXT_BASELINE_FILE from a successful positive run.");
      try { baseline = JSON.parse(readFileSync(path, "utf8")); }
      catch { throw new Error("Positive baseline file must be readable valid JSON."); }
      validateContextBaseline(baseline, { fixture, runtimeSha, memberBearerSha256 });
    }
    const version = await fetchJson("https://polynet-staging.vercel.app/version.json");
    assert.equal(version.status, 200, "Staging version must be available.");
    assert.equal(asRecord(version.body).buildId, runtimeSha, "Deployed runtime must match the acceptance baseline.");
    const metadata = await runMetadataSmoke(mcpUrl);
    for (const token of [memberToken, builderToken]) {
      const response = await postJsonRpc({ mcpUrl, token, method: "tools/list" });
      assert.equal(response.status, 200, "Context bearer must be accepted by MCP.");
      const envelope = asRecord(response.body);
      assert.ok(!envelope.error, "Authenticated tool discovery must succeed.");
      const names = asArray(asRecord(envelope.result).tools).map(tool => asRecord(tool).name);
      assert.deepEqual(names, CANONICAL_TOOLS, "Context clients must discover the canonical five tools.");
    }
    const call = async (request: ContextRequest) => {
      const response = await postJsonRpc({ mcpUrl, token: request.actor === "member" ? memberToken : builderToken,
        method: "tools/call", params: { name: request.name, arguments: request.input } });
      assert.equal(response.status, 200, "Context tool transport must succeed.");
      const envelope = asRecord(response.body);
      assert.ok(!envelope.error, "Context request must have a valid JSON-RPC result.");
      const result = asRecord(envelope.result);
      const value = asRecord(result.structuredContent);
      assert.equal(result.isError === true, Boolean(request.expectedErrorCode), "Context tool authorization outcome must match its case.");
      if (request.expectedErrorCode) {
        const code = String(value.error ?? "").split(":")[0];
        assert.equal(code, request.expectedErrorCode, "Context denial must use its canonical error.");
        assert.ok(!value.body && !value.context && !value.results, "Denied context must not contain content.");
      }
      return value;
    };
    const proof = mode === "context"
      ? createContextBaseline({ fixture, runtimeSha, memberBearerSha256, contextCases: await runContextAcceptance(fixture, call) })
      : { ok: true, mode, runtime_sha: runtimeSha, fixture, member_bearer_sha256: memberBearerSha256,
          context_cases: await runContextRevocation(fixture, call, { baseline, runtimeSha, memberBearerSha256 }) };
    console.log(JSON.stringify({ ...proof, mcp_url: mcpUrl, metadata,
      effects: { operations: ["polynet_list", "polynet_read", "polynet_search"], content_writes: false, retrieval_receipts: "may_be_recorded" } }, null, 2));
    return;
  }
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
