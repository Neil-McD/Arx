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
    })) as { authSubject?: string | null } | null;
    return String(actor?.authSubject ?? "").trim() === authSubject;
  } catch {
    return false;
  }
}
