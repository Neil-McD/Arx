import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import { acquireAuthenticatedConvexRealtimeClient, type ConvexRealtimeEnsureSession } from "./convexRealtimeAuth";
import type { CommunityFormQuestion } from "./communityForms";
import type { FormAnswers } from "./communityFormAnswers";
export type MemberFormSummary = { id: string; name: string; answered: number; total: number; createdAt: number };
export type MemberFormRequest = { id: string; name: string; questions: CommunityFormQuestion[]; answers: FormAnswers; revision: number };
export function subscribeMemberForms<S>(session: S, communityId: string, ensureSession: ConvexRealtimeEnsureSession<S>, update: (rows: MemberFormSummary[], hasMore?: boolean) => void, error: () => void) {
  const lease = acquireAuthenticatedConvexRealtimeClient({ session, convexUrl: requireConvexUrl(), ensureSession });
  type Page = { rows: MemberFormSummary[]; nextCursor: string | null; visit: string | null };
  const pages: Array<{ value?: Page; stop: () => void }> = [];
  let closed = false;
  const emit = () => update([...new Map(pages.flatMap(p => p.value?.rows ?? []).map(row => [row.id, row])).values()], Boolean([...pages].reverse().find(p => p.value)?.value?.nextCursor));
  const subscribe = (cursor: string | null) => {
    const index = pages.length;
    const entry: { value?: Page; stop: () => void } = { stop: () => {} };
    pages.push(entry);
    const watch = lease.client.watchQuery(api.communityFormRequests.listMyRequests, { communityId: communityId as Id<"communities">, authSubject: lease.authSubject, paged: true, cursor });
    const publish = () => { if (closed || pages[index] !== entry) return;
      try {
        const value = watch.localQueryResult();
        if (value === undefined) return;
        if (Array.isArray(value)) throw new Error("form_request_page_unavailable");
        if (JSON.stringify(entry.value) === JSON.stringify(value)) return;
        for (const removed of pages.splice(index + 1)) removed.stop();
        entry.value = value;
        if (index > 0 && value.visit !== pages[0].value?.visit) { pages.splice(index).forEach(p => p.stop()); emit(); return; }
        emit();
      } catch { error(); }
    };
    entry.stop = watch.onUpdate(publish); publish();
  };
  subscribe(null);
  return Object.assign(() => { closed = true; pages.forEach(p => p.stop()); lease.close(); }, {
    loadMore: () => { const cursor = pages.at(-1)?.value?.nextCursor; if (!closed && cursor) { subscribe(cursor); emit(); } },
  });
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
