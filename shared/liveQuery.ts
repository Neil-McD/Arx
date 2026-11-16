import { useCallback, useSyncExternalStore } from "react";
import { anyApi } from "convex/server";
import { resolveAuthSubject, type AuthSessionLike } from "./authSession";
import { acquireAuthenticatedConvexRealtimeClient } from "./convexRealtimeAuth";
import { requireConvexUrl } from "./convexAuthenticatedClient";

// One way for a page to read data that stays true (docs/specs/
// web-architecture-end-state.md, step 3). A page names a server query and its
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

function functionRef(name: string): unknown {
  const [module, fn] = name.split(":");
  if (!module || !fn) throw new Error(`live_query_name_invalid:${name}`);
  return (anyApi as any)[module][fn];
}

function open(key: string, session: unknown, name: string, args: Record<string, unknown>): Entry {
  const entry: Entry = { snapshot: NOTHING, listeners: new Set(), stop: () => undefined, linger: null };
  const publish = (next: LiveResult<unknown>) => {
    entry.snapshot = next;
    for (const listener of [...entry.listeners]) listener();
  };
  try {
    const lease = acquireAuthenticatedConvexRealtimeClient({ convexUrl: requireConvexUrl(), session });
    const watch = lease.client.watchQuery(functionRef(name) as any, args as any);
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
export function useLiveQuery<T>(session: unknown, name: string, args: Record<string, unknown> | null): LiveResult<T> {
  const subject = session ? resolveAuthSubject(session as AuthSessionLike) : null;
  const key = subject && args ? liveQueryKey(subject, name, args) : null;
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
    // The key holds the session's person, the name and the arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const getSnapshot = useCallback(
    () => (key ? (entries.get(key)?.snapshot as LiveResult<T> | undefined) ?? NOTHING : NOTHING),
    [key],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => NOTHING);
}

// Tests and sign-out: forget every answer.
export function closeAllLiveQueries(): void {
  for (const [key, entry] of entries) {
    if (entry.linger !== null) clearTimeout(entry.linger);
    entries.delete(key);
    entry.stop();
  }
}
