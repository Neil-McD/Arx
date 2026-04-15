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
