import { Check, Plug } from "lucide-react";
import { CommunityAgentIcon, useCommunityAgentName } from "../../../../shared/CommunityAgentIcon";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import type { AuthSession } from "../auth";
import { getMemberWelcomePage, subscribeMemberForms, type MemberFormSummary, type MemberWelcomePage } from "../../../../shared/cloudCommunityFormRequestsGateway";
import { setCloudOwnResourceProgress } from "../../../../shared/cloudCommunityResourceProgressGateway";
import { CONTENT_MARKDOWN_OPTIONS, CONTENT_PROSE_CLASS, renderMarkdown } from "../../../../shared/markdownUi";
import { legacyWelcomeLayout, welcomeLayoutWithForms, welcomeScreens, type WelcomeBlock, type WelcomeChoiceOption, type WelcomeScreen, type WelcomeStep } from "../../../../shared/communityWelcomeLayout";
import { useWebCommunityLessonProgress } from "../controllers/useWebCommunityLessonProgress";
import { MemberFormRunner } from "./WebCommunityNextStep";
import { WebCommunityResourceViewerContent, type WebLessonActivity } from "./WebCommunityResourceViewerContent";
import type { CommunityResource } from "./communityResourcesContracts";
import "./WebCommunityNextStep.css";

type Props = {
  communityId: string;
  communityName: string;
  /** The welcome forms the server says this member still owes. */
  requestIds: string[];
  /** The welcome lesson pages still to mark done. */
  lessonIds: string[];
  session: AuthSession;
  ensureSession: (session: AuthSession, source?: string) => Promise<AuthSession | null>;
  /** Reloads access, so the shell moves to the next step or opens the community. */
  onFinished: () => void;
  /** Called when the page closes after the member finished, so lists read while held load again. */
  onReleased: () => void;
  /** "popup": shown over the open community, and the member can put it away and finish later. */
  display?: "page" | "popup";
};

/** One screen of the welcome page: where the member is, the headline on the
 * first screen, then the owner's blocks with the step (a form or a lesson) where
 * it was placed. The member page and the owner's preview both render this. */
export function WelcomeScreenView(props: {
  title: string; screens: WelcomeScreen[]; index: number;
  renderStep: (step: WelcomeStep) => ReactNode;
  /** A screen with no step moves on with this. */
  onNext: () => void;
  titleRef?: Ref<HTMLHeadingElement>; stepRef?: Ref<HTMLParagraphElement>;
  // Inside Settings the page sits under the "Preview" heading, so its title reads as a level below.
  headingLevel?: number;
  /** Where a member's pick on a choice is remembered, so coming back shows the same steps. */
  choiceStorageKey?: string;
  /** A setup screen (one with a choice) can be skipped and finished later. */
  onSkip?: () => void;
  nextLabel?: string;
  /** The small line over the first screen's title. */
  kicker?: string;
}) {
  const screen = props.screens[props.index] ?? null;
  const total = props.screens.length;
  const rendered = useMemo(() => (screen?.blocks ?? []).map((block) =>
    block.type === "text" ? renderMarkdown(block.markdown, CONTENT_MARKDOWN_OPTIONS) : null), [screen]);
  return <>
    <div className="community-welcome-intro">
      {total > 1 ? <div className="community-welcome-progress">
        <p ref={props.stepRef} tabIndex={-1} className="community-welcome-step">Step {props.index + 1} of {total}</p>
        <span className="community-welcome-progress-track" aria-hidden="true"><span style={{ width: `${((props.index + 1) / total) * 100}%` }} /></span>
      </div> : null}
      <small>{props.index === 0 ? props.kicker ?? "Welcome" : props.title}</small>
      {props.index === 0 ? <h1 ref={props.titleRef} tabIndex={-1} aria-level={props.headingLevel}>{props.title}</h1> : null}
    </div>
    {screen?.blocks.map((block, index) => block.type === "text"
      ? <div key={index} className={`community-welcome-message ${CONTENT_PROSE_CLASS}`}>{rendered[index]}</div>
      : block.type === "choice" ? <WelcomeChoiceView key={`${props.index}:${index}`} prompt={block.prompt} options={block.options} agent={block.agent}
        storageKey={props.choiceStorageKey ? `${props.choiceStorageKey}:${props.index}:${index}` : undefined} />
      : block.type === "next" ? null : <Fragment key={index}>{props.renderStep(block)}</Fragment>)}
    {screen && !screen.step ? <footer className="community-welcome-next">
      <button type="button" className="platform-save-button" onClick={props.onNext}>{props.nextLabel ?? "Next"}</button>
      {props.onSkip && skippableScreen(screen) ? <button type="button" className="community-welcome-skip" onClick={props.onSkip}>
        <span>Skip for now</span><small>Not at your computer? We'll remind you.</small>
      </button> : null}
    </footer> : null}
  </>;
}

