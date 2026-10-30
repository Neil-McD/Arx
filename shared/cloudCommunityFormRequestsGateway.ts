import type { WelcomeBlock } from "./communityWelcomeLayout";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import { acquireAuthenticatedConvexRealtimeClient, type ConvexRealtimeEnsureSession } from "./convexRealtimeAuth";
import type { CommunityFormQuestion } from "./communityForms";
import type { FormAnswers } from "./communityFormAnswers";
export type MemberFormSummary = { id: string; form_key?: string; name: string; answered: number; total: number; createdAt: number };
export type MemberFormRequest = { id: string; name: string; questions: CommunityFormQuestion[]; answers: FormAnswers; revision: number };
export function subscribeMemberForms<S>(session: S, communityId: string, ensureSession: ConvexRealtimeEnsureSession<S>, update: (rows: MemberFormSummary[], hasMore?: boolean) => void, error: () => void) {
  const lease = acquireAuthenticatedConvexRealtimeClient({ session, convexUrl: requireConvexUrl(), ensureSession });
  type Page = { rows: MemberFormSummary[]; nextCursor: string | null; visit: string | null };
  const pages: Array<{ value?: Page; stop: () => void }> = [];
  let closed = false;
  const emit = () => update([...new Map(pages.flatMap(p => p.value?.rows ?? []).map(row => [row.id, row])).values()], Boolean([...pages].reverse().find(p => p.value)?.value?.nextCursor));
  const subscribe = (cursor: string | null, visit: string | null) => {
    const index = pages.length;
    const entry: { value?: Page; stop: () => void } = { stop: () => {} };
    pages.push(entry);
    const watch = lease.client.watchQuery(api.communityFormRequests.listMyRequests, { communityId: communityId as Id<"communities">, authSubject: lease.authSubject, paged: true, cursor, visit });
    const publish = () => { if (closed || pages[index] !== entry) return;
      try {
        const value = watch.localQueryResult();
        if (value === undefined) return;
        if (Array.isArray(value)) throw new Error("form_request_page_unavailable");
        if (value.visit !== visit) {
          if (index === 0) {
            pages.splice(0).forEach(p => p.stop());
            emit();
            subscribe(null, value.visit);
          } else { pages.splice(index).forEach(p => p.stop()); emit(); }
          return;
        }
        if (JSON.stringify(entry.value) === JSON.stringify(value)) return;
        for (const removed of pages.splice(index + 1)) removed.stop();
        entry.value = value;
        if (index > 0 && value.visit !== pages[0].value?.visit) { pages.splice(index).forEach(p => p.stop()); emit(); return; }
        emit();
      } catch { error(); }
    };
    entry.stop = watch.onUpdate(publish); publish();
  };
  subscribe(null, null);
  return Object.assign(() => { closed = true; pages.forEach(p => p.stop()); lease.close(); }, {
    loadMore: () => { const page = pages.at(-1)?.value; if (!closed && page?.nextCursor) { subscribe(page.nextCursor, page.visit); emit(); } },
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
/** The member's pending request for one form (by its key), if a Workflow has assigned it. Lessons use it to show the form in place. */
export async function findMyPendingFormByKey(session: unknown, communityId: string, formKey: string): Promise<MemberFormSummary | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  const rows = await client.query(api.communityFormRequests.listMyRequests, { communityId: communityId as Id<"communities">, authSubject }) as Array<MemberFormSummary & { form_key?: string }>;
  return (Array.isArray(rows) ? rows : []).find(row => row.form_key === formKey) ?? null;
}

/** What the held member's welcome page shows: the builder's words and its lesson steps. */
export type MemberWelcomePage<TLesson> = { title: string | null; message: string | null; media_url: string | null; layout?: WelcomeBlock[] | null; lessons: TLesson[] };
export async function getMemberWelcomePage<S, TLesson>(session: S, communityId: string): Promise<MemberWelcomePage<TLesson>> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.query(api.communityResources.getMyWelcomePage, { authSubject, communityId: communityId as Id<"communities"> }) as MemberWelcomePage<TLesson>;
}
