import { type AuthSessionLike } from "./authSession";
import {
  bootstrapConvexAuthenticatedClient,
  type ConvexAuthenticatedBootstrapResult,
} from "./convexAuthenticatedClient";
import {
  APP_ADMISSION_TIMEOUT_MS,
  withAsyncDeadline,
} from "./asyncDeadline";

export type ConvexAuthenticatedSessionProbeResult = {
  accepted: boolean;
  authSubject: string | null;
  actorAuthSubject: string | null;
  bootstrap: ConvexAuthenticatedBootstrapResult | null;
  bootstrapActorMs: number | null;
  getActorMs: number | null;
  totalMs: number;
  failureStage: "bootstrap_actor" | "get_actor" | null;
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
  const totalStartedAt = Date.now();
  let bootstrapActorMs: number | null = null;
  let getActorMs: number | null = null;
  try {
    const bootstrapStartedAt = Date.now();
    const { client, authSubject, bootstrap } = await bootstrapConvexAuthenticatedClient(session);
    bootstrapActorMs = Date.now() - bootstrapStartedAt;
    const getActorStartedAt = Date.now();
    const actor = (await withAsyncDeadline(
      client.query("auth:getActor" as any, {
        authState: "authenticated",
        authSubject,
      }),
      {
        timeoutMs: APP_ADMISSION_TIMEOUT_MS,
        code: "convex_get_actor_timeout",
      },
    )) as { authSubject?: unknown } | null;
    getActorMs = Date.now() - getActorStartedAt;
    const actorAuthSubject = String(actor?.authSubject ?? bootstrap?.authSubject ?? authSubject ?? "").trim() || null;
    return {
      accepted: actorAuthSubject === authSubject,
      authSubject,
      actorAuthSubject,
      bootstrap,
      bootstrapActorMs,
      getActorMs,
      totalMs: Date.now() - totalStartedAt,
      failureStage: null,
      error: null,
    };
  } catch (error) {
    const message = toErrorMessage(error);
    return {
      accepted: false,
      authSubject: null,
      actorAuthSubject: null,
      bootstrap: null,
      bootstrapActorMs,
      getActorMs,
      totalMs: Date.now() - totalStartedAt,
      failureStage: bootstrapActorMs === null ? "bootstrap_actor" : "get_actor",
      error: message,
    };
  }
}