/** Cards to pick from (the app they use, say); the picked card's steps show below it. */
export function WelcomeChoiceView(props: { prompt: string; options: WelcomeChoiceOption[]; storageKey?: string; agent?: boolean }) {
  // The first card is the default until the member picks another.
  const [picked, setPicked] = useState<number>(() => {
    if (!props.storageKey) return 0;
    try {
      const stored = localStorage.getItem(props.storageKey);
      const value = Number(stored);
      return stored !== null && Number.isInteger(value) && value >= 0 && value < props.options.length ? value : 0;
    } catch { return 0; }
  });
  const option = props.options[picked] ?? null;
  const rendered = useMemo(() => (option ? renderMarkdown(option.markdown, CONTENT_MARKDOWN_OPTIONS) : null), [option]);
  const groupId = useId();
  const pick = (index: number) => {
    setPicked(index);
    if (props.storageKey) try { localStorage.setItem(props.storageKey, String(index)); } catch { /* still shows */ }
  };
  return <div className="community-welcome-choice">
    {props.agent && option ? <WelcomeAgentConnector app={option} /> : null}
    {props.prompt ? <p id={groupId} className="community-welcome-choice-prompt">{props.prompt}</p> : null}
    <div className="community-welcome-choice-cards" role="radiogroup" aria-labelledby={props.prompt ? groupId : undefined}
      aria-label={props.prompt ? undefined : "Choose one"} style={{ ["--choice-count" as string]: props.options.length }}>
      {props.options.map((item, index) => (
        <button key={index} type="button" role="radio" aria-checked={picked === index}
          tabIndex={picked === index ? 0 : -1}
          className={`community-welcome-choice-card${picked === index ? " is-picked" : ""}`} onClick={() => pick(index)}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const next = (picked + step + props.options.length) % props.options.length;
            pick(next);
            (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
          }}>
          <span className="community-welcome-choice-mark" aria-hidden="true">{picked === index ? <Check size={14} /> : null}</span>
          {item.icon ? <span className="community-welcome-choice-icon" aria-hidden="true"><ChoiceIconMark icon={item.icon} /></span> : null}
          <span className="community-welcome-choice-text">
            <strong>{item.label}</strong>
            {item.hint ? <small>{item.hint}</small> : null}
          </span>
        </button>
      ))}
    </div>
    {option ? <div className={`community-welcome-message community-welcome-choice-body ${CONTENT_PROSE_CLASS}`} aria-live="polite">{rendered}</div> : null}
  </div>;
}

/** The builder's video or image link, shown the way lessons show media. */
export function welcomeMediaMarkdown(url: string): string {
  return /\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?$/i.test(url) ? `![](${url})` : `<${url}>`;
}

/** The community's agent, shown as the plugin that connects to the app the member picked. */
function WelcomeAgentConnector(props: { app: WelcomeChoiceOption }) {
  const name = useCommunityAgentName(null) || "Your agent";
  return <div className="community-welcome-connector">
    <span className="community-welcome-connector-faces" aria-hidden="true">
      <span className="community-welcome-connector-agent"><CommunityAgentIcon size={40} /></span>
      <span className="community-welcome-connector-link"><Plug size={14} /></span>
      <span className="community-welcome-choice-icon">{props.app.icon ? <ChoiceIconMark icon={props.app.icon} /> : <strong>{props.app.label.slice(0, 1)}</strong>}</span>
    </span>
    <span className="community-welcome-connector-text">
      <strong>{name}</strong>
      <small>Plugin and connector · works inside {props.app.label}</small>
    </span>
  </div>;
}

