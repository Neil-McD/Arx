import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildEffectiveMcpApps } from "../shared/effectiveMcpApps.ts";
import { resolveDiscoverAppProjectedToolRisk } from "../shared/discoverCatalog.ts";
import type { HarnessMount } from "../shared/harnessMountTypes.ts";
import {
  buildMcpHarnessProjection,
  type McpHarnessRuntimeMountedTool,
} from "../shared/mcpHarnessProjection.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function mount(patch: Partial<HarnessMount> & {
  id: string;
  source_mount_id: string;
  scope: "user" | "community";
  live_status: "live" | "not_live";
}): HarnessMount {
  const appName = patch.app?.name ?? "Linear";
  const enabledTools = patch.enabled_tools ?? ["search_issues", "create_issue"];
  return {
    id: patch.id,
    source_mount_id: patch.source_mount_id,
    scope: patch.scope,
    owner_id: patch.owner_id ?? `${patch.scope}-owner`,
    added_by_user_id: patch.added_by_user_id ?? null,
    enabled: patch.enabled ?? true,
    enabled_tools: enabledTools,
    live_status: patch.live_status,
    not_live_reason:
      patch.not_live_reason ??
      (patch.live_status === "live" ? null : "needs_auth"),
    app: {
      catalog_app_id:
        patch.app?.catalog_app_id === undefined
          ? "linear"
          : patch.app.catalog_app_id,
      name: appName,
      slug: patch.app?.slug ?? appName.toLowerCase(),
      endpoint_url: patch.app?.endpoint_url ?? "https://mcp.linear.app/mcp",
      auth_type: patch.app?.auth_type ?? "bearer",
      status: patch.app?.status ?? "valid",
      setup_status: patch.app?.setup_status ?? null,
      setup_reason: patch.app?.setup_reason ?? null,
      mcp_registry_id: patch.app?.mcp_registry_id ?? null,
    },
    connection: {
      connection_status:
        patch.connection?.connection_status ??
        (patch.live_status === "live" ? "connected" : "disconnected"),
    },
    tools:
      patch.tools ??
      enabledTools.map((toolName) => ({
        tool_name: toolName,
        namespaced_tool_name: `linear__${toolName}`,
        description: `${appName} ${toolName}`,
        risk_level: toolName.startsWith("create") ? "write" : "read",
        enabled: true,
      })),
  };
}

const SEARCH_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string" },
  },
  required: ["query"],
  additionalProperties: false,
};

const CREATE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
  },
  required: ["title"],
  additionalProperties: false,
};

function runtimeTool(
  patch: Partial<McpHarnessRuntimeMountedTool> & {
    mount_id: string;
    runtime_tool_name: string;
    tool_name: string;
    namespaced_tool_name: string;
  },
): McpHarnessRuntimeMountedTool {
  return {
    scope: patch.scope ?? "user",
    mount_id: patch.mount_id,
    runtime_tool_name: patch.runtime_tool_name,
    developer_app_id: patch.developer_app_id ?? "dev-linear",
    catalog_app_id:
      patch.catalog_app_id === undefined ? "linear" : patch.catalog_app_id,
    app_name: patch.app_name ?? "Linear",
    endpoint_url: patch.endpoint_url ?? "https://mcp.linear.app/mcp",
    auth_type: patch.auth_type ?? "bearer",
    tool_name: patch.tool_name,
    namespaced_tool_name: patch.namespaced_tool_name,
    description: patch.description ?? `Run ${patch.tool_name}`,
    input_schema:
      patch.input_schema ??
      (patch.tool_name.startsWith("create") ? CREATE_SCHEMA : SEARCH_SCHEMA),
    risk_level:
      patch.risk_level ??
      (patch.tool_name.startsWith("create") ? "write" : "read"),
  };
}

