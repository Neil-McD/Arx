// Single merge policy for the client profile map. Writers may only add or
// update the fields they actually carry: `undefined` means "not carried,
// preserve the existing value" while an explicit `null` means "server cleared
// this". Prevents partial writers from silently erasing fields another loader
// hydrated (the premium-badge flicker class of bug).

import { areEquivalentValues } from "./reuseEquivalentValue";

type ProfileEntryLike = { user_id: string };

export function mergeUserProfileEntry<T extends ProfileEntryLike>(
  previous: T | undefined,
  incoming: Partial<T> & ProfileEntryLike,
): T {
  const next: Record<string, unknown> = { ...(previous ?? {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) next[key] = value;
  }
  return previous && areEquivalentValues(previous, next) ? previous : next as T;
}

export function mergeUserProfileEntries<T extends ProfileEntryLike>(
  previous: Record<string, T>,
  rows: ReadonlyArray<Partial<T> & ProfileEntryLike>,
): Record<string, T> {
  if (rows.length === 0) return previous;
  let next = previous;
  for (const row of rows) {
    const userId = String(row.user_id ?? "").trim();
    if (!userId) continue;
    const previousEntry = previous[userId];
    const nextEntry = mergeUserProfileEntry(previousEntry, row);
    if (nextEntry === previousEntry) continue;
    if (next === previous) next = { ...previous };
    next[userId] = nextEntry;
  }
  return next;
}
