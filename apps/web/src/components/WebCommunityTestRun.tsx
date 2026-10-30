import { CheckCircle2, ExternalLink, FastForward, FlaskConical, MousePointerClick, Pause, Play, RefreshCw, ShieldCheck, SkipForward, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AuthSession } from "../auth";
import {
  autoplayCloudTestMemberStep,
  endCloudCommunityTestMember,
  listCloudCommunityTestMembers,
  runCloudTestMemberTimedStepsNow,
  startCloudCommunityTestMember,
  subscribeCloudCommunityClientTimeline,
  subscribeCloudTestRunSequence,
  type CloudAutoplayBeat,
  type CloudCommunityClientTimelineEntry,
  type CloudCommunityTestMember,
  type CloudTestRunSequence,
  type CloudTestRunStep,
} from "../../../../shared/cloudCommunityTestMembersGateway";
import { buildTestMemberRunUrl, testMemberRunFrameName } from "../../../../shared/testMemberRun";
import { TEST_RUN_FRAME_EXIT, TEST_RUN_FRAME_READY } from "./WebTestRunBar";
import "./WebCommunityTestRun.css";

export type WebCommunityTestRunContext = {
  communityId: string;
  communitySlug: string;
  session: AuthSession;
  ensureSession: (session?: AuthSession | null, source?: string) => Promise<AuthSession | null>;
};

type Stage = { key: string; name: string };

type Props = WebCommunityTestRunContext & {
  /** The Workflow's stages, in order; a run can start in any of them. */
  stages: Stage[];
  /** Opens the member panel in Workflows (stage, forms, Run again). */
  onOpenRecord: (membershipId: string) => void;
  /** Inside Run history, whose table says when there are no test runs. */
  hideEmpty?: boolean;
};

export function testRunErrorMessage(error: unknown): string {
  const message = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
  if (message.includes("test_member_limit_reached")) return "You have 5 test runs going. End one to start another.";
  if (message.includes("test_member_stage_not_found")) return "That stage no longer exists. Reload Workflows and try again.";
  if (message.includes("community_forbidden")) return "Only the community's owner and admins can run tests.";
  return "Something went wrong. Nothing was changed.";
}

