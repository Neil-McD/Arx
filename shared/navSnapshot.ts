import type { AppPage, AppView, CommunityTab, SettingsPage } from "./appShellNavigation";

export type NavSnapshotBase = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communitySlug?: string | null;
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
    (a.communitySlug ?? null) !== (b.communitySlug ?? null) ||
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

export type BackTargetLabel =
  | "workspace"
  | "community"
  | "discover"
  | "apps"
  | "skills"
  | "docs"
  | "settings";

function formatDiscoverRouteBackTargetLabel(routePath: string | null | undefined): BackTargetLabel | null {
  const raw = String(routePath ?? "").trim();
  if (!raw) return null;
  try {
    const path = new URL(raw, "http://local.polynet").pathname;
    const segments = path.split("/").filter(Boolean);
    const routeSegments = segments[0] === "m" ? segments.slice(1) : segments;
    if (routeSegments[0] !== "discover") return null;
    if (routeSegments[1] === "apps") return "apps";
    if (routeSegments[1] === "skills") return "skills";
    return "discover";
  } catch {
    return null;
  }
}

export function formatBackTargetLabel(
  snapshot: Pick<NavSnapshotBase, "page" | "view"> & { routePath?: string | null },
): BackTargetLabel {
  if (snapshot.page === "discover") {
    return formatDiscoverRouteBackTargetLabel(snapshot.routePath) ?? "discover";
  }
  if (snapshot.page === "docs") return "docs";
  if (snapshot.page === "community") return "community";
  if (snapshot.view === "settings") return "settings";
  return "workspace";
}