function linearRuntimeTools() {
  return [
    runtimeTool({
      mount_id: "u-linear",
      runtime_tool_name: "me__linear__search_issues",
      tool_name: "search_issues",
      namespaced_tool_name: "linear__search_issues",
      input_schema: SEARCH_SCHEMA,
    }),
    runtimeTool({
      mount_id: "u-linear",
      runtime_tool_name: "me__linear__create_issue",
      tool_name: "create_issue",
      namespaced_tool_name: "linear__create_issue",
      input_schema: CREATE_SCHEMA,
    }),
  ];
}

function assertNoCredentialMaterial(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(
    serialized,
    /access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|password|bearer\s+[a-z0-9._~+/=-]{8,}/i,
  );
}

function proveContractAndPackageScript() {
  const contract = read("docs/mcp-harness-projection-contract-v0.md");
  const helper = read("shared/mcpHarnessProjection.ts");
  const packageJson = read("package.json");

  assert.match(
    contract,
    /One Polynet capability kernel projects into multiple harness adapters and UI surfaces/,
    "contract must state the one-capability-kernel invariant",
  );
  assert.match(
    contract,
    /Harness adapters and UI projections can read kernel facts/,
    "contract must keep adapters and UI projections downstream of the kernel",
  );
  assert.match(
    contract,
    /Runtime Tool Projection/,
    "contract must split setup projection from executable runtime projection",
  );
  assert.match(
    contract,
    /External MCP Provider Adapter/,
    "contract must name external MCP as a provider adapter, not a second system",
  );
  assert.match(
    contract,
    /Codex runtime must not install user third-party MCP servers directly/,
    "contract must forbid a separate Codex MCP config path",
  );
  assert.match(
    helper,
    /runtimeMountedTools/,
    "shared helper must accept canonical runtime-mounted tools",
  );
  assert.match(
    helper,
    /input_schema: params\.tool\.input_schema/,
    "callable projections must preserve runtime tool schemas",
  );
  assert.match(
    helper,
    /credential_boundary: "server_only"/,
    "Codex bridge specs must keep credential material server-side",
  );
  assert.match(
    packageJson,
    /"check:mcp-harness-projection-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/mcp_harness_projection_contract_proof\.ts"/,
    "package.json must expose the MCP harness projection proof",
  );

  console.log("PASS: MCP harness projection contract and script are registered");
}

function proveLivePersonalRuntimeToolsProjectToBothRuntimes() {
  const effectiveApps = buildEffectiveMcpApps([
    mount({
      id: "user:u-linear",
      source_mount_id: "u-linear",
      scope: "user",
      live_status: "live",
      enabled_tools: ["search_issues", "create_issue"],
    }),
  ]);
  const projection = buildMcpHarnessProjection({
    effectiveApps,
    runtimeMountedTools: linearRuntimeTools(),
  });

  assert.equal(projection.capabilities.length, 1);
  assert.deepEqual(
    projection.polynetMountedTools.map((tool) => tool.runtime_tool_name),
    ["me__linear__create_issue", "me__linear__search_issues"],
  );
  assert.deepEqual(
    projection.codexBridgeTools.map((tool) => tool.bridge_tool_name),
    ["polynet_mcp__linear__create_issue", "polynet_mcp__linear__search_issues"],
  );
  assert.deepEqual(
    projection.codexBridgeTools.map((tool) => tool.runtime_tool_name),
    ["me__linear__create_issue", "me__linear__search_issues"],
  );
  assert.deepEqual(projection.codexBridgeTools[1]?.input_schema, SEARCH_SCHEMA);
  assert.equal(projection.capabilities[0]?.polynet_tool_count, 2);
  assert.equal(projection.capabilities[0]?.codex_bridge_tool_count, 2);
  assert.equal(projection.setupPacketHints.length, 0);
  assert.equal(
    projection.codexBridgeTools[0]?.execution.mode,
    "polynet_runtime_mcp_manager",
  );
  assert.equal(
    projection.codexBridgeTools[0]?.execution.credential_boundary,
    "server_only",
  );
  assertNoCredentialMaterial(projection.codexBridgeTools);

  console.log("PASS: live personal runtime tools project to Polynet and Codex");
}

