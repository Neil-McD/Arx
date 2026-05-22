export type HarnessMountScope = "user" | "community";

export type HarnessMountLiveStatus = "live" | "not_live";

export type HarnessMountNotLiveReason =
  | "disabled"
  | "needs_auth"
  | "needs_config"
  | "needs_runtime"
  | "validation_failed"
  | "no_tools_discovered"
  | "missing_snapshot"
  | "unknown";

export type HarnessMountedTool = {
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  risk_level: "read" | "write" | "sensitive";
  enabled: boolean;
};

export type HarnessMount = {
  id: string;
  source_mount_id: string;
  scope: HarnessMountScope;
  owner_id: string;
  added_by_user_id: string | null;
  enabled: boolean;
  enabled_tools: string[];
  live_status: HarnessMountLiveStatus;
  not_live_reason: HarnessMountNotLiveReason | null;
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
  tools: HarnessMountedTool[];
};