function timeOf(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Opens the community as the test member, in a tab of its own. */
function openTestTab(tab: Window | null, slug: string, member: { auth_subject: string; label: string }) {
  const url = buildTestMemberRunUrl(slug, { authSubject: member.auth_subject, label: member.label });
  if (tab && !tab.closed) tab.location.href = url;
  else window.open(url, "_blank");
}

/**
 * Starts a test member (at a stage, or joining at the first) and opens the
 * community as it. Call it straight from a click: the tab opens before the
 * server answers, so the browser doesn't block it.
 */
export async function startTestRunInNewTab(context: WebCommunityTestRunContext, milestoneKey?: string | null, replacingId?: string) {
  const tab = window.open("about:blank", "_blank");
  try {
    const ready = await context.ensureSession(context.session, "community_test_run_start");
    if (!ready) throw new Error("session_unavailable");
    if (replacingId) await endCloudCommunityTestMember(ready, context.communityId, replacingId);
    const started = await startCloudCommunityTestMember(ready, context.communityId, milestoneKey);
    openTestTab(tab, context.communitySlug, started);
    return started;
  } catch (caught) { tab?.close(); throw caught; }
}

// Workflows → Test run: the owner goes through their own community as a brand
// new member (or from any stage), reviews each step of the sequence as it
// fires, skips timed waits, then ends the run.
export function WebCommunityTestRun(props: Props) {
  const stageFieldId = useId();
  const [members, setMembers] = useState<CloudCommunityTestMember[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [startStage, setStartStage] = useState("");
  const [reload, setReload] = useState(0);
  const [watching, setWatching] = useState<string | null>(null);
  const { communityId, session, ensureSession } = props;

  useEffect(() => {
    let alive = true; setLoadError(false);
    void (async () => {
      try {
        const ready = await ensureSession(session, "community_test_run_list");
        if (!ready) throw new Error("session_unavailable");
        const result = await listCloudCommunityTestMembers(ready, communityId);
        if (!alive) return;
        setMembers(result.test_members);
        setSelected((current) => result.test_members.some((row) => row.id === current && row.mine) ? current
          : result.test_members.find((row) => row.mine)?.id ?? null);
      } catch { if (alive) setLoadError(true); }
    })();
    return () => { alive = false; };
  }, [communityId, session, ensureSession, reload]);

  const run = useCallback(async (key: string, work: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await work(); setReload((n) => n + 1); }
    catch (caught) { setError(testRunErrorMessage(caught)); }
    finally { setBusy(null); }
  }, []);

  const start = (milestoneKey: string, replacing?: CloudCommunityTestMember) => {
    const pending = startTestRunInNewTab(props, milestoneKey || null, replacing?.id);
    void run(replacing ? `restart:${replacing.id}` : "start", async () => { setSelected((await pending).id); });
  };
  // Watch: a new test member goes through the community by itself, shown
  // right here next to the sequence, so there's no second tab to arrange.
  const watchNew = () => void run("watch", async () => {
    const ready = await ensureSession(session, "community_test_run_start");
    if (!ready) throw new Error("session_unavailable");
    const started = await startCloudCommunityTestMember(ready, communityId, startStage || null);
    setSelected(started.id); setWatching(started.id);
  });
  const end = (member: CloudCommunityTestMember) => {
    if (!window.confirm(`End ${member.label}? Their answers, progress and record are deleted.`)) return;
    // Let go of its live views first, so nothing asks for a run that's gone.
    setWatching((id) => id === member.id ? null : id);
    setSelected((id) => id === member.id ? null : id);
    void run(`end:${member.id}`, async () => {
      const ready = await ensureSession(session, "community_test_run_end");
      if (!ready) throw new Error("session_unavailable");
      await endCloudCommunityTestMember(ready, communityId, member.id);
    });
  };

  const stageName = (key: string | null) => props.stages.find((stage) => stage.key === key)?.name ?? null;
  const mine = (members ?? []).filter((row) => row.mine);
  const others = (members ?? []).filter((row) => !row.mine);
  const current = mine.find((row) => row.id === selected) ?? null;
  const watched = mine.find((row) => row.id === watching && row.auth_subject) ?? null;
  const watchButton = <button type="button" className="pn-wf-primary" disabled={busy !== null || members === null} onClick={watchNew}>
    <Play size={15} aria-hidden="true" /> {busy === "watch" ? "Starting…" : "Watch a test run"}
  </button>;
  return <div className="test-run">
    <div className="pn-wf-section-head">
      <div>
        <h2>Test run</h2>
        <p>See your community the way a new member does, and check that every Workflow rule fires.</p>
      </div>
    </div>
    <div className="test-run-hero">
      <ol className="test-run-hero-steps">
        <li><span><strong>Click Watch a test run.</strong> A test member joins your community.</span></li>
        <li><span><strong>Watch them go through it.</strong> They fill in your forms, click through lessons and post by themselves, on screen.</span></li>
        <li><span><strong>Check the rules.</strong> Each Workflow rule ticks off beside them as it fires.</span></li>
      </ol>
      <div className="test-run-actions">
        {props.stages.length > 1 ? <div className="test-run-field">
          <select id={stageFieldId} aria-label="Where the test member starts" value={startStage} onChange={(event) => setStartStage(event.target.value)} disabled={busy !== null}>
            <option value="">As a new member (welcome sequence)</option>
            {props.stages.slice(1).map((stage, index) => <option key={stage.key} value={stage.key}>In stage {index + 2}: {stage.name}</option>)}
          </select>
        </div> : null}
        {watchButton}
        <button type="button" className="workflow-secondary-button" disabled={busy !== null || members === null} onClick={() => start(startStage)}>
          <ExternalLink size={14} aria-hidden="true" /> {busy === "start" ? "Starting…" : "Try it yourself in a new tab"}
        </button>
      </div>
    </div>
    <div className="pn-wf-callout test-run-safety">
      <span className="pn-wf-callout-icon" aria-hidden="true"><ShieldCheck size={20} strokeWidth={2} /></span>
      <span className="pn-wf-callout-text">
        <strong>Safe to try</strong>
        <small>The community opens as a test member, here or in a new tab, and you stay signed in as you. A test member is tagged Test on Clients
          and can't pay, message anyone or use Ask AI. Agent messages a Workflow sends, and the agent's replies when they write in its channel,
          do run and use your credits. Autoplay only previews them.
          {" "}Ending a run deletes everything it did.</small>
      </span>
    </div>
    {error ? <p role="alert" className="test-run-error">{error}</p> : null}
    {loadError ? <div role="alert" className="pn-wf-empty">
        <strong>Your test runs could not be loaded</strong>
        <button type="button" className="workflow-secondary-button" onClick={() => setReload((n) => n + 1)}>Retry</button>
      </div>
      : members === null ? <p role="status" className="pn-wf-muted">Loading…</p>
      : !mine.length ? props.hideEmpty ? null : <div className="pn-wf-empty">
        <span className="pn-wf-empty-icon" aria-hidden="true"><FlaskConical size={20} strokeWidth={2} /></span>
        <strong>No test runs yet</strong>
        <p>Watch one to see your welcome page and first steps the way a new member would.</p>
      </div>
      : <section className="pn-wf-list test-run-members" aria-label="Your test runs">
        {mine.map((member) => {
          const started = stageName(member.start_milestone_key);
          return <div key={member.id} className={`test-run-row${member.id === selected ? " is-selected" : ""}`}>
            <button type="button" className="test-run-member-name" aria-pressed={member.id === selected} onClick={() => setSelected(member.id)}>
              <span className="pn-wf-row-icon" aria-hidden="true"><FlaskConical size={16} strokeWidth={2} /></span>
              <span className="pn-wf-row-text">
                <strong>{member.label}</strong>
                <small>Started {timeOf(member.created_at)}</small>
              </span>
              <span className="pn-wf-badge">{started ? `From ${started}` : "New member"}</span>
            </button>
            <div className="test-run-member-actions">
              <button type="button" className="workflow-secondary-button" aria-label={`Watch ${member.label}`} disabled={busy !== null || !member.auth_subject}
                onClick={() => { setSelected(member.id); setWatching(member.id); }}>
                <Play size={14} aria-hidden="true" /> Watch
              </button>
              <button type="button" className="workflow-secondary-button" disabled={busy !== null || !member.auth_subject}
                onClick={() => member.auth_subject && openTestTab(null, props.communitySlug, { auth_subject: member.auth_subject, label: member.label })}>
                <ExternalLink size={14} aria-hidden="true" /> Open in a new tab
              </button>
              <button type="button" className="workflow-secondary-button" aria-label={`Start over as ${member.label}`} disabled={busy !== null} onClick={() => start(member.start_milestone_key ?? "", member)}>
                <RefreshCw size={14} aria-hidden="true" /> {busy === `restart:${member.id}` ? "Starting over…" : "Start over"}
              </button>
              <button type="button" className="workflow-secondary-button test-run-end" aria-label={`End ${member.label}`} disabled={busy !== null} onClick={() => end(member)}>
                {busy === `end:${member.id}` ? "Ending…" : "End"}
              </button>
            </div>
          </div>;
        })}
      </section>}
    {others.length ? <p className="pn-wf-muted test-run-help">{others.length === 1 ? "1 test run belongs" : `${others.length} test runs belong`} to another admin.</p> : null}
    {current ? <TestRunSequence key={`sequence:${current.id}`} {...props} member={current} /> : null}
    {current?.membership_id ? <TestRunTimeline key={`timeline:${current.id}`} {...props} member={current} membershipId={current.membership_id} /> : null}
    {watched ? <TestRunWatch key={`watch:${watched.id}`} {...props} member={watched} busy={busy !== null}
      onClose={() => setWatching(null)} onEnd={() => end(watched)} /> : null}
  </div>;
}

const STATUS_BADGE: Partial<Record<CloudTestRunStep["status"], string>> = {
  done: "is-on", failed: "is-failed", running: "is-edited", scheduled: "is-edited",
};

const STATUS_LABEL: Record<CloudTestRunStep["status"], string> = {
  done: "Done", failed: "Failed", running: "Running", scheduled: "Timed", waiting: "Waiting", skipped: "Didn't run", not_reached: "Not reached",
};

function TestRunSequence(props: Props & { member: CloudCommunityTestMember; watch?: { ready: boolean } }) {
  const [sequence, setSequence] = useState<CloudTestRunSequence | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setFailed(false);
    return subscribeCloudTestRunSequence({
      session: props.session, ensureSession: props.ensureSession, communityId: props.communityId, testMemberId: props.member.id,
      update: (next) => { setSequence(next); setFailed(false); }, error: () => setFailed(true),
    });
  }, [props.session, props.ensureSession, props.communityId, props.member.id, retry]);
  const skip = async (automationKey?: string) => {
    setBusy(automationKey ?? "all"); setError(null);
    try {
      const ready = await props.ensureSession(props.session, "community_test_run_skip_wait");
      if (!ready) throw new Error("session_unavailable");
      await runCloudTestMemberTimedStepsNow(ready, props.communityId, props.member.id, automationKey);
    } catch (caught) { setError(testRunErrorMessage(caught)); }
    finally { setBusy(null); }
  };
  const timed = sequence?.stages.find((stage) => stage.is_current)?.steps.filter((step) => step.status === "scheduled") ?? [];
  return <section className="test-run-sequence" aria-labelledby="test-run-sequence-title">
    <div className="pn-wf-section-head">
      <div>
        <h2 id="test-run-sequence-title">{props.member.label}'s sequence</h2>
        <p>{props.watch ? `Each rule ticks off as ${props.member.label} gets to it.`
          : "Each stage's rules in order. Updates live as the test member moves through the other tab."}</p>
      </div>
      {timed.length > 1 ? <button type="button" className="workflow-secondary-button" disabled={busy !== null} onClick={() => void skip()}>
        <FastForward size={14} aria-hidden="true" /> {busy === "all" ? "Running…" : `Skip all ${timed.length} waits`}</button> : null}
    </div>
    <TestRunAutoplay {...props} sequence={sequence} />
    {error ? <p role="alert" className="test-run-error">{error}</p> : null}
    {failed ? <div role="alert" className="pn-wf-empty"><strong>The sequence could not be loaded</strong>
        <button type="button" className="workflow-secondary-button" onClick={() => setRetry((n) => n + 1)}>Retry</button></div>
      : sequence === null ? <p role="status" className="pn-wf-muted">Loading…</p>
      : !sequence.stages.length ? <p className="pn-wf-muted">This community has no Workflow stages yet.</p>
      : <ol className="test-run-stages" aria-live="polite">
        {sequence.stages.map((stage, index) => <li key={stage.key} className={stage.is_current ? "is-current" : stage.reached ? "is-reached" : undefined}>
          <h3><span className="test-run-stage-number">{index + 1}</span><span className="test-run-stage-name">{stage.name}</span>
            {stage.is_current ? <em className="pn-wf-badge is-on">Here now{stage.entered_at ? ` since ${timeOf(stage.entered_at)}` : ""}</em> : null}</h3>
          {stage.steps.length ? <ol className="test-run-steps">
            {stage.steps.map((step) => <li key={step.key} data-status={step.status}>
              <span className="test-run-step-text">
                <strong>{step.does}</strong>
                <small>{step.when}
                  {step.status === "done" || step.status === "failed" ? ` · ${timeOf(step.at)}` : ""}
                  {step.status === "scheduled" ? ` · due ${timeOf(step.due_at)}` : ""}
                  {step.error ? ` · ${step.error}` : ""}
                  {step.note ? ` · ${step.note}` : ""}</small>
              </span>
              <span className={`pn-wf-badge test-run-step-status ${STATUS_BADGE[step.status] ?? ""}`}>{step.note && step.status === "done" ? "Previewed" : STATUS_LABEL[step.status]}</span>
              {step.status === "scheduled" ? <button type="button" className="workflow-secondary-button" disabled={busy !== null} onClick={() => void skip(step.key)}>
                <FastForward size={14} aria-hidden="true" /> {busy === step.key ? "Running…" : "Run now"}
              </button> : null}
            </li>)}
          </ol> : <p className="pn-wf-muted test-run-no-steps">No rules in this stage.</p>}
        </li>)}
        {sequence.completed_at ? <li className="is-reached is-finished"><h3><span className="test-run-stage-name">Finished the Workflow</span>
          <em className="pn-wf-badge is-on">{timeOf(sequence.completed_at)}</em></h3></li> : null}
      </ol>}
  </section>;
}

