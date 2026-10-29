import { useEffect, useRef, useState } from "react";
import type { AuthSession } from "../auth";
import {
  getCloudMyTestRun,
  reportCloudAutoplayScreenStep,
  subscribeCloudMyTestRun,
  type CloudAutoplayScreenStep,
  type CloudMyTestRunAutoplay,
} from "../../../../shared/cloudCommunityTestMembersGateway";
import { runScreenStep } from "./testRunScreenDriver";
import { clearTestMemberRun, isEmbeddedTestRunFrame, readTestMemberRun } from "../../../../shared/testMemberRun";
import "./WebCommunityTestRun.css";

const ENDED_EVENT = "polynet:test-run-ended";
const AUTOPLAY_EVENT = "polynet:test-run-autoplay";
const HIGHLIGHT_MS = 2400;
const CHECK_EVERY_MS = 30_000;

/** Told to the owner's Test run page when it shows this run in a frame. */
export const TEST_RUN_FRAME_READY = "polynet:test-run-frame-ready";
export const TEST_RUN_FRAME_EXIT = "polynet:test-run-frame-exit";

function tellOwnerPage(type: string) {
  if (isEmbeddedTestRunFrame()) window.parent.postMessage({ type }, window.location.origin);
}

function exitTestRun() {
  // Watched in the owner's page: that page closes the frame.
  if (isEmbeddedTestRunFrame()) { tellOwnerPage(TEST_RUN_FRAME_EXIT); return; }
  clearTestMemberRun();
  // A tab the Test run page opened just closes; any other goes back to being the owner's.
  window.close();
  window.location.reload();
}

/** Asks the server who this test-run tab is acting as; tells the bar when the run is over. */
export function useTestMemberRunCheck(session: AuthSession | null, ensureSession: (session?: AuthSession | null, source?: string) => Promise<AuthSession | null>) {
  const active = Boolean(readTestMemberRun());
  const ensureRef = useRef(ensureSession);
  ensureRef.current = ensureSession;
  useEffect(() => {
    if (!active || !session) return;
    let alive = true;
    const check = async () => {
      try {
        const ready = await ensureRef.current(session, "test_run_check");
        if (!ready) return;
        const run = await getCloudMyTestRun(ready);
        if (alive && !run) window.dispatchEvent(new Event(ENDED_EVENT));
      } catch {
        if (alive) window.dispatchEvent(new Event(ENDED_EVENT));
      }
    };
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void check();
    }, CHECK_EVERY_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [active, session]);
}

const DRIVING_EVENT = "polynet:test-run-driving";
/** Steps this tab did on screen, so the bar doesn't replay them when they come back as done. */
const drivenSteps = new Set<string>();

/**
 * While Autoplay plays, this tab follows it. On screen, it does each step it's
 * handed in the real member screens and tells the server how that went; in the
 * background, the bar says each step and the page goes there.
 */
export function useTestMemberAutoplayFollow(session: AuthSession | null, ensureSession: (session?: AuthSession | null, source?: string) => Promise<AuthSession | null>) {
  const active = Boolean(readTestMemberRun());
  const ensureRef = useRef(ensureSession);
  ensureRef.current = ensureSession;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const driving = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !session) return;
    const report = async (id: string, phase: "seen" | "finished", ok?: boolean, detail?: string) => {
      try {
        const ready = await ensureRef.current(sessionRef.current, "test_run_autoplay_report");
        if (ready) await reportCloudAutoplayScreenStep(ready, id, phase, ok, detail);
      } catch { /* The owner's page does the step itself when no report comes. */ }
    };
    const drive = async (step: CloudAutoplayScreenStep) => {
      driving.current = step.id;
      drivenSteps.add(step.text);
      window.dispatchEvent(new CustomEvent(DRIVING_EVENT, { detail: step.text }));
      void report(step.id, "seen");
      const problem = await runScreenStep(step, readTestMemberRun()?.label ?? "Test member");
      await report(step.id, "finished", problem === null, problem ?? undefined);
      window.dispatchEvent(new CustomEvent(DRIVING_EVENT, { detail: null }));
      driving.current = null;
    };
    return subscribeCloudMyTestRun({
      session, ensureSession: (current, source) => ensureRef.current(current, source),
      update: (run) => {
        // The owner's page waits for this before it starts Autoplay on screen.
        tellOwnerPage(TEST_RUN_FRAME_READY);
        window.dispatchEvent(new CustomEvent(AUTOPLAY_EVENT, { detail: run?.autoplay ?? null }));
        const step = run?.autoplay_step;
        if (step && !driving.current && !drivenSteps.has(`id:${step.id}`)) { drivenSteps.add(`id:${step.id}`); void drive(step); }
      },
      error: () => {},
    });
  }, [active, session]);
}

