import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { resolveAuthSubject, type AuthSessionLike } from "./authSession";
import {
  acquireAuthenticatedConvexRealtimeClient,
  onAuthenticatedConvexRealtimeSubjectClosed,
} from "./convexRealtimeAuth";
import { requireConvexUrl } from "./convexAuthenticatedClient";

// One way for a page to read data that stays true (docs/specs/
// web-architecture-end-state.md, rule 2). A page names a server query and its
// arguments; the answer comes over the one live connection per signed-in
// person (shared/convexRealtimeAuth.ts) and updates when the data does.
//
// - The same query with the same arguments is one subscription, shared by
//   every page showing it.
// - A token renewal changes nothing: the connection re-authenticates and the
//   answer stays on screen.
// - When the last page showing an answer goes away, it is kept for
//   LINGER_MS, so going back draws it at once instead of blank.

const LINGER_MS = 30_000;

// The queries pages may read live. A fixed list, so the release check can
// prove each one is a public query (scripts/convex_client_operation_integrity_proof.ts)
// and no page can ask for any other function by name.
export type LiveQueryName =
  | "communityBriefs:getPlaceBrief"
  | "communityBrain:getBrainMap"
  | "communityEvents:listCommunityEvents"
  | "communityPods:listCommunityPods"
  | "communityPods:getPod"
  | "communityPodNotes:listPodNotes"
  | "communityAdmin:listCommunityJoinRequests"
  | "communityMemberRecords:getCommunityMemberSummary"
  | "communityResources:listCommunityResources"
  | "communityResources:listCommunityResourceModules"
  | "communityNotes:listCommunityNotes"
  | "communityGuideQuestions:listGuideQuestions"
  | "communityGuideQuestions:getGuideAlwaysAllowed"
  | "communityAttention:listMyHomeTags";

export type LiveResult<T> = { data: T | undefined; error: unknown };
const NOTHING: LiveResult<never> = { data: undefined, error: null };

type Entry = {
  snapshot: LiveResult<unknown>;
  listeners: Set<() => void>;
  stop: () => void;
  linger: ReturnType<typeof setTimeout> | null;
};

const entries = new Map<string, Entry>();

// Arguments in a fixed key order, so the same request is the same key.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function liveQueryKey(subject: string, name: string, args: Record<string, unknown>): string {
  return `${subject}\u0000${name}\u0000${stable(args)}`;
}

// Bumped when a person's connection closes; pages showing their answers then
// subscribe again, over a fresh connection.
let generation = 0;
const generationListeners = new Set<() => void>();
function subscribeGeneration(onChange: () => void): () => void {
  generationListeners.add(onChange);
  return () => { generationListeners.delete(onChange); };
}

onAuthenticatedConvexRealtimeSubjectClosed((subject) => {
  let dropped = false;
  for (const [key, entry] of entries) {
    if (!key.startsWith(`${subject}\u0000`)) continue;
    if (entry.linger !== null) clearTimeout(entry.linger);
    entries.delete(key);
    entry.stop();
    dropped = true;
  }
  if (!dropped) return;
  generation += 1;
  for (const listener of [...generationListeners]) listener();
});

function open(key: string, session: unknown, name: LiveQueryName, args: Record<string, unknown>): Entry {
  const entry: Entry = { snapshot: NOTHING, listeners: new Set(), stop: () => undefined, linger: null };
  const publish = (next: LiveResult<unknown>) => {
    entry.snapshot = next;
    for (const listener of [...entry.listeners]) listener();
  };
  try {
    // No ensureSession here: the connection is shared per person, and the
    // community's chat (always mounted on community pages) hands it the
    // refresh function the connection uses when its token expires.
    const lease = acquireAuthenticatedConvexRealtimeClient({ convexUrl: requireConvexUrl(), session });
    // A name string is a function reference at runtime (convex/server getFunctionName).
    const watch = lease.client.watchQuery(name as any, args as any);
    const read = () => {
      try {
        const value = watch.localQueryResult();
        if (value === undefined) return;
        publish({ data: value, error: null });
      } catch (error) {
        // An error replaces nothing that was readable before: what was shown
        // stays, with the error beside it.
        publish({ data: entry.snapshot.data, error });
      }
    };
    const unsubscribe = watch.onUpdate(read);
    read();
    entry.stop = () => { unsubscribe(); lease.close(); };
  } catch (error) {
    entry.snapshot = { data: undefined, error };
  }
  entries.set(key, entry);
  return entry;
}

