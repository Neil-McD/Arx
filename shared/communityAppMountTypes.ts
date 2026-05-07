export type DeveloperAppAuthType = "none" | "api_key" | "bearer" | "oauth";

export type AppMountLiveStatus = "live" | "not_live";

export type AppMountNotLiveReason =
  | "disabled"
  | "needs_auth"
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