/** Goes where Autoplay acted, in this tab, without a reload. */
function followTo(path: string | null) {
  if (!path || window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Outlines what Autoplay pressed, found by its words, once the page has drawn it. */
function highlightTarget(target: string | null) {
  const words = String(target ?? "").trim().toLowerCase();
  if (!words) return () => {};
  let outlined: HTMLElement | null = null;
  const find = () => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, a, h1, h2, h3, label, [role='button']"))
      .filter((node) => !node.closest(".test-run-bar") && node.offsetParent !== null);
    return candidates.find((node) => node.innerText.trim().toLowerCase() === words)
      ?? candidates.find((node) => node.innerText.trim().toLowerCase().includes(words)) ?? null;
  };
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    const node = find();
    if (!node && tries < 10) return;
    window.clearInterval(timer);
    if (!node) return;
    outlined = node;
    node.classList.add("test-run-highlight");
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => node.classList.remove("test-run-highlight"), HIGHLIGHT_MS);
  }, 150);
  return () => { window.clearInterval(timer); outlined?.classList.remove("test-run-highlight"); };
}

// Shown on every page of a test-run tab, whatever the app is doing, so the
// owner always knows this tab is not them and can leave it.
export function WebTestRunBar() {
  const [run] = useState(readTestMemberRun);
  const [ended, setEnded] = useState(false);
  const [beat, setBeat] = useState<CloudMyTestRunAutoplay | null>(null);
  const [doing, setDoing] = useState<string | null>(null);
  useEffect(() => {
    const onEnded = () => setEnded(true);
    const onAutoplay = (event: Event) => setBeat((event as CustomEvent<CloudMyTestRunAutoplay | null>).detail);
    const onDriving = (event: Event) => setDoing((event as CustomEvent<string | null>).detail);
    window.addEventListener(ENDED_EVENT, onEnded);
    window.addEventListener(AUTOPLAY_EVENT, onAutoplay);
    window.addEventListener(DRIVING_EVENT, onDriving);
    return () => {
      window.removeEventListener(ENDED_EVENT, onEnded);
      window.removeEventListener(AUTOPLAY_EVENT, onAutoplay);
      window.removeEventListener(DRIVING_EVENT, onDriving);
    };
  }, []);
  useEffect(() => {
    // A step this tab did on screen was already shown; a background one is shown now.
    if (!beat || drivenSteps.has(beat.text)) return;
    followTo(beat.path);
    return highlightTarget(beat.target);
  }, [beat?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!run) return null;
  return <div className={`test-run-bar${ended ? " is-ended" : ""}`} role="region" aria-label="Test run">
    <span>{ended ? <>This test run has ended.</>
      : doing ? <><strong>Autoplay is doing:</strong> {doing}</>
      : beat ? <><strong>Autoplay:</strong> {beat.text}</>
      : <>Testing as <strong>{run.label}</strong>. Nothing here is a real member.</>}</span>
    <button type="button" onClick={exitTestRun}>Exit test</button>
  </div>;
}