function proveCommunityAttachmentDoesNotDuplicateRuntimeTools() {
  const effectiveApps = buildEffectiveMcpApps([
    mount({
      id: "user:u-linear",
      source_mount_id: "u-linear",
      scope: "user",
      live_status: "live",
      enabled_tools: ["search_issues", "create_issue"],
    }),
    mount({
      id: "community:c-linear",
      source_mount_id: "c-linear",
      scope: "community",
      live_status: "not_live",
      not_live_reason: "needs_auth",
      enabled_tools: ["search_issues"],
    }),
  ]);
  const projection = buildMcpHarnessProjection({
    effectiveApps,
    runtimeMountedTools: [
      ...linearRuntimeTools(),
      runtimeTool({
        scope: "community",
        mount_id: "c-linear",
        runtime_tool_name: "community__linear__search_issues",
        tool_name: "search_issues",
        namespaced_tool_name: "linear__search_issues",
      }),
    ],
  });

  assert.equal(effectiveApps.length, 1);
  assert.equal(
    projection.capabilities[0]?.source_label,
    "personal_plus_community",
  );
  assert.deepEqual(
    projection.polynetMountedTools.map((tool) => tool.runtime_tool_name),
    ["me__linear__create_issue", "me__linear__search_issues"],
  );
  assert.deepEqual(
    projection.codexBridgeTools.map((tool) => tool.runtime_tool_name),
    ["me__linear__create_issue", "me__linear__search_issues"],
  );
  assert.equal(projection.setupPacketHints.length, 0);

  console.log("PASS: community attachment does not create a second runtime MCP copy");
}

function proveCommunityOnlyAttachmentIsSetupNeeded() {
  const effectiveApps = buildEffectiveMcpApps([
    mount({
      id: "community:c-linear",
      source_mount_id: "c-linear",
      scope: "community",
      live_status: "not_live",
      not_live_reason: "needs_auth",
      enabled_tools: ["search_issues"],
    }),
  ]);
  const projection = buildMcpHarnessProjection({
    effectiveApps,
    runtimeMountedTools: [
      runtimeTool({
        scope: "community",
        mount_id: "c-linear",
        runtime_tool_name: "community__linear__search_issues",
        tool_name: "search_issues",
        namespaced_tool_name: "linear__search_issues",
      }),
    ],
  });

  assert.equal(projection.polynetMountedTools.length, 0);
  assert.equal(projection.codexBridgeTools.length, 0);
  assert.equal(projection.setupPacketHints.length, 1);
  assert.equal(
    projection.setupPacketHints[0]?.setup_reason,
    "needs_personal_connection",
  );
  assert.equal(projection.setupPacketHints[0]?.source_label, "community");

  console.log("PASS: community-only MCP attachment remains setup-needed");
}

function proveDisabledToolsStayOutOfRuntimeProjections() {
  const effectiveApps = buildEffectiveMcpApps([
    mount({
      id: "user:u-linear",
      source_mount_id: "u-linear",
      scope: "user",
      live_status: "live",
      enabled_tools: ["search_issues"],
      tools: [
        {
          tool_name: "search_issues",
          namespaced_tool_name: "linear__search_issues",
          description: "Search issues",
          risk_level: "read",
          enabled: true,
        },
        {
          tool_name: "create_issue",
          namespaced_tool_name: "linear__create_issue",
          description: "Create issue",
          risk_level: "write",
          enabled: true,
        },
      ],
    }),
  ]);
  const projection = buildMcpHarnessProjection({
    effectiveApps,
    runtimeMountedTools: linearRuntimeTools(),
  });

  assert.deepEqual(
    projection.polynetMountedTools.map((tool) => tool.runtime_tool_name),
    ["me__linear__search_issues"],
  );
  assert.deepEqual(
    projection.codexBridgeTools.map((tool) => tool.runtime_tool_name),
    ["me__linear__search_issues"],
  );

  console.log("PASS: enabled tool policy is preserved in runtime projections");
}

