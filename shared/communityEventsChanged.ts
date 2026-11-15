// Home keeps running while another page is open, so its "Next up" has to be
// told when an event is added, changed or cancelled elsewhere in the app.
// Whoever changes an event announces it; whoever shows events listens.
const COMMUNITY_EVENTS_CHANGED = "polynet:community-events-changed";

export function announceCommunityEventsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COMMUNITY_EVENTS_CHANGED));
}

export function onCommunityEventsChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(COMMUNITY_EVENTS_CHANGED, listener);
  return () => window.removeEventListener(COMMUNITY_EVENTS_CHANGED, listener);
}
