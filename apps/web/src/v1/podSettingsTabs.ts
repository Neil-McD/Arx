// Which tabs a pod's settings has for this person, and which one is open (in
// the address as ?settings=<tab>, so Back closes the window and a link opens it).
import { useSyncExternalStore } from "react";

export type PodSettingsTab = "pitch" | "people" | "access" | "pod";
export const POD_SETTINGS_TABS: readonly PodSettingsTab[] = ["pitch", "people", "access", "pod"];

// The pod's hosts get Pitch and People; the builder gets all four.
export function podSettingsTabsFor(pod: { can_manage: boolean; can_edit: boolean }): PodSettingsTab[] {
  if (pod.can_edit) return [...POD_SETTINGS_TABS];
  if (pod.can_manage) return ["pitch", "people"];
  return [];
}

export function podSettingsTabFrom(search: string): PodSettingsTab | null {
  const value = new URLSearchParams(search).get("settings");
  return (POD_SETTINGS_TABS as readonly string[]).includes(value ?? "") ? value as PodSettingsTab : null;
}

const CHANGE = "polynet:pod-settings";
function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => { window.removeEventListener("popstate", onChange); window.removeEventListener(CHANGE, onChange); };
}

function withTab(tab: PodSettingsTab | null): string {
  const url = new URL(window.location.href);
  if (tab) url.searchParams.set("settings", tab); else url.searchParams.delete("settings");
  return `${url.pathname}${url.search}${url.hash}`;
}

// Open on a tab (a step Back returns from), switch tabs (no new step), or close.
export function usePodSettingsTab(): { tab: PodSettingsTab | null; open: (tab: PodSettingsTab) => void; close: () => void } {
  const tab = useSyncExternalStore(subscribe, () => podSettingsTabFrom(window.location.search), () => null);
  const go = (next: PodSettingsTab | null, push: boolean) => {
    const path = withTab(next);
    if (push) window.history.pushState(window.history.state, "", path); else window.history.replaceState(window.history.state, "", path);
    window.dispatchEvent(new Event(CHANGE));
  };
  return {
    tab,
    open: (next) => go(next, tab === null),
    close: () => go(null, false),
  };
}