function proveOnlyLiveAppsWithRuntimeToolsProject() {
  const effectiveApps = buildEffectiveMcpApps([
    mount({
      id: "user:u-airtable",
      source_mount_id: "u-airtable",
      scope: "user",
      live_status: "live",
      enabled_tools: ["list_records"],
      app: {
        catalog_app_id: "airtable",
        name: "Airtable",
        slug: "airtable",
        endpoint_url: "https://airtable.example.com/mcp",
        auth_type: "bearer",
        status: "valid",
      },
      tools: [
        {
          tool_name: "list_records",
          namespaced_tool_name: "airtable__list_records",
          description: "List Airtable records",
          risk_level: "read",
          enabled: true,
        },
      ],
    }),
    mount({
      id: "user:u-github",
      source_mount_id: "u-github",
      scope: "user",
      live_status: "live",
      enabled_tools: ["search_repositories"],
      app: {
        catalog_app_id: "github",
        name: "GitHub",
        slug: "github",
        endpoint_url: "https://github.example.com/mcp",
        auth_type: "bearer",
        status: "valid",
      },
      tools: [
        {
          tool_name: "search_repositories",
          namespaced_tool_name: "github__search_repositories",
          description: "Search repositories",
          risk_level: "read",
          enabled: true,
        },
      ],
    }),
    mount({
      id: "user:u-linear",
      source_mount_id: "u-linear",
      scope: "user",
      live_status: "live",
      enabled_tools: ["search_issues"],
    }),
    mount({
      id: "user:u-context7",
      source_mount_id: "u-context7",
      scope: "user",
      live_status: "live",
      enabled_tools: [],
      app: {
        catalog_app_id: "context7",
        name: "Context7",
        slug: "context7",
        endpoint_url: "https://context7.example.com/mcp",
        auth_type: "bearer",
        status: "valid",
      },
      tools: [],
    }),
    mount({
      id: "user:u-fly",
      source_mount_id: "u-fly",
      scope: "user",
      live_status: "not_live",
      enabled_tools: ["list_apps"],
      app: {
        catalog_app_id: "fly",
        name: "Fly",
        slug: "fly",
        endpoint_url: "https://fly.example.com/mcp",
        auth_type: "bearer",
        status: "valid",
      },
      tools: [
        {
          tool_name: "list_apps",
          namespaced_tool_name: "fly__list_apps",
          description: "List Fly apps",
          risk_level: "read",
          enabled: true,
        },
      ],
    }),
  ]);
  const projection = buildMcpHarnessProjection({
    effectiveApps,
    runtimeMountedTools: [
      runtimeTool({
        mount_id: "u-airtable",
        runtime_tool_name: "me__airtable__list_records",
        developer_app_id: "dev-airtable",
        catalog_app_id: "airtable",
        app_name: "Airtable",
        endpoint_url: "https://airtable.example.com/mcp",
        tool_name: "list_records",
        namespaced_tool_name: "airtable__list_records",
      }),
      runtimeTool({
        mount_id: "u-github",
        runtime_tool_name: "me__github__search_repositories",
        developer_app_id: "dev-github",
        catalog_app_id: "github",
        app_name: "GitHub",
        endpoint_url: "https://github.example.com/mcp",
        tool_name: "search_repositories",
        namespaced_tool_name: "github__search_repositories",
      }),
      runtimeTool({
        mount_id: "u-linear",
        runtime_tool_name: "me__linear__search_issues",
        tool_name: "search_issues",
        namespaced_tool_name: "linear__search_issues",
      }),
      runtimeTool({
        mount_id: "u-context7",
        runtime_tool_name: "me__context7__resolve_library_id",
        developer_app_id: "dev-context7",
        catalog_app_id: "context7",
        app_name: "Context7",
        endpoint_url: "https://context7.example.com/mcp",
        tool_name: "resolve_library_id",
        namespaced_tool_name: "context7__resolve_library_id",
      }),
      runtimeTool({
        mount_id: "u-fly",
        runtime_tool_name: "me__fly__list_apps",
        developer_app_id: "dev-fly",
        catalog_app_id: "fly",
        app_name: "Fly",
        endpoint_url: "https://fly.example.com/mcp",
        tool_name: "list_apps",
        namespaced_tool_name: "fly__list_apps",
      }),
    ],
  });

  assert.deepEqual(
    projection.codexBridgeTools.map((tool) => tool.connector_name),
    ["Airtable", "GitHub", "Linear"],
  );
  assert.deepEqual(
    projection.polynetMountedTools.map((tool) => tool.app_name),
    ["Airtable", "GitHub", "Linear"],
  );
  assert.deepEqual(
    projection.codexBridgeTools.map((tool) => tool.bridge_tool_name),
    [
      "polynet_mcp__airtable__list_records",
      "polynet_mcp__github__search_repositories",
      "polynet_mcp__linear__search_issues",
    ],
  );
  assert.equal(
    projection.capabilities.find((capability) => capability.app_name === "Context7")
      ?.codex_bridge_tool_count,
    0,
  );
  assert.equal(
    projection.capabilities.find((capability) => capability.app_name === "Fly")
      ?.codex_bridge_tool_count,
    0,
  );
  assert.equal(
    projection.setupPacketHints.find((hint) => hint.app_name === "Fly")
      ?.setup_reason,
    "needs_auth",
  );

  console.log("PASS: only live apps with runtime tools project to harnesses");
}