/** A card's logo, in its own colours. */
export function ChoiceIconMark(props: { icon: string }) {
  return <img className="community-welcome-choice-icon-mark" src={props.icon} alt="" />;
}

/** A screen the member can skip and come back to: one with no step and a choice on it (a setup screen). */
export function skippableScreen(screen: WelcomeScreen): boolean {
  return !screen.step && screen.blocks.some((block) => block.type === "choice");
}

// A skipped screen is remembered by its first choice question, so it is still
// found after the owner adds or moves other screens.
function screenSignature(screen: WelcomeScreen): string {
  const choice = screen.blocks.find((block) => block.type === "choice");
  return choice && choice.type === "choice" ? choice.prompt.trim().toLowerCase() || choice.options.map((o) => o.label).join("|") : "";
}
const skippedKey = (communityId: string) => `polynet:welcome-skipped:${communityId}`;
function readSkipped(communityId: string): string[] {
  try { const value = JSON.parse(localStorage.getItem(skippedKey(communityId)) ?? "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; }
  catch { return []; }
}
function writeSkipped(communityId: string, list: string[]) {
  try { if (list.length) localStorage.setItem(skippedKey(communityId), JSON.stringify(list)); else localStorage.removeItem(skippedKey(communityId)); } catch { /* the reminder just won't show */ }
}

/** The page the member goes through: the saved blocks, or the words, media and steps saved before blocks existed. */
export function memberWelcomeLayout(page: { message?: string | null; media_url?: string | null; layout?: WelcomeBlock[] | null } | null,
  formKeys: string[], lessonIds: string[]): WelcomeBlock[] {
  const layout = page?.layout ?? legacyWelcomeLayout({
    message: page?.message ?? null, mediaUrl: page?.media_url ? welcomeMediaMarkdown(page.media_url) : null, formKeys, lessonIds,
  });
  return welcomeLayoutWithForms(layout, formKeys);
}

const seenKey = (communityId: string) => `polynet:welcome-seen:${communityId}`;
function readSeen(communityId: string): number[] {
  try { const value = JSON.parse(localStorage.getItem(seenKey(communityId)) ?? "[]"); return Array.isArray(value) ? value.filter(Number.isInteger) : []; }
  catch { return []; }
}

// The builder's welcome flow: the member sees only these screens, in the
// owner's order, until every step on them is done. The server enforces the hold; this page is how
// the member gets through it.
export function WebCommunityWelcome(props: Props) {
  const [rows, setRows] = useState<MemberFormSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [runner, setRunner] = useState(0);
  // The page is kept with the lesson ids it was read for, so a change the owner
  // makes while the member is here (a new or replaced lesson) reads it again.
  const [loaded, setLoaded] = useState<{ key: string; page: MemberWelcomePage<CommunityResource> } | null>(null);
  const [pageError, setPageError] = useState(false);
  const [lessonBusy, setLessonBusy] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  // No steps yet: the member just joined and the join rule is still creating their forms.
  const preparing = props.requestIds.length === 0 && props.lessonIds.length === 0;
  const formsOwed = props.requestIds.length > 0;
  // The forms list can briefly read empty while its subscription settles, so
  // every change to "nothing left" reloads access, not just the first.
  const wasEmpty = useRef(false);
  const released = useRef(false);
  const onReleased = useRef(props.onReleased);
  onReleased.current = props.onReleased;
  const onFinished = useRef(props.onFinished);
  onFinished.current = props.onFinished;
  useEffect(() => () => {
    if (!released.current) return;
    onReleased.current();
    // The community replaces this page: put focus at its start, not on the page body.
    requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>("main.workspace");
      if (!main) return;
      if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    });
  }, []);
  const lessonKey = props.lessonIds.join(",");
  useEffect(() => {
    let alive = true; setPageError(false);
    void (async () => {
      try {
        const ready = await props.ensureSession(props.session, "community_welcome");
        if (!ready) throw new Error("session_unavailable");
        const next = await getMemberWelcomePage<AuthSession, CommunityResource>(ready, props.communityId);
        if (alive) setLoaded({ key: lessonKey, page: next });
      } catch { if (alive) setPageError(true); }
    })();
    return () => { alive = false; };
  }, [props.session, props.communityId, props.ensureSession, lessonKey, retry]);
  const page = loaded?.page ?? null;
  useEffect(() => {
    let alive = true; setError(false); setRows(null);
    if (!formsOwed && !preparing) return;
    const stop = subscribeMemberForms(props.session, props.communityId, props.ensureSession,
      (r) => { if (alive) setRows(preparing ? r : r.filter((row) => props.requestIds.includes(row.id))); },
      () => { if (alive) setError(true); });
    return () => { alive = false; stop(); };
  }, [props.session, props.communityId, props.ensureSession, props.requestIds, formsOwed, preparing, retry]);
  // Keep asking for access while held: quickly while the join rule makes the
  // forms, and now and then after, so turning the flow off releases the member.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") onFinished.current();
    }, preparing ? 2_000 : 15_000);
    return () => clearInterval(timer);
  }, [preparing]);
  useEffect(() => { if (preparing && rows?.length) onFinished.current(); }, [preparing, rows]);
  useEffect(() => {
    if (!formsOwed) return;
    const empty = rows?.length === 0;
    if (empty && !wasEmpty.current) onFinished.current();
    wasEmpty.current = empty;
  }, [rows, formsOwed]);
  // Released once nothing is owed: the shell drops this page on the next access read.
  released.current = rows?.length === 0 || (!formsOwed && !preparing);

  const progress = useWebCommunityLessonProgress({ communityId: props.lessonIds.length ? props.communityId : null, session: props.session });
  const lessonActivity = useMemo<WebLessonActivity>(() => ({
    progress, signedIn: true, onRequireSignIn: () => {}, forms: null,
  }), [progress]);
  const lessons = page?.lessons ?? [];
  const lessonById = useMemo(() => new Map(lessons.map((row) => [row.id, row])), [lessons]);
  // Owed forms by key; rows without a key (older servers) take the next form screen.
  const owedKeys = useMemo(() => (rows ?? []).map((row) => row.form_key ?? `request:${row.id}`), [rows]);
  const screens = useMemo(() => welcomeScreens(memberWelcomeLayout(page, owedKeys, props.lessonIds)), [page, owedKeys, props.lessonIds]);
  const [seen, setSeen] = useState<number[]>(() => readSeen(props.communityId));
  const stepOwed = (step: WelcomeStep) => step.type === "form"
    ? (rows === null ? formsOwed : owedKeys.includes(step.formKey))
    : props.lessonIds.includes(step.resourceId) && lessonById.has(step.resourceId);
  const index = page ? screens.findIndex((screen, at) => (screen.step ? stepOwed(screen.step) : !seen.includes(at))) : -1;
  // Text screens before the next step are read once; past the last step the community opens.
  const lastOwed = screens.reduce((last, screen, at) => (screen.step && stepOwed(screen.step) ? at : last), -1);
  const current = index >= 0 && index <= lastOwed ? index : -1;
  const moveOn = (skip = false) => {
    const signature = skip ? screenSignature(screens[current]) : "";
    if (signature) writeSkipped(props.communityId, [...readSkipped(props.communityId).filter((item) => item !== signature), signature]);
    const next = [...seen, current];
    setSeen(next);
    try { localStorage.setItem(seenKey(props.communityId), JSON.stringify(next)); } catch { /* the page still moves on */ }
  };
  const lessonMissing = !formsOwed && props.lessonIds.length > 0 && props.lessonIds.every((id) => !lessonById.has(id)) && loaded?.key === lessonKey;
  // Moving to another screen replaces what had focus, so focus and read out where the member is now.
  const stepKey = current >= 0 ? `screen:${current}` : "";
  const shownStep = useRef("");
  const stepRef = useRef<HTMLParagraphElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (!stepKey || shownStep.current === stepKey) return;
    const first = !shownStep.current;
    shownStep.current = stepKey;
    if (!first) (stepRef.current ?? titleRef.current)?.focus();
  }, [stepKey]);
  const finishLesson = async (resourceId: string) => {
    setLessonBusy(true); setLessonError(null);
    try {
      const ready = await props.ensureSession(props.session, "community_welcome_lesson");
      if (!ready) throw new Error("session_unavailable");
      const result = await setCloudOwnResourceProgress({ session: ready, communityId: props.communityId, resourceId, status: "done" });
      if (!result.ok) { setLessonError(result.message); return; }
      onFinished.current();
    } catch { setLessonError("Could not save. Check your connection and try again."); }
    finally { setLessonBusy(false); }
  };
  const lastStep = current >= 0 && current === lastOwed;
  const renderStep = (step: WelcomeStep) => {
    if (step.type === "lesson") {
      const lesson = lessonById.get(step.resourceId);
      if (!lesson) return null;
      return <div className="community-welcome-lesson">
        <WebCommunityResourceViewerContent resource={lesson} lessonActivity={lessonActivity} />
        <footer>
          <button type="button" className="platform-save-button" disabled={lessonBusy || !props.lessonIds.includes(lesson.id)} onClick={() => void finishLesson(lesson.id)}>
            {lessonBusy ? "Saving…" : lastStep ? "Mark done and open the community" : "Mark done and continue"}
          </button>
          {lessonError ? <p role="alert">{lessonError}</p> : null}
        </footer>
      </div>;
    }
    const row = rows?.find((r) => (r.form_key ?? `request:${r.id}`) === step.formKey);
    return <div className="member-form-dialog community-welcome-form">
      {row ? <MemberFormRunner key={`${row.id}:${runner}`} communityId={props.communityId} session={props.session} ensureSession={props.ensureSession}
        requestId={row.id} onClose={() => setRunner((n) => n + 1)} />
        : error ? <div role="alert"><p>Your welcome steps could not be loaded.</p><button type="button" onClick={() => { setRetry((n) => n + 1); onFinished.current(); }}>Retry</button></div>
        : <p role="status">{rows ? "Opening your next step…" : "Loading…"}</p>}
    </div>;
  };
  const title = page?.title || `Welcome to ${props.communityName}`;
  const status = preparing ? "Getting your first steps ready…"
    : pageError ? null : page && (!formsOwed || rows) ? "Opening the community…" : "Loading…";
  const failed = (error && !formsOwed) || lessonMissing || (pageError && !preparing);
  const popup = props.display === "popup";
  const section = <section className="community-welcome" aria-label={`Welcome to ${props.communityName}`}>
    {current >= 0 && !preparing ? <WelcomeScreenView title={title} screens={screens} index={current} renderStep={renderStep} onNext={() => moveOn()} onSkip={() => moveOn(true)}
      titleRef={titleRef} stepRef={stepRef} choiceStorageKey={`polynet:welcome-choice:${props.communityId}`} />
      : <>
        <div className="community-welcome-intro"><small>Welcome</small><h1 ref={titleRef} tabIndex={-1}>{title}</h1></div>
        {failed ? <div role="alert"><p>Your welcome steps could not be loaded.</p><button type="button" onClick={() => { setRetry((n) => n + 1); onFinished.current(); }}>Retry</button></div>
          : <p role="status">{status}</p>}
      </>}
  </section>;
  if (!popup) return section;
  const left = screens.filter((screen, at) => at >= Math.max(current, 0) && at <= lastOwed).length;
  return <WelcomePopup communityId={props.communityId} title={title} left={left}>{section}</WelcomePopup>;
}

