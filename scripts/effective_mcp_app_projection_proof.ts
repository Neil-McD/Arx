import assert from "node:assert/strict";

import { buildEffectiveMcpApps } from "../shared/effectiveMcpApps.ts";

type ProofMount = Parameters<typeof buildEffectiveMcpApps>[0][number];

function mount(patch: Partial<ProofMount> & {
  id: string;
  source_mount_id: string;
  scope: "user" | "community";
  live_status: "live" | "not_live";
}): ProofMount {
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
      catalog_app_id: patch.app?.catalog_app_id ?? "linear",
      name: appName,
      slug: patch.app?.slug ?? appName.toLowerCase(),
      endpoint_url: patch.app?.endpoint_url ?? "https://mcp.linear.app/mcp",
      auth_type: patch.app?.auth_type ?? "bearer",
      status: patch.app?.status ?? "valid",
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
        description: null,
        risk_level: toolName.startsWith("create") ? "write" : "read",
        enabled: true,
      })),
  };
}

function provePersonalConnectionSatisfiesCommunityAttachment() {
  const personalLinear = mount({
    id: "user:u-linear",
    source_mount_id: "u-linear",
    scope: "user",
    live_status: "live",
  });
  const communityLinear = mount({
    id: "community:c-linear",
    source_mount_id: "c-linear",
    scope: "community",
    live_status: "not_live",
    not_live_reason: "needs_auth",
    enabled_tools: ["search_issues"],
  });

  const rows = buildEffectiveMcpApps([personalLinear, communityLinear]);

  assert.equal(rows.length, 1);
  const [linear] = rows;
  assert.equal(linear.app_identity_key, "catalog:linear");
  assert.equal(linear.is_attached_to_community, true);
  assert.equal(linear.has_personal_connection, true);
  assert.equal(linear.live_for_current_user, true);
  assert.equal(linear.credential_state, "live");
  assert.equal(linear.setup_reason, null);
  assert.equal(linear.primary_action, "manage_personal");
  assert.deepEqual(linear.effective_enabled_tools, ["search_issues"]);
  assert.equal(linear.effective_tool_count, 1);
  assert.equal(linear.personal_mount?.source_mount_id, "u-linear");
  assert.equal(linear.community_mount?.source_mount_id, "c-linear");

  console.log("PASS: personal live MCP connection satisfies community attachment projection");
}

function proveCommunityAttachmentRequiresMemberSetupWithoutPersonalMount() {
  const communityLinear = mount({
    id: "community:c-linear",
    source_mount_id: "c-linear",
    scope: "community",
    live_status: "not_live",
    not_live_reason: "needs_auth",
  });

  const rows = buildEffectiveMcpApps([communityLinear]);

  assert.equal(rows.length, 1);
  const [linear] = rows;
  assert.equal(linear.is_attached_to_community, true);
  assert.equal(linear.has_personal_connection, false);
  assert.equal(linear.live_for_current_user, false);
  assert.equal(linear.credential_state, "needs_personal_setup");
  assert.equal(linear.setup_reason, "needs_personal_connection");
  assert.equal(linear.primary_action, "setup_personal");

  console.log("PASS: community attachment prompts member setup when personal mount is missing");
}

function proveEmptyCommunityToolSelectionDoesNotZeroLivePersonalTools() {
  const personalLinear = mount({
    id: "user:u-linear",
    source_mount_id: "u-linear",
    scope: "user",
    live_status: "live",
    enabled_tools: ["search_issues", "create_issue", "list_projects"],
  });
  const communityLinear = mount({
    id: "community:c-linear",
    source_mount_id: "c-linear",
    scope: "community",
    live_status: "not_live",
    not_live_reason: "needs_auth",
    enabled_tools: [],
  });

  const rows = buildEffectiveMcpApps([personalLinear, communityLinear]);

  assert.equal(rows.length, 1);
  const [linear] = rows;
  assert.equal(linear.live_for_current_user, true);
  assert.equal(linear.credential_state, "live");
  assert.deepEqual(linear.effective_enabled_tools, [
    "search_issues",
    "create_issue",
    "list_projects",
  ]);
  assert.equal(linear.effective_tool_count, 3);

  console.log("PASS: empty community tool selection does not zero live personal tools");
}

function provePersonalOnlyMountRemainsLive() {
  const personalLinear = mount({
    id: "user:u-linear",
    source_mount_id: "u-linear",
    scope: "user",
    live_status: "live",
  });

  const rows = buildEffectiveMcpApps([personalLinear]);

  assert.equal(rows.length, 1);
  const [linear] = rows;
  assert.equal(linear.is_attached_to_community, false);
  assert.equal(linear.live_for_current_user, true);
  assert.equal(linear.credential_state, "live");
  assert.equal(linear.primary_action, "manage_personal");
  assert.deepEqual(linear.effective_enabled_tools, [
    "search_issues",
    "create_issue",
  ]);

  console.log("PASS: personal-only live mount remains live in effective projection");
}

provePersonalConnectionSatisfiesCommunityAttachment();
proveCommunityAttachmentRequiresMemberSetupWithoutPersonalMount();
proveEmptyCommunityToolSelectionDoesNotZeroLivePersonalTools();
provePersonalOnlyMountRemainsLive();

console.log("effective_mcp_app_projection_proof: ok");