function proveWriteFlooredReadToolsRemainCodexExecutable() {
  const effectiveApps = buildEffectiveMcpApps([
    mount({
      id: "user:u-airtable",
      source_mount_id: "u-airtable",
      scope: "user",
      live_status: "live",
      enabled_tools: [
        "ping",
        "list_records",
        "create_table",
        "delete_records_for_table",
      ],
      app: {
        catalog_app_id: "airtable",
        name: "Airtable",
        slug: "airtable",
        endpoint_url: "https://airtable.example.com/mcp",
        auth_type: "bearer",
        status: "valid",
      },
      tools: [
        {
          tool_name: "ping",
          namespaced_tool_name: "airtable__ping",
          description: "Check Airtable MCP health",
          risk_level: "read",
          enabled: true,
        },
        {
          tool_name: "list_records",
          namespaced_tool_name: "airtable__list_records",
          description: "List Airtable records",
          risk_level: "read",
          enabled: true,
        },
        {
          tool_name: "create_table",
          namespaced_tool_name: "airtable__create_table",
          description: "Create Airtable table",
          risk_level: "write",
          enabled: true,
        },
        {
          tool_name: "delete_records_for_table",
          namespaced_tool_name: "airtable__delete_records_for_table",
          description: "Delete Airtable records",
          risk_level: "sensitive",
          enabled: true,
        },
      ],
    }),
    mount({
      id: "user:u-notion",
      source_mount_id: "u-notion",
      scope: "user",
      live_status: "live",
      enabled_tools: ["notion_fetch", "notion_create_pages"],
      app: {
        catalog_app_id: "notion",
        name: "Notion",
        slug: "notion",
        endpoint_url: "https://notion.example.com/mcp",
        auth_type: "oauth",
        status: "valid",
      },
      tools: [
        {
          tool_name: "notion_fetch",
          namespaced_tool_name: "notion__notion_fetch",
          description: "Fetch Notion page content",
          risk_level: "read",
          enabled: true,
        },
        {
          tool_name: "notion_create_pages",
          namespaced_tool_name: "notion__notion_create_pages",
          description: "Create Notion pages",
          risk_level: "write",
          enabled: true,
        },
      ],
    }),
  ]);
  const projection = buildMcpHarnessProjection({
    effectiveApps,
    runtimeMountedTools: [
      runtimeTool({
        mount_id: "u-airtable",
        runtime_tool_name: "me__airtable__ping",
        developer_app_id: "dev-airtable",
        catalog_app_id: "airtable",
        app_name: "Airtable",
        endpoint_url: "https://airtable.example.com/mcp",
        tool_name: "ping",
        namespaced_tool_name: "airtable__ping",
        risk_level: resolveDiscoverAppProjectedToolRisk({
          catalogAppId: "airtable",
          storedRisk: "write",
          toolName: "ping",
        }),
      }),
      runtimeTool({
        mount_id: "u-airtable",
        runtime_tool_name: "me__airtable__list_records",
        developer_app_id: "dev-airtable",
        catalog_app_id: "airtable",
        app_name: "Airtable",
        endpoint_url: "https://airtable.example.com/mcp",
        tool_name: "list_records",
        namespaced_tool_name: "airtable__list_records",
        risk_level: resolveDiscoverAppProjectedToolRisk({
          catalogAppId: "airtable",
          storedRisk: "write",
          toolName: "list_records",
        }),
      }),
      runtimeTool({
        mount_id: "u-airtable",
        runtime_tool_name: "me__airtable__create_table",
        developer_app_id: "dev-airtable",
        catalog_app_id: "airtable",
        app_name: "Airtable",
        endpoint_url: "https://airtable.example.com/mcp",
        tool_name: "create_table",
        namespaced_tool_name: "airtable__create_table",
        risk_level: resolveDiscoverAppProjectedToolRisk({
          catalogAppId: "airtable",
          storedRisk: "write",
          toolName: "create_table",
        }),
      }),
      runtimeTool({
        mount_id: "u-airtable",
        runtime_tool_name: "me__airtable__delete_records_for_table",
        developer_app_id: "dev-airtable",
        catalog_app_id: "airtable",
        app_name: "Airtable",
        endpoint_url: "https://airtable.example.com/mcp",
        tool_name: "delete_records_for_table",
        namespaced_tool_name: "airtable__delete_records_for_table",
        risk_level: resolveDiscoverAppProjectedToolRisk({
          catalogAppId: "airtable",
          storedRisk: "sensitive",
          toolName: "delete_records_for_table",
        }),
      }),
      runtimeTool({
        mount_id: "u-notion",
        runtime_tool_name: "me__notion__notion_fetch",
        developer_app_id: "dev-notion",
        catalog_app_id: "notion",
        app_name: "Notion",
        endpoint_url: "https://notion.example.com/mcp",
        auth_type: "oauth",
        tool_name: "notion_fetch",
        namespaced_tool_name: "notion__notion_fetch",
        risk_level: resolveDiscoverAppProjectedToolRisk({
          catalogAppId: "notion",
          storedRisk: "write",
          toolName: "notion_fetch",
        }),
      }),
      runtimeTool({
        mount_id: "u-notion",
        runtime_tool_name: "me__notion__notion_create_pages",
        developer_app_id: "dev-notion",
        catalog_app_id: "notion",
        app_name: "Notion",
        endpoint_url: "https://notion.example.com/mcp",
        auth_type: "oauth",
        tool_name: "notion_create_pages",
        namespaced_tool_name: "notion__notion_create_pages",
        risk_level: resolveDiscoverAppProjectedToolRisk({
          catalogAppId: "notion",
          storedRisk: "write",
          toolName: "notion_create_pages",
        }),
      }),
    ],
  });
  const executableCodexTools = projection.codexBridgeTools.filter(
    (tool) => tool.risk_level === "read",
  );

  assert.deepEqual(
    executableCodexTools.map((tool) => tool.bridge_tool_name),
    [
      "polynet_mcp__airtable__list_records",
      "polynet_mcp__airtable__ping",
      "polynet_mcp__notion__notion_fetch",
    ],
  );
  assert.deepEqual(
    projection.codexBridgeTools
      .filter((tool) => tool.risk_level !== "read")
      .map((tool) => [tool.bridge_tool_name, tool.risk_level]),
    [
      ["polynet_mcp__airtable__create_table", "write"],
      ["polynet_mcp__airtable__delete_records_for_table", "sensitive"],
      ["polynet_mcp__notion__notion_create_pages", "write"],
    ],
  );

  console.log("PASS: write-floored read tools remain Codex executable");
}

