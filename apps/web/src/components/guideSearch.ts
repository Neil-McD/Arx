// Design system v1: "Search or ask" (the mock's top bar) and the ⌘K shortcut.
// They open the command palette where one is on the page (beside the
// community's left column); elsewhere they open your guide on Home.
export const OPEN_GUIDE_EVENT = "polynet:open-guide";
// The palette's "Ask your guide": open Home and send the question.
export const ASK_GUIDE_EVENT = "polynet:ask-guide";

let paletteToggle: (() => void) | null = null;

// The palette registers itself while it is mounted; the returned function
// unregisters it.
export function registerCommandPalette(toggle: () => void): () => void {
  paletteToggle = toggle;
  return () => {
    if (paletteToggle === toggle) paletteToggle = null;
  };
}

export function openGuideFromSearch(): void {
  if (paletteToggle) {
    paletteToggle();
    return;
  }
  window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT));
}

export type AskGuideRequest = { question: string; communityId: string };

// The question belongs to the community it was asked in.
export function askGuide(question: string, communityId: string | null | undefined): void {
  const text = question.trim();
  if (!text || !communityId) return;
  window.dispatchEvent(new CustomEvent<AskGuideRequest>(ASK_GUIDE_EVENT, { detail: { question: text, communityId } }));
}

export function isGuideSearchShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
}
