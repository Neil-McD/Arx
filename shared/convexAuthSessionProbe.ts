import { type CloudAuthSession } from "./cloudAuthSession";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export async function probeConvexAuthenticatedActorSession(
  session: CloudAuthSession,
): Promise<boolean> {
  try {
    const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
    const actor = (await client.query("auth:getActor" as any, {
      authState: "authenticated",
      authSubject,
    })) as { userId?: string | null } | null;
    return Boolean(String(actor?.userId ?? "").trim());
  } catch {
    return false;
  }
}
