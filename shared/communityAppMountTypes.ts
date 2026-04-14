export type DeveloperAppAuthType = "none" | "api_key" | "bearer";

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
  tools: CommunityMountedAppTool[];
};

export type ConnectCommunityAppInput = {
  name: string;
  endpoint_url: string;
  auth_type: DeveloperAppAuthType;
  description?: string;
  secret?: string;
};