const AUTOPLAY_SPEEDS = { normal: 2000, fast: 800, instant: 250 } as const;
/** On screen: how long each cursor move takes in the member tab. */
const AUTOPLAY_SCREEN_PACE = { normal: 450, fast: 220, instant: 70 } as const;
/** On screen: how often to look in while the member tab is doing a step. */
const AUTOPLAY_ACTING_POLL_MS = 700;
type AutoplaySpeed = keyof typeof AUTOPLAY_SPEEDS;
type AutoplayWhere = "screen" | "background";
/** Quiet steps in a row before Autoplay calls it done: rules still running get a moment to land. */
const AUTOPLAY_SETTLE_STEPS = 3;
type AutoplayLogEntry = CloudAutoplayBeat & { at: string };

/** What the run came to: rules that ran, failed, or never fired in the stages it reached. */
function autoplayResult(sequence: CloudTestRunSequence) {
  const steps = sequence.stages.filter((stage) => stage.reached).flatMap((stage) => stage.steps);
  const ran = steps.filter((step) => step.status === "done");
  const failed = steps.filter((step) => step.status === "failed");
  const waiting = steps.filter((step) => step.status === "waiting" || step.status === "scheduled" || step.status === "running");
  return { total: ran.length + failed.length + waiting.length, ran, failed, waiting };
}

