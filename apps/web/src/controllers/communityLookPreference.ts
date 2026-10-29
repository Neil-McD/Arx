import { useSyncExternalStore } from "react";

// Whether a member's Light or Dark pick also applies to communities made in
// one version (where they then see its matching version). Off until the
// member picks Light or Dark themselves, so a mode stored before this existed
// doesn't repaint a community its owner made light or dark.
const STORAGE_KEY = "polynet-community-look";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "mine";
  } catch {
    return false;
  }
}

let current = typeof window === "undefined" ? false : read();

export function setMemberPickEverywhere(value: boolean) {
  current = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "mine" : "community");
  } catch {
    // Private windows: it holds for this visit.
  }
  for (const listener of listeners) listener();
}

export function useMemberPickEverywhere(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => false,
  );
}
