import type { AppPage, AppView, CommunityTab, SettingsPage } from "./appShellNavigation";

export type NavSnapshotBase = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communitySlug?: string | null;
  communityTab: CommunityTab;
};

export function navSnapshotsEqual(
  a: NavSnapshotBase,
  b: NavSnapshotBase,
): boolean {
  return !(
    a.page !== b.page ||
    a.view !== b.view ||
    a.settingsPage !== b.settingsPage ||
    (a.communitySlug ?? null) !== (b.communitySlug ?? null) ||
    a.communityTab !== b.communityTab
  );
}

export function pushUniqueNavSnapshot(
  stack: NavSnapshotBase[],
  snapshot: NavSnapshotBase,
): void {
  const last = stack[stack.length - 1] ?? null;
  if (last && navSnapshotsEqual(last, snapshot)) return;
  stack.push(snapshot);
}

export function popDistinctNavSnapshot<
  T extends NavSnapshotBase & { routePath?: string | null },
>(stack: T[], currentRoutePath: string): T | null {
  const normalizedCurrentRoutePath = currentRoutePath.trim();
  while (stack.length > 0) {
    const snapshot = stack.pop() ?? null;
    if (!snapshot) return null;
    const snapshotRoutePath = String(snapshot.routePath ?? "").trim();
    if (snapshotRoutePath && snapshotRoutePath === normalizedCurrentRoutePath) {
      continue;
    }
    return snapshot;
  }
  return null;
}

export type BackTargetLabel =
  | "community"
  | "discover"
  | "docs"
  | "settings";

export function formatBackTargetLabel(
  snapshot: Pick<NavSnapshotBase, "page" | "view"> & { routePath?: string | null },
): BackTargetLabel {
  if (snapshot.page === "discover") return "discover";
  if (snapshot.page === "docs") return "docs";
  if (snapshot.page === "community") return "community";
  if (snapshot.page === "settings" || snapshot.view === "settings") return "settings";
  return "community";
}