function releaseEntry(key: string, entry: Entry): void {
  if (entry.listeners.size > 0 || entry.linger !== null) return;
  entry.linger = setTimeout(() => {
    entry.linger = null;
    if (entry.listeners.size > 0 || entries.get(key) !== entry) return;
    entries.delete(key);
    entry.stop();
  }, LINGER_MS);
}

// args null: nothing to read (signed out, or not this page's turn).
export function useLiveQuery<T>(session: unknown, name: LiveQueryName, args: Record<string, unknown> | null): LiveResult<T> {
  const subject = session ? resolveAuthSubject(session as AuthSessionLike) : null;
  const key = subject && args ? liveQueryKey(subject, name, args) : null;
  const gen = useSyncExternalStore(subscribeGeneration, () => generation, () => 0);
  const subscribe = useCallback((onChange: () => void) => {
    if (!key || !args) return () => undefined;
    const entry = entries.get(key) ?? open(key, session, name, args);
    if (entry.linger !== null) { clearTimeout(entry.linger); entry.linger = null; }
    entry.listeners.add(onChange);
    // A kept answer may have changed while nobody was looking.
    onChange();
    return () => {
      entry.listeners.delete(onChange);
      releaseEntry(key, entry);
    };
    // The key holds the session's person, the name and the arguments; gen
    // changes when that person's connection was closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gen]);
  const getSnapshot = useCallback(
    () => (key ? (entries.get(key)?.snapshot as LiveResult<T> | undefined) ?? NOTHING : NOTHING),
    [key],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => NOTHING);
}

// For a page that keeps the read's answer in its own state: hand it every
// live answer, the first included, so what it shows is the live answer itself
// (nothing can be missed between a load of its own and the subscription).
export function useLiveAnswer<T>(session: unknown, name: LiveQueryName, args: Record<string, unknown> | null, onAnswer: (data: T) => void): void {
  const { data } = useLiveQuery<T>(session, name, args);
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;
  useEffect(() => {
    if (data !== undefined) onAnswerRef.current(data);
  }, [data]);
}

// For a page whose own load does more than keep the answer (paging, several
// reads, its own errors): watch the same read live and load again when its
// answer changes. An answer equal to the last one is not a change. The first
// answer only sets what "changed" is measured from, so an edit landing in the
// moment between the page's load and that first answer waits for the next
// change; useLiveAnswer has no such moment.
export function useLiveChange(session: unknown, name: LiveQueryName, args: Record<string, unknown> | null, onChange: () => void): void {
  const { data } = useLiveQuery<unknown>(session, name, args);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const key = args ? `${name}\u0000${stable(args)}` : null;
  const seen = useRef<LiveChangeSeen>({ key: null, answer: null });
  useEffect(() => {
    const step = liveChangeStep(seen.current, key, data);
    seen.current = step.seen;
    if (step.changed) onChangeRef.current();
  }, [data, key]);
}

// What useLiveChange remembers, and whether a new answer is a change: not
// the first answer for a read, and not one equal to the last.
export type LiveChangeSeen = { key: string | null; answer: string | null };
export function liveChangeStep(seen: LiveChangeSeen, key: string | null, data: unknown): { seen: LiveChangeSeen; changed: boolean } {
  const current = seen.key === key ? seen : { key, answer: null };
  if (data === undefined) return { seen: current, changed: false };
  const answer = stable(data);
  return { seen: { key, answer }, changed: current.answer !== null && current.answer !== answer };
}
