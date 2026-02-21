import type { AppPage, AppView, CommunityTab, SettingsPage } from "./appShellNavigation";

export type NavSnapshotBase = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communityId: string | null;
  communityTab: CommunityTab;
  threadId: string | null;
  workspaceWantsNewChat?: boolean;
};

export function navSnapshotsEqual(
  a: NavSnapshotBase,
  b: NavSnapshotBase,
  opts?: { includeWorkspaceWantsNewChat?: boolean },
): boolean {
  if (
    a.page !== b.page ||
    a.view !== b.view ||
    a.settingsPage !== b.settingsPage ||
    a.communityId !== b.communityId ||
    a.communityTab !== b.communityTab ||
    a.threadId !== b.threadId
  ) {
    return false;
  }
  if (opts?.includeWorkspaceWantsNewChat) {
    return (a.workspaceWantsNewChat ?? false) === (b.workspaceWantsNewChat ?? false);
  }
  return true;
}

export function pushUniqueNavSnapshot(
  stack: NavSnapshotBase[],
  snapshot: NavSnapshotBase,
  opts?: { includeWorkspaceWantsNewChat?: boolean },
): void {
  const last = stack[stack.length - 1] ?? null;
  if (last && navSnapshotsEqual(last, snapshot, opts)) return;
  stack.push(snapshot);
}

export function popNavSnapshot(stack: NavSnapshotBase[]): NavSnapshotBase | null {
  return stack.pop() ?? null;
}

export type BackTargetLabel = "workspace" | "community" | "discover" | "settings";

export function formatBackTargetLabel(snapshot: Pick<NavSnapshotBase, "page" | "view">): BackTargetLabel {
  if (snapshot.page === "discover") return "discover";
  if (snapshot.page === "community") return "community";
  if (snapshot.view === "settings") return "settings";
  return "workspace";
}
