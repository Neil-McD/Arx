import type { DeveloperAppAuthType } from "../shared/communityAppMountTypes";
import {
  resolveDiscoverAppCatalogConnectPolicy,
} from "../shared/discoverCatalog.ts";
import {
  resolveCommunityWorkflowImportMcpRegistryConnectPolicy,
} from "../shared/communityWorkflowImportMcpRegistry.ts";
import type { DeveloperAppRow } from "./appCore.ts";

export function assertDeveloperAppServerFetchAllowed(
  app: Pick<
    DeveloperAppRow,
    "catalogAppId" | "name" | "endpointUrl" | "authType" | "mcpRegistryId"
  >,
): void {
  const policy = resolveDiscoverAppCatalogConnectPolicy({
    catalogAppId: app.catalogAppId,
    name: app.name,
    endpointUrl: app.endpointUrl,
    authType: app.authType as DeveloperAppAuthType,
  });
  if (!policy.ok) {
    const registryPolicy =
      resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
        mcpRegistryId: app.mcpRegistryId,
        name: app.name,
        endpointUrl: app.endpointUrl,
        authType: app.authType as DeveloperAppAuthType,
      });
    if (!registryPolicy.ok) {
      throw new Error(app.mcpRegistryId ? registryPolicy.message : policy.message);
    }
    if (
      registryPolicy.mcpRegistryId !== app.mcpRegistryId ||
      registryPolicy.endpointUrl !== app.endpointUrl ||
      registryPolicy.authType !== app.authType
    ) {
      throw new Error("Developer app endpoint does not match its MCP registry policy.");
    }
    return;
  }
  if (
    policy.catalogAppId !== app.catalogAppId ||
    policy.endpointUrl !== app.endpointUrl ||
    policy.authType !== app.authType
  ) {
    throw new Error("Developer app endpoint does not match its catalog policy.");
  }
}