// Autoplay: the test member goes through the Workflow by itself, a step at a
// time, while the sequence below fills in. The page keeps the clock (Play,
// Pause, Step, speed); the server does one step per call. On screen, the
// member's own tab does each step in the real member screens while this page
// waits for it; in the background, the server does it straight away.
function TestRunAutoplay(props: Props & { member: CloudCommunityTestMember; sequence: CloudTestRunSequence | null; watch?: { ready: boolean } }) {
  // "step" plays until one step is done, then pauses.
  const [phase, setPhase] = useState<"ready" | "playing" | "step" | "paused" | "finished">("ready");
  const [speed, setSpeed] = useState<AutoplaySpeed>("normal");
  const [where, setWhere] = useState<AutoplayWhere>("screen");
  const [log, setLog] = useState<AutoplayLogEntry[]>([]);
  const [acting, setActing] = useState<CloudAutoplayBeat | null>(null);
  const [stepping, setStepping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quiet = useRef(0);
  const live = useRef({ props, phase, speed, where });
  live.current = { props, phase, speed, where };
  const speedId = useId();
  const whereId = useId();

  const call = useCallback(async (stop = false) => {
    const { props: current, speed: pace, where: place } = live.current;
    const ready = await current.ensureSession(current.session, "community_test_run_autoplay");
    if (!ready) throw new Error("session_unavailable");
    return await autoplayCloudTestMemberStep(ready, current.communityId, current.member.id,
      stop ? { stop: true } : place === "screen" ? { onScreenPace: AUTOPLAY_SCREEN_PACE[pace] } : {});
  }, []);

  const step = useCallback(async () => {
    setStepping(true); setError(null);
    try {
      const result = await call();
      if (result.status === "acting") { setActing(result.beat); return; }
      setActing(null);
      if (result.beat) {
        quiet.current = 0;
        setLog((rows) => [...rows, { ...result.beat!, at: new Date().toISOString() }]);
        if (live.current.phase === "step") setPhase("paused");
      } else quiet.current += 1;
      if (result.status === "finished" || quiet.current >= AUTOPLAY_SETTLE_STEPS) { setPhase("finished"); void call(true).catch(() => {}); }
    } catch (caught) {
      setError(testRunErrorMessage(caught)); setPhase("paused"); setActing(null); void call(true).catch(() => {});
    } finally { setStepping(false); }
  }, [call]);

  useEffect(() => {
    if ((phase !== "playing" && phase !== "step") || stepping) return;
    const delay = acting ? AUTOPLAY_ACTING_POLL_MS : phase === "step" || !(log.length || quiet.current) ? 0 : AUTOPLAY_SPEEDS[speed];
    const timer = window.setTimeout(() => { void step(); }, delay);
    return () => window.clearTimeout(timer);
  }, [phase, stepping, speed, step, log.length, acting]);
  // Watching: plays on screen by itself once the member's screen is ready.
  const watchReady = props.watch?.ready ?? false;
  useEffect(() => {
    if (watchReady && live.current.phase === "ready") { setWhere("screen"); setPhase("playing"); }
  }, [watchReady]);
  // Leaving the page while it plays stops it, so agent steps send again.
  useEffect(() => () => { if (live.current.phase === "playing") void call(true).catch(() => {}); }, [call]);

  const restart = () => { setLog([]); quiet.current = 0; };
  const play = () => { if (phase === "finished") restart(); setPhase("playing"); };
  const pause = () => { setPhase("paused"); setActing(null); void call(true).catch(() => {}); };
  const openMemberTab = () => {
    if (props.member.auth_subject) openTestTab(null, props.communitySlug, { auth_subject: props.member.auth_subject, label: props.member.label });
  };
  const agentNote = "Agent messages are previewed, not sent.";
  const running = phase === "playing" || phase === "step";
  const result = phase === "finished" && props.sequence ? autoplayResult(props.sequence) : null;
  const status = running ? <span className="pn-wf-badge is-edited">Playing · step {log.length + 1}</span>
    : phase === "paused" ? <span className="pn-wf-badge">Paused</span>
    : phase === "finished" ? <span className="pn-wf-badge is-on">Finished</span> : null;
  return <div className="test-run-autoplay">
    <div className="pn-wf-callout">
      <span className="pn-wf-callout-icon" aria-hidden="true"><Play size={20} strokeWidth={2} /></span>
      <span className="pn-wf-callout-text">
        <strong>Autoplay {status}</strong>
        {props.watch ? null : <small>{props.member.label} goes through the Workflow by itself: fills in forms with sample answers, clicks through lessons,
          posts, and skips the waits. {agentNote}</small>}
        {props.watch ? <small>{props.watch.ready || phase !== "ready" ? `${props.member.label} fills in forms, clicks through lessons, posts and skips the waits on the left. ${agentNote}`
          : `Getting ${props.member.label}'s screen ready…`}</small>
        : where === "screen" ? <small>On screen: keep {props.member.label}'s tab open next to this one to watch each click.{" "}
          {props.member.auth_subject ? <button type="button" className="test-run-link" onClick={openMemberTab}>Open their tab</button> : null}</small> : null}
      </span>
      <span className="pn-wf-callout-actions">
        {running
          ? <button type="button" className="workflow-secondary-button" onClick={pause}><Pause size={14} aria-hidden="true" /> Pause</button>
          : <button type="button" className="pn-wf-primary" disabled={stepping} onClick={play}>
            <Play size={14} aria-hidden="true" /> {phase === "finished" ? "Play again" : phase === "paused" ? "Resume" : "Play"}</button>}
        <button type="button" className="workflow-secondary-button" disabled={running || stepping}
          onClick={() => { if (phase === "finished") restart(); setPhase("step"); }}>
          <SkipForward size={14} aria-hidden="true" /> Step</button>
        {props.watch ? null : <select id={whereId} aria-label="Where Autoplay acts" value={where} disabled={running} onChange={(event) => setWhere(event.target.value as AutoplayWhere)}>
          <option value="screen">On screen</option><option value="background">In the background</option>
        </select>}
        <select id={speedId} aria-label="Autoplay speed" value={speed} onChange={(event) => setSpeed(event.target.value as AutoplaySpeed)}>
          <option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option>
        </select>
      </span>
    </div>
    {error ? <p role="alert" className="test-run-error">{error}</p> : null}
    {result ? <div className={`pn-wf-callout test-run-result${result.failed.length ? " is-failed" : ""}`} role="status">
      <span className="pn-wf-callout-icon" aria-hidden="true">{result.failed.length || result.waiting.length
        ? <XCircle size={20} strokeWidth={2} /> : <CheckCircle2 size={20} strokeWidth={2} />}</span>
      <span className="pn-wf-callout-text">
        <strong>{!result.total ? "No rules ran" : result.ran.length === result.total ? `All ${result.total} rules ran`
          : `${result.ran.length} of ${result.total} rules ran`}{props.sequence?.completed_at ? " · Finished the Workflow" : ""}</strong>
        {result.failed.length ? <small>Failed: {result.failed.map((s) => `${s.does}${s.error ? ` (${s.error})` : ""}`).join("; ")}</small> : null}
        {result.waiting.length ? <small>Didn't fire: {result.waiting.map((s) => `${s.does} (${s.when.charAt(0).toLowerCase()}${s.when.slice(1)})`).join("; ")}</small> : null}
      </span>
    </div> : null}
    {log.length || acting ? <ol className="test-run-beats" aria-live="polite" aria-label={`What ${props.member.label} did`}>
      {log.map((beat, index) => <li key={`${beat.at}:${index}`} className={beat.ok ? undefined : "is-failed"}>
        <span className="pn-wf-row-icon" aria-hidden="true">{beat.kind === "wait" ? <FastForward size={14} /> : beat.ok ? <MousePointerClick size={14} /> : <XCircle size={14} />}</span>
        <span className="test-run-step-text"><strong>{beat.text}</strong>{beat.detail ? <small>{beat.detail}</small> : null}</span>
        {beat.on_screen ? <span className="pn-wf-badge is-on">On screen</span> : null}
        <time dateTime={beat.at}>{timeOf(beat.at)}</time>
      </li>)}
      {acting && running ? <li className="is-acting">
        <span className="pn-wf-row-icon" aria-hidden="true"><MousePointerClick size={14} /></span>
        <span className="test-run-step-text"><strong>{acting.text}</strong><small>Doing it now {props.watch ? "on the left" : `in ${props.member.label}'s tab`}…</small></span>
        <span className="pn-wf-badge is-edited">On screen</span>
      </li> : null}
    </ol> : null}
  </div>;
}

/** How long to wait for the member's screen to say it's ready before playing anyway. */
const WATCH_READY_FALLBACK_MS = 12_000;

// Watch a test run: the community as the test member on the left (a frame of
// the real app, signed in as them), and the sequence with Autoplay on the
// right. Autoplay starts on screen as soon as their screen is ready. It's drawn
// on the page's body, above the app's rail and top bar, in the community's look.
function TestRunWatch(props: Props & { member: CloudCommunityTestMember; busy: boolean; onClose: () => void; onEnd: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const [look, setLook] = useState<{ theme: string | null } | null>(null);
  useLayoutEffect(() => {
    setLook({ theme: marker.current?.closest("[data-community-theme]")?.getAttribute("data-community-theme") ?? null });
  }, []);
  const [ready, setReady] = useState(false);
  const { onClose } = props;
  const run = { authSubject: props.member.auth_subject ?? "", label: props.member.label };
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === TEST_RUN_FRAME_READY) setReady(true);
      if (event.data?.type === TEST_RUN_FRAME_EXIT) onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const fallback = window.setTimeout(() => setReady(true), WATCH_READY_FALLBACK_MS);
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(fallback); window.removeEventListener("message", onMessage); window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  const view = <div className="pn-wf test-run-watch-layer" data-community-theme={look?.theme ?? undefined}>
    <div className="test-run-watch" role="dialog" aria-modal="true" aria-labelledby="test-run-watch-title">
    <header className="test-run-watch-head">
      <span className="pn-wf-row-icon" aria-hidden="true"><Play size={16} strokeWidth={2} /></span>
      <span className="pn-wf-row-text">
        <strong id="test-run-watch-title">Watching {props.member.label}</strong>
        <small>They go through your community by themselves on the left. Each Workflow rule ticks off on the right as it fires.</small>
      </span>
      <span className="test-run-watch-actions">
        <button type="button" className="workflow-secondary-button test-run-end" disabled={props.busy} onClick={props.onEnd}>End this run</button>
        <button type="button" className="workflow-secondary-button" onClick={onClose}><X size={14} aria-hidden="true" /> Close</button>
      </span>
    </header>
    <div className="test-run-watch-body">
      <div className="test-run-watch-screen">
        <div className="test-run-watch-chrome" aria-hidden="true"><span /><span /><span /><em>{props.member.label}'s screen</em></div>
        <iframe ref={frame} name={testMemberRunFrameName(run)} src={buildTestMemberRunUrl(props.communitySlug, run)}
          title={`Your community as ${props.member.label}`} />
      </div>
      <aside className="test-run-watch-side">
        <TestRunSequence {...props} watch={{ ready }} />
      </aside>
    </div>
  </div></div>;
  return <><span ref={marker} hidden />{look ? createPortal(view, document.body) : null}</>;
}

function TestRunTimeline(props: Props & { member: CloudCommunityTestMember; membershipId: string }) {
  const [entries, setEntries] = useState<CloudCommunityClientTimelineEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setFailed(false);
    return subscribeCloudCommunityClientTimeline({
      session: props.session, ensureSession: props.ensureSession, communityId: props.communityId, membershipId: props.membershipId,
      update: (rows) => { setEntries(rows); setFailed(false); }, error: () => setFailed(true),
    });
  }, [props.session, props.ensureSession, props.communityId, props.membershipId, retry]);
  return <section className="test-run-timeline" aria-labelledby="test-run-timeline-title">
    <div className="pn-wf-section-head">
      <div>
        <h2 id="test-run-timeline-title">Everything on {props.member.label}'s record</h2>
        <p>Newest first: joining, forms, lessons, member fields and every Workflow action.</p>
      </div>
      <button type="button" className="workflow-secondary-button" onClick={() => props.onOpenRecord(props.membershipId)}>Open their member panel</button>
    </div>
    {failed ? <div role="alert" className="pn-wf-empty"><strong>This record could not be loaded</strong>
        <button type="button" className="workflow-secondary-button" onClick={() => setRetry((n) => n + 1)}>Retry</button></div>
      : entries === null ? <p role="status" className="pn-wf-muted">Loading…</p>
      : !entries.length ? <p className="pn-wf-muted">Nothing on the record yet.</p>
      : <ol className="test-run-entries">
        {entries.map((entry, index) => <li key={`${entry.at}:${entry.type}:${index}`} data-type={entry.type}>
          <time dateTime={entry.at}>{timeOf(entry.at)}</time><span>{entry.summary}</span>
        </li>)}
      </ol>}
  </section>;
}
