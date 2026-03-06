import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";

type CloudModelRegistryGatewayParams<SessionT> = {
  session: SessionT;
};

async function bootstrapConvexUser(sessionRaw: unknown): Promise<{
  client: ConvexClient;
}> {
  const { client } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client };
}

export async function listEnabledCloudModelRegistryRows<SessionT>(
  params: CloudModelRegistryGatewayParams<SessionT>,
): Promise<unknown[]> {
  const { client } = await bootstrapConvexUser(params.session);
  const payload = await client.query("modelRegistry:listEnabledModelRegistry" as any, {
    enabled: true,
  });
  return Array.isArray(payload) ? payload : [];
}