const minimizedKey = (communityId: string) => `polynet:welcome-later:${communityId}`;

// The welcome as a pop-up over the open community. "Finish later" puts it away
// for this visit and leaves a pill at the bottom to bring it back.
export function WelcomePopup(props: {
  communityId: string; title: string; left: number; children: ReactNode;
  /** The pill's words, when it isn't "Finish getting started". */
  pill?: { title: string; detail: string };
  /** Opens as the pill, and isn't remembered between visits (the skipped-step reminder). */
  startAway?: boolean;
  /** Puts the pop-up away from inside, after its last step. */
  closeRef?: { current: (() => void) | null };
}) {
  const remember = !props.startAway;
  const [later, setLater] = useState(() => {
    if (props.startAway) return true;
    try { return sessionStorage.getItem(minimizedKey(props.communityId)) === "1"; } catch { return false; }
  });
  const dialog = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const setAway = (away: boolean) => {
    setLater(away);
    if (remember) try { if (away) sessionStorage.setItem(minimizedKey(props.communityId), "1"); else sessionStorage.removeItem(minimizedKey(props.communityId)); } catch { /* still works this visit */ }
    requestAnimationFrame(() => (away ? pill.current : dialog.current)?.focus());
  };
  useEffect(() => { if (!later) dialog.current?.focus(); }, []);
  if (props.closeRef) props.closeRef.current = () => setAway(true);
  if (later) return <button ref={pill} type="button" className="community-welcome-pill" onClick={() => setAway(false)}>
    <span className="community-welcome-pill-dot" aria-hidden="true" />
    <span><strong>{props.pill?.title ?? "Finish getting started"}</strong><small>{props.pill?.detail ?? (props.left > 1 ? `${props.left} steps left` : "1 step left")}</small></span>
  </button>;
  return <div className="community-welcome-popup-backdrop">
    <div ref={dialog} className="community-welcome-popup" role="dialog" aria-modal="true" aria-label={props.title} tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); setAway(true); return; }
        if (event.key !== "Tab") return;
        // Tab stays inside the pop-up while it's open.
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], iframe, [tabindex=\"0\"]")];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <button type="button" className="community-welcome-popup-later" onClick={() => setAway(true)}>{props.startAway ? "Later" : "Finish later"}</button>
      {props.children}
    </div>
  </div>;
}