function proveBridgeNamesAreCollisionSafeAcrossRuntimeTools() {
  const effectiveApps = buildEffectiveMcpApps([
    mount({
      id: "user:u-docs-alpha",
      source_mount_id: "u-docs-alpha",
      scope: "user",
      live_status: "live",
      enabled_tools: ["search"],
      app: {
        catalog_app_id: null,
        name: "Docs",
        slug: "docs-alpha",
        endpoint_url: "https://alpha.example.com/mcp",
        auth_type: "bearer",
        status: "valid",
      },
    }),
    mount({
      id: "user:u-docs-beta",
      source_mount_id: "u-docs-beta",
      scope: "user",
      live_status: "live",
      enabled_tools: ["search"],
      app: {
        catalog_app_id: null,
        name: "Docs",
        slug: "docs-beta",
        endpoint_url: "https://beta.example.com/mcp",
        auth_type: "bearer",
        status: "valid",
      },
    }),
  ]);
  const projection = buildMcpHarnessProjection({
    effectiveApps,
    runtimeMountedTools: [
      runtimeTool({
        mount_id: "u-docs-alpha",
        runtime_tool_name: "me__docs_alpha__search",
        developer_app_id: "dev-docs-alpha",
        catalog_app_id: null,
        app_name: "Docs",
        endpoint_url: "https://alpha.example.com/mcp",
        tool_name: "search",
        namespaced_tool_name: "docs__search",
      }),
      runtimeTool({
        mount_id: "u-docs-beta",
        runtime_tool_name: "me__docs_beta__search",
        developer_app_id: "dev-docs-beta",
        catalog_app_id: null,
        app_name: "Docs",
        endpoint_url: "https://beta.example.com/mcp",
        tool_name: "search",
        namespaced_tool_name: "docs__search",
      }),
    ],
  });
  const bridgeNames = projection.codexBridgeTools.map(
    (tool) => tool.bridge_tool_name,
  );

  assert.equal(bridgeNames.length, 2);
  assert.equal(new Set(bridgeNames).size, 2);
  assert.ok(
    bridgeNames.every((name) => name.startsWith("polynet_mcp__docs__search__")),
    `expected collision-safe suffixed bridge names, got ${bridgeNames.join(", ")}`,
  );
  assert.deepEqual(
    projection.codexBridgeTools.map((tool) => tool.runtime_tool_name),
    ["me__docs_alpha__search", "me__docs_beta__search"],
  );

  console.log("PASS: Codex bridge names are collision-safe");
}

