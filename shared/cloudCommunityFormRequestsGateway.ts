import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import { acquireAuthenticatedConvexRealtimeClient, type ConvexRealtimeEnsureSession } from "./convexRealtimeAuth";
import type { CommunityFormQuestion } from "./communityForms";
import type { FormAnswers } from "./communityFormAnswers";
export type MemberFormSummary = { id: string; name: string; answered: number; total: number; createdAt: number };
export type MemberFormRequest = { id: string; name: string; questions: CommunityFormQuestion[]; answers: FormAnswers; revision: number };
export function subscribeMemberForms<S>(session: S, communityId: string, ensureSession: ConvexRealtimeEnsureSession<S>, update: (rows: MemberFormSummary[]) => void, error: () => void) {
  const lease = acquireAuthenticatedConvexRealtimeClient({ session, convexUrl: requireConvexUrl(), ensureSession });
  const watch = lease.client.watchQuery(api.communityFormRequests.listMyRequests, { communityId: communityId as Id<"communities">, authSubject: lease.authSubject });
  const publish = () => { try { const rows = watch.localQueryResult(); if (rows !== undefined) update(rows); } catch { error(); } };
  const unsubscribe = watch.onUpdate(publish); publish();
  return () => { unsubscribe(); lease.close(); };
}
export async function getMemberForm(session: unknown, communityId: string, requestId: string): Promise<MemberFormRequest> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.query(api.communityFormRequests.getMyRequest, { communityId: communityId as Id<"communities">, requestId: requestId as Id<"communityFormRequests">, authSubject });
}
export async function saveMemberForm(session: unknown, communityId: string, request: MemberFormRequest, answers: FormAnswers, submit: boolean) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityFormRequests.saveMyAnswers, { communityId: communityId as Id<"communities">, requestId: request.id as Id<"communityFormRequests">,
    authSubject, answers, expectedRevision: request.revision, submit });
}
