// Design system v1: "Search or ask" (the mock's top bar) and the ⌘K shortcut.
// There is no search yet, so it opens your guide on Home, ready to ask.
export const OPEN_GUIDE_EVENT = "polynet:open-guide";

export function openGuideFromSearch(): void {
  window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT));
}

export function isGuideSearchShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
}