function proveRuntimeToolsWithoutMatchingLivePersonalAppFailClosed() {
  const effectiveApps = buildEffectiveMcpApps([
    mount({
      id: "user:u-linear",
      source_mount_id: "u-linear",
      scope: "user",
      live_status: "not_live",
      enabled_tools: ["search_issues"],
    }),
  ]);
  const projection = buildMcpHarnessProjection({
    effectiveApps,
    runtimeMountedTools: linearRuntimeTools(),
  });

  assert.equal(projection.polynetMountedTools.length, 0);
  assert.equal(projection.codexBridgeTools.length, 0);
  assert.equal(projection.setupPacketHints.length, 1);

  console.log("PASS: runtime tools without matching live personal app fail closed");
}

proveContractAndPackageScript();
proveLivePersonalRuntimeToolsProjectToBothRuntimes();
proveCommunityAttachmentDoesNotDuplicateRuntimeTools();
proveCommunityOnlyAttachmentIsSetupNeeded();
proveDisabledToolsStayOutOfRuntimeProjections();
proveOnlyLiveAppsWithRuntimeToolsProject();
proveWriteFlooredReadToolsRemainCodexExecutable();
proveBridgeNamesAreCollisionSafeAcrossRuntimeTools();
proveRuntimeToolsWithoutMatchingLivePersonalAppFailClosed();

console.log("mcp_harness_projection_contract_proof: ok");
