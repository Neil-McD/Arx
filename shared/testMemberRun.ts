// A test run: an owner's browser tab that goes through their community as a
// test member they made. The owner stays signed in; this tab sends the test
// member's subject instead of theirs, and the server accepts it only from that
// owner. Kept per tab (sessionStorage), so the owner's other tabs stay theirs.
// Watched inside the owner's Test run page (an iframe), it's kept on the
// frame's name instead: a frame shares its page's sessionStorage, and the
// owner's page must stay theirs.

export const TEST_MEMBER_RUN_PARAM = "test_run";
const STORAGE_KEY = "polynet:test-run:v1";
const SUBJECT_PREFIX = "polynet-test:";

const FRAME_PREFIX = "polynet-test-run:";

export type TestMemberRun = { authSubject: string; label: string };

/** True in a frame inside another page of the app (Watch a test run). */
export function isEmbeddedTestRunFrame(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top && window.name.startsWith(FRAME_PREFIX);
  } catch {
    return false;
  }
}

/** The name the owner's page gives the frame that shows the community as a test member. */
export function testMemberRunFrameName(run: TestMemberRun): string {
  return `${FRAME_PREFIX}${JSON.stringify({ authSubject: run.authSubject, label: run.label.slice(0, 80) })}`;
}

function parseRun(raw: string | null | undefined): TestMemberRun | null {
  try {
    const parsed = JSON.parse(raw ?? "null");
    const authSubject = typeof parsed?.authSubject === "string" ? parsed.authSubject : "";
    if (!authSubject.startsWith(SUBJECT_PREFIX)) return null;
    return { authSubject, label: typeof parsed.label === "string" && parsed.label ? parsed.label : "Test member" };
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function readTestMemberRun(): TestMemberRun | null {
  if (isEmbeddedTestRunFrame()) return parseRun(window.name.slice(FRAME_PREFIX.length));
  try {
    return parseRun(storage()?.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Takes ?test_run=<subject>&test_label=<name> off the address and keeps it for this tab. */
export function captureTestMemberRunFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const authSubject = url.searchParams.get(TEST_MEMBER_RUN_PARAM) ?? "";
  if (!url.searchParams.has(TEST_MEMBER_RUN_PARAM)) return;
  const label = url.searchParams.get("test_label") ?? "";
  url.searchParams.delete(TEST_MEMBER_RUN_PARAM);
  url.searchParams.delete("test_label");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  if (!authSubject.startsWith(SUBJECT_PREFIX) || isEmbeddedTestRunFrame()) return;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify({ authSubject, label: label.slice(0, 80) }));
  } catch {
    // Without storage the tab stays the owner's.
  }
}

export function clearTestMemberRun(): void {
  if (isEmbeddedTestRunFrame()) { window.name = ""; return; }
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing kept.
  }
}

/** The address that opens a community as a test member, in a new tab. */
export function buildTestMemberRunUrl(communitySlug: string, run: TestMemberRun): string {
  const params = new URLSearchParams({ [TEST_MEMBER_RUN_PARAM]: run.authSubject, test_label: run.label });
  return `/c/${encodeURIComponent(communitySlug)}/chat?${params.toString()}`;
}

/** In a test-run tab, the signed-in user is the test member: no email, name or photo of the owner's. */
export function applyTestMemberRun<S extends { user: { id: string; email?: string; displayName?: string; avatarUrl?: string } }>(session: S): S {
  const run = readTestMemberRun();
  if (!run) return session;
  return { ...session, user: { id: run.authSubject, displayName: run.label } };
}
