export type DeveloperAppAuthType = "none" | "api_key" | "bearer" | "oauth";

export type AppMountLiveStatus = "live" | "not_live";

export type AppMountNotLiveReason =
  | "disabled"
  | "needs_auth"
  | "needs_config"
  | "needs_runtime"
  | "validation_failed"
  | "no_tools_discovered"
  | "missing_snapshot"
  | "unknown";

export type CommunityMountedAppTool = {
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  risk_level: "read" | "write" | "sensitive";
  enabled: boolean;
};

export type CommunityMountedApp = {
  id: string;
  enabled: boolean;
  enabled_tools: string[];
  live_status?: AppMountLiveStatus;
  not_live_reason?: AppMountNotLiveReason | null;
  app: {
    catalog_app_id: string | null;
    name: string;
    slug: string;
    endpoint_url: string;
    auth_type: string;
    status: string;
    setup_status?: string | null;
    setup_reason?: string | null;
    mcp_registry_id?: string | null;
  };
  connection: {
    connection_status: string;
  };
  tools: CommunityMountedAppTool[];
};

export type ConnectCommunityAppInput = {
  catalog_app_id?: string;
  name: string;
  endpoint_url: string;
  auth_type: DeveloperAppAuthType;
  description?: string;
};

export type SetupImportedCommunityMcpAppInput = {
  community_app_mount_id: string;
  endpoint_url: string;
  auth_type: DeveloperAppAuthType;
};

export type PrivateCommunityMcpOptionAddStatus =
  | "ready"
  | "needs_auth"
  | "needs_config"
  | "not_available";

export type PrivateCommunityMcpOption = {
  mcp_registry_id: string;
  catalog_app_id: string | null;
  name: string;
  description: string | null;
  logo_url: string | null;
  docs_urls: string[];
  add_status: PrivateCommunityMcpOptionAddStatus;
  setup_kind: string;
  addable: boolean;
  add_blocked_reason: string | null;
  requires_member_auth: boolean;
  requires_nonsecret_config: boolean;
};

export type AddPrivateCommunityMcpAppResult = {
  ok: boolean;
  status: "connected" | "staged" | "reused" | "rejected" | "failed";
  mcp_registry_id: string | null;
  name: string | null;
  community_app_mount_id: string | null;
  setup_required: boolean;
  setup_reason: "needs_auth" | "needs_config" | null;
  error_message: string | null;
};
