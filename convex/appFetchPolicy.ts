import type { DeveloperAppAuthType } from "../shared/communityAppMountTypes";
import {
  resolveDiscoverAppCatalogConnectPolicy,
} from "../shared/discoverCatalog.ts";
import type { DeveloperAppRow } from "./appCore.ts";

export function assertDeveloperAppServerFetchAllowed(
  app: Pick<
    DeveloperAppRow,
    "catalogAppId" | "name" | "endpointUrl" | "authType"
  >,
): void {
  const policy = resolveDiscoverAppCatalogConnectPolicy({
    catalogAppId: app.catalogAppId,
    name: app.name,
    endpointUrl: app.endpointUrl,
    authType: app.authType as DeveloperAppAuthType,
  });
  if (!policy.ok) {
    throw new Error(policy.message);
  }
  if (
    policy.catalogAppId !== app.catalogAppId ||
    policy.endpointUrl !== app.endpointUrl ||
    policy.authType !== app.authType
  ) {
    throw new Error("Developer app endpoint does not match its catalog policy.");
  }
}
