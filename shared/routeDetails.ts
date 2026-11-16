import { useSyncExternalStore } from "react";
import {
  MOBILE_SHELL_PATH_PREFIX,
  buildAppRoutePath,
  parseAppRouteFromPathname,
  readRouteId,
  stripShellVariantFromPathname,
  withoutCommunityRouteDetails,
  type AppRoutePathState,
  type CommunityKnowledgeView,
} from "./webAppRouteState";

// Where you are inside a page is part of its address (shared/webAppRouteState):
// /c/<slug>/chat/<channel>/<thread>, /c/<slug>/resources/<course>/<lesson>,
// /c/<slug>/resources/guide|brain. The page reads it from the address and
// writes it back when you move; opening one adds a history entry, so the back
// button steps back through them.
//
// Before Nov 17 these rode on the query (?thread=, ?lesson=, ?view=). Those
// links still open the same place, and are rewritten to the path.

export type RouteDetailKey = "thread" | "lesson" | "view";
const LEGACY_TAGS: RouteDetailKey[] = ["thread", "lesson", "view"];
const CHANGE_EVENT = "polynet:route-detail";

type Split = { prefix: string; pathname: string; search: string; hash: string };

function split(path: string): Split {
  const parsed = new URL(String(path || "/"), "http://local.arx");
  const isPhone = parsed.pathname === MOBILE_SHELL_PATH_PREFIX || parsed.pathname.startsWith(`${MOBILE_SHELL_PATH_PREFIX}/`);
  const stripped = new URL(stripShellVariantFromPathname(parsed.pathname || "/"), "http://local.arx");
  return { prefix: isPhone ? MOBILE_SHELL_PATH_PREFIX : "", pathname: stripped.pathname || "/", search: parsed.search, hash: parsed.hash };
}

function join(parts: { prefix: string; pathname: string; search: string; hash: string }): string {
  const pathname = parts.prefix ? (parts.pathname === "/" ? parts.prefix : `${parts.prefix}${parts.pathname}`) : parts.pathname;
  return `${pathname}${parts.search}${parts.hash}`;
}

function withoutLegacyTags(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of LEGACY_TAGS) params.delete(key);
  const text = params.toString();
  return text ? `?${text}` : "";
}

// The route at an address, with an old ?thread= / ?lesson= / ?view= tag read
// as the detail it stood for.
export function readRouteAt(path: string): AppRoutePathState | null {
  const parts = split(path);
  const route = parseAppRouteFromPathname(parts.pathname);
  if (!route || route.page !== "community") return route;
  const tags = new URLSearchParams(parts.search);
  const legacyView = tags.get("view");
  return {
    ...route,
    communityThreadId: route.communityThreadId ?? (route.communityTab === "chat" ? readRouteId(tags.get("thread")) : null),
    communityLessonId: route.communityLessonId ?? (route.communityResourceModuleId ? readRouteId(tags.get("lesson")) : null),
    communityKnowledgeView: route.communityKnowledgeView
      ?? (route.communityTab === "resources" && !route.communityResourceModuleId && (legacyView === "guide" || legacyView === "brain") ? legacyView : null),
  };
}

function detailOf(route: AppRoutePathState | null, key: RouteDetailKey): string | null {
  if (!route) return null;
  if (key === "thread") return route.communityThreadId ?? null;
  if (key === "lesson") return route.communityLessonId ?? null;
  return route.communityKnowledgeView ?? null;
}

export function readRouteDetailAt(path: string, key: RouteDetailKey): string | null {
  return detailOf(readRouteAt(path), key);
}

// The same address with one detail set or cleared. Null when the page there
// has no such detail (a thread is not part of Events).
export function pathWithRouteDetail(path: string, key: RouteDetailKey, value: string | null): string | null {
  const parts = split(path);
  const route = readRouteAt(path);
  if (!route || route.page !== "community") return null;
  const next: AppRoutePathState = { ...route };
  if (key === "thread") next.communityThreadId = readRouteId(value);
  else if (key === "lesson") next.communityLessonId = readRouteId(value);
  else next.communityKnowledgeView = value === "guide" || value === "brain" ? (value as CommunityKnowledgeView) : null;
  const built = buildAppRoutePath(next);
  if (!built) return null;
  return join({ prefix: parts.prefix, pathname: built, search: withoutLegacyTags(parts.search), hash: parts.hash });
}

// The app writes the page's address from its own state, which holds no
// details. On the same page they are kept; on another page they are dropped.
// Old tags become the path here, once.
export function carryRouteDetails(nextPath: string, currentPath: string): string {
  const next = split(nextPath);
  const nextRoute = parseAppRouteFromPathname(next.pathname);
  const current = readRouteAt(currentPath);
  if (!nextRoute || !current || nextRoute.page !== "community" || current.page !== "community") return nextPath;
  const nextBase = buildAppRoutePath(withoutCommunityRouteDetails(nextRoute));
  const currentBase = buildAppRoutePath(withoutCommunityRouteDetails(current));
  if (!nextBase || nextBase !== currentBase) return nextPath;
  const built = buildAppRoutePath({
    ...nextRoute,
    communityThreadId: current.communityThreadId ?? null,
    communityLessonId: current.communityLessonId ?? null,
    communityKnowledgeView: current.communityKnowledgeView ?? null,
  });
  return built ? join({ ...next, pathname: built, search: withoutLegacyTags(next.search) }) : nextPath;
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function readRouteDetail(key: RouteDetailKey): string | null {
  if (typeof window === "undefined") return null;
  return readRouteDetailAt(currentPath(), key);
}

// Opening a thread, a lesson or a view is a step you can go back from.
// `replace`: filling in a detail the page chose for you (the next lesson) is
// not a step to go back through.
export function writeRouteDetail(key: RouteDetailKey, value: string | null, options: { replace?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  const now = currentPath();
  const next = pathWithRouteDetail(now, key, value);
  if (!next || next === now) return;
  // The first time an old tag is rewritten, nothing is opened or closed.
  const sameDetail = readRouteDetailAt(now, key) === readRouteDetailAt(next, key);
  if (sameDetail || options.replace) window.history.replaceState(window.history.state, "", next);
  else window.history.pushState(window.history.state, "", next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// The detail in the address now; changes with the back button too.
export function useRouteDetail(key: RouteDetailKey): string | null {
  return useSyncExternalStore(subscribe, () => readRouteDetail(key), () => null);
}
