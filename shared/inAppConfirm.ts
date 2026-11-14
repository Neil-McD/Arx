// One way to ask "are you sure?" that is the app's own, not the browser's box
// (Neil, Nov 14: the browser's pop-ups go). A page asks with askInApp and gets
// a promise; the one host on screen (v1/KitConfirm) draws the question. With
// no host on screen (the classic design, tests) it falls back to the browser.

export type InAppQuestion = {
  message: string;
  // The word on the button that goes ahead ("Delete"), and the one that doesn't.
  yes: string;
  no?: string;
  // Going ahead removes something.
  danger?: boolean;
};

type Host = (question: InAppQuestion, answer: (yes: boolean) => void) => void;

let host: Host | null = null;

export function registerInAppConfirmHost(next: Host): () => void {
  host = next;
  return () => { if (host === next) host = null; };
}

export function askInApp(question: InAppQuestion): Promise<boolean> {
  if (!host) return Promise.resolve(typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(question.message) : false);
  const current = host;
  return new Promise((resolve) => current(question, resolve));
}
