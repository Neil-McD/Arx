import { bootstrapGatewayAuthContext } from "./cloudGateway";

type CloudAccountGatewayParams<SessionT> = {
  session: SessionT;
};

export async function deleteCloudOwnAccount<SessionT>(
  params: CloudAccountGatewayParams<SessionT>,
): Promise<void> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  await client.mutation("account:deleteOwnAccount" as any, {
    authSubject,
  });
}