// After the welcome, a setup screen the member skipped waits as a pill at the
// bottom; it opens that screen in a pop-up until they press Done.
export function WelcomeSkippedReminder(props: {
  communityId: string; session: AuthSession;
  ensureSession: (session: AuthSession, source?: string) => Promise<AuthSession | null>;
}) {
  const [skipped, setSkipped] = useState(() => readSkipped(props.communityId));
  const [page, setPage] = useState<MemberWelcomePage<CommunityResource> | null>(null);
  const close = useRef<(() => void) | null>(null);
  const wanted = skipped.length > 0;
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    void (async () => {
      try {
        const ready = await props.ensureSession(props.session, "community_welcome_reminder");
        if (!ready) return;
        const next = await getMemberWelcomePage<AuthSession, CommunityResource>(ready, props.communityId);
        if (alive) setPage(next);
      } catch { /* no reminder this time */ }
    })();
    return () => { alive = false; };
  }, [props.session, props.communityId, props.ensureSession, wanted]);
  const screens = useMemo(() => (page?.layout ? welcomeScreens(page.layout).filter(skippableScreen) : []), [page]);
  const screen = screens.find((item) => skipped.includes(screenSignature(item))) ?? null;
  if (!screen) return null;
  const done = () => {
    const rest = skipped.filter((item) => item !== screenSignature(screen));
    writeSkipped(props.communityId, rest);
    close.current?.();
    setSkipped(rest);
  };
  return <WelcomePopup key={screenSignature(screen)} communityId={props.communityId} title="Finish setting up" left={1} startAway closeRef={close}
    pill={{ title: "Finish setting up", detail: screenSummary(screen) }}>
    <section className="community-welcome" aria-label="Finish setting up">
      <WelcomeScreenView title="Finish setting up" screens={[screen]} index={0} renderStep={() => null} onNext={done} nextLabel="Done" kicker="You skipped this earlier"
        choiceStorageKey={`polynet:welcome-choice:${props.communityId}:later`} />
    </section>
  </WelcomePopup>;
}

/** A few words for the reminder: the screen's first heading or bold line, else its question. */
function screenSummary(screen: WelcomeScreen): string {
  for (const block of screen.blocks) {
    if (block.type !== "text") continue;
    const line = /^#{1,6}\s+(.+)$/m.exec(block.markdown)?.[1] ?? /\*\*(.+?)\*\*/.exec(block.markdown)?.[1];
    if (line) return trimWords(line.replace(/[*_`]/g, "").trim());
  }
  const choice = screen.blocks.find((block) => block.type === "choice");
  return choice && choice.type === "choice" && choice.prompt ? trimWords(choice.prompt) : "You skipped a step";
}
function trimWords(text: string): string { return text.length > 56 ? `${text.slice(0, 55).trimEnd()}…` : text; }
