import { type AuthSessionLike } from "./authSession";
import {
  bootstrapConvexAuthenticatedClient,
  type ConvexAuthenticatedBootstrapResult,
} from "./convexAuthenticatedClient";

export type ConvexAuthenticatedSessionProbeResult = {
  accepted: boolean;
  authSubject: string | null;
  actorAuthSubject: string | null;
  bootstrap: ConvexAuthenticatedBootstrapResult | null;
  error: string | null;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "unknown_error";
}

export async function probeConvexAuthenticatedActorSessionDetailed(
  session: AuthSessionLike,
): Promise<ConvexAuthenticatedSessionProbeResult> {
  try {
    const { client, authSubject, bootstrap } = await bootstrapConvexAuthenticatedClient(session);
    const actor = (await client.query("auth:getActor" as any, {
      authState: "authenticated",
      authSubject,
    })) as { authSubject?: string | null } | null;
    const actorAuthSubject = String(actor?.authSubject ?? "").trim() || null;
    return {
      accepted: actorAuthSubject === authSubject,
      authSubject,
      actorAuthSubject,
      bootstrap,
      error: null,
    };
  } catch (error) {
    return {
      accepted: false,
      authSubject: null,
      actorAuthSubject: null,
      bootstrap: null,
      error: toErrorMessage(error),
    };
  }
}

export async function probeConvexAuthenticatedActorSession(
  session: AuthSessionLike,
): Promise<boolean> {
  return (await probeConvexAuthenticatedActorSessionDetailed(session)).accepted;
}
