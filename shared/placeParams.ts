// Where you are inside a page (the open thread, the lesson, a view of
// Knowledge) rides on the address as a small tag, so a refresh or a shared
// link comes back to the same place. The page's own address still decides the
// page: these tags only survive while that address stays the same.
export const PLACE_PARAMS = ["thread", "lesson", "view", "open"] as const;
export type PlaceParam = (typeof PLACE_PARAMS)[number];

const SAFE_VALUE = /^[A-Za-z0-9_-]{1,80}$/;

export function readPlaceParamFrom(search: string, key: PlaceParam): string | null {
  const value = new URLSearchParams(search).get(key);
  return value && SAFE_VALUE.test(value) ? value : null;
}

// The search string with one tag set or removed; everything else is kept.
export function searchWithPlaceParam(search: string, key: PlaceParam, value: string | null): string {
  const params = new URLSearchParams(search);
  if (value && SAFE_VALUE.test(value)) params.set(key, value);
  else params.delete(key);
  const text = params.toString();
  return text ? `?${text}` : "";
}

// The app writes the page's address from its own state. When that address is
// the page already showing, its tags stay; on any other page they are dropped.
export function keepPlaceParams(nextPath: string, currentPathname: string, currentSearch: string): string {
  const [nextPathname, nextSearch = ""] = nextPath.split("?");
  if (nextPathname !== currentPathname) return nextPath;
  const params = new URLSearchParams(nextSearch);
  const current = new URLSearchParams(currentSearch);
  for (const key of PLACE_PARAMS) {
    const value = current.get(key);
    if (value && SAFE_VALUE.test(value) && !params.has(key)) params.set(key, value);
  }
  const text = params.toString();
  return text ? `${nextPathname}?${text}` : nextPathname;
}

export function readPlaceParam(key: PlaceParam): string | null {
  if (typeof window === "undefined") return null;
  return readPlaceParamFrom(window.location.search, key);
}

export function writePlaceParam(key: PlaceParam, value: string | null): void {
  if (typeof window === "undefined") return;
  const search = searchWithPlaceParam(window.location.search, key, value);
  if (search === window.location.search) return;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
}

// Members and Inbox open over the page you were on (?open=members, ?open=inbox).
// Each keeps only its own word: closing one never clears the other's.
export function writeOpenPlace(place: "members" | "inbox", open: boolean): void {
  if (open) writePlaceParam("open", place);
  else if (readPlaceParam("open") === place) writePlaceParam("open", null);
}
