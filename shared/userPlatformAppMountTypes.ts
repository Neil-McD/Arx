import type { DeveloperAppAuthType } from "./communityAppMountTypes";

export type UserPlatformMountedAppTool = {
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  risk_level: "read" | "write" | "sensitive";
  enabled: boolean;
};

export type UserPlatformMountedApp = {
  id: string;
  enabled: boolean;
  enabled_tools: string[];
  app: {
    name: string;
    slug: string;
    endpoint_url: string;
    auth_type: string;
    status: string;
  };
  connection: {
    connection_status: string;
  };
  tools: UserPlatformMountedAppTool[];
};

export type ConnectUserPlatformAppInput = {
  name: string;
  endpoint_url: string;
  auth_type: DeveloperAppAuthType;
  description?: string;
  secret?: string;
  connect_attempt_id?: string;
};

export type UserPlatformAppValidationStageId =
  | "endpoint_reachable"
  | "mcp_initialized"
  | "tools_discovered"
  | "mounted";

export type UserPlatformAppValidationStageStatus = "ok" | "error" | "skipped";

export type UserPlatformAppValidationStage = {
  id: UserPlatformAppValidationStageId;
  label: string;
  status: UserPlatformAppValidationStageStatus;
  detail: string | null;
};

export type UserPlatformAppValidationReport = {
  validation_status: "ok" | "error";
  validation_error: string | null;
  tool_count: number;
  stages: UserPlatformAppValidationStage[];
};

export type ConnectUserPlatformAppErrorCode =
  | "authenticated_user_required"
  | "connect_lookup_failed"
  | "developer_app_connection_secret_required"
  | "developer_app_create_failed"
  | "developer_app_secret_store_failed"
  | "developer_app_validation_failed"
  | "developer_app_snapshot_missing"
  | "developer_app_no_tools_discovered"
  | "developer_app_mount_failed"
  | "developer_app_connect_failed"
  | "server_unavailable";

export type ConnectUserPlatformAppResult = {
  ok: boolean;
  mount: UserPlatformMountedApp | null;
  validation_report: UserPlatformAppValidationReport | null;
  error_code: ConnectUserPlatformAppErrorCode | null;
  error_message: string | null;
  connect_attempt_id: string | null;
};
