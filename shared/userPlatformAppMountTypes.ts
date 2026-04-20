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

export type ConnectUserPlatformAppResult = {
  ok: boolean;
  mount: UserPlatformMountedApp | null;
  validation_report: UserPlatformAppValidationReport | null;
  error_message: string | null;
};
