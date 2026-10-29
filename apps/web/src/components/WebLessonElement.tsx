import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardList } from "lucide-react";
import type { AuthSession } from "../auth";
import type { CommunityLessonElement } from "../../../../shared/communityLessonContract";
import type {
  CommunityLessonResponse,
  SetCommunityLessonResponseResult,
} from "../../../../shared/cloudCommunityResourceProgressGateway";
import { findMyPendingFormByKey } from "../../../../shared/cloudCommunityFormRequestsGateway";
import { renderMarkdown } from "../../../../shared/markdownUi";
import { MemberFormRunner } from "./WebCommunityNextStep";
import "./WebCommunityNextStep.css";

export type WebLessonFormAccess = {
  communityId: string;
  session: AuthSession;
  ensureSession: (session: AuthSession, source?: string) => Promise<AuthSession | null>;
};

export type WebLessonElementProps = {
  element: CommunityLessonElement;
  response: CommunityLessonResponse | null;
  signedIn: boolean;
  onRequireSignIn: () => void;
  onAnswer: (value: true | string[] | null) => Promise<SetCommunityLessonResponseResult>;
  onMarkDone: () => void;
  onAskAgent?: ((text: string) => void) | null;
  forms: WebLessonFormAccess | null;
};

function messageFor(result: SetCommunityLessonResponseResult): string | null {
  if (result.ok) return null;
  if (result.code === "lesson_locked") return "Finish the module before this one first.";
  return result.message || "That didn't save. Try again.";
}

/** One follow-along element in a lesson: a button, checklist, quiz or Polynet Form. */
export function WebLessonElement(props: WebLessonElementProps) {
  const { element } = props;
  return (
    <section className={`lesson-element lesson-element--${element.type}`} aria-label={element.prompt || element.label || element.type}>
      {element.type === "button" ? <LessonButton {...props} /> : null}
      {element.type === "checklist" ? <LessonChecklist {...props} /> : null}
      {element.type === "quiz" ? <LessonQuiz {...props} /> : null}
      {element.type === "form" ? <LessonForm {...props} /> : null}
    </section>
  );
}

function RequiredTag({ element }: { element: CommunityLessonElement }) {
  return element.required ? <span className="lesson-element-required">Required</span> : null;
}

// While an answer saves, its controls stay enabled (and focused) but say so
// with aria-disabled: disabling a focused control throws keyboard focus away.
// A second answer while one is saving is ignored.
function useAnswer(props: WebLessonElementProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const submit = async (value: true | string[] | null) => {
    if (!props.signedIn) {
      props.onRequireSignIn();
      return null;
    }
    if (saving.current) return null;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await props.onAnswer(value);
      setError(messageFor(result));
      return result;
    } catch {
      setError("That didn't save. Try again.");
      return null;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function LessonButton(props: WebLessonElementProps) {
  const { element, response } = props;
  const { busy, error, submit } = useAnswer(props);
  const [formOpen, setFormOpen] = useState(false);
  const done = Boolean(response?.complete);
  const label = element.label ?? "Done";
  const click = async () => {
    if (element.action === "open_form") {
      if (!props.signedIn) return props.onRequireSignIn();
      setFormOpen(true);
      return;
    }
    const result = await submit(true);
    if (!result?.ok) return;
    if (element.action === "mark_done") props.onMarkDone();
    if (element.action === "ask_agent") props.onAskAgent?.(label);
  };
  return (
    <>
      <div className="lesson-element-row">
        <button
          type="button"
          className={`lesson-element-button${done ? " is-done" : ""}`}
          aria-pressed={element.action === "confirm" ? done : undefined}
          aria-disabled={busy || undefined}
          onClick={() => { if (!busy) void click(); }}
        >
          {done ? <Check aria-hidden="true" size={16} /> : null}
          <span>{label}</span>
        </button>
        <RequiredTag element={element} />
      </div>
      {error ? <p className="lesson-element-error" role="alert">{error}</p> : null}
      {formOpen && element.form_key && props.forms ? (
        <LessonFormDialog formKey={element.form_key} forms={props.forms} onClose={() => setFormOpen(false)} />
      ) : null}
    </>
  );
}

function LessonChecklist(props: WebLessonElementProps) {
  const { element, response } = props;
  const { busy, error, submit } = useAnswer(props);
  const saved = Array.isArray(response?.value) ? response!.value : [];
  const [ticked, setTicked] = useState<string[]>(saved);
  useEffect(() => setTicked(Array.isArray(response?.value) ? response!.value : []), [response]);
  const choices = element.choices ?? [];
  const toggle = async (id: string, checked: boolean) => {
    const next = checked ? [...ticked, id] : ticked.filter((value) => value !== id);
    const previous = ticked;
    setTicked(next);
    const result = await submit(next.length ? next : null);
    if (!result?.ok) setTicked(previous);
  };
  return (
    <>
      <div className="lesson-element-head">
        {element.prompt ? <p className="lesson-element-prompt">{element.prompt}</p> : null}
        <span className="lesson-element-count">{ticked.length} of {choices.length}</span>
        <RequiredTag element={element} />
      </div>
      <ul className="lesson-element-choices">
        {choices.map((choice) => (
          <li key={choice.id}>
            <label>
              <input
                type="checkbox"
                checked={ticked.includes(choice.id)}
                aria-disabled={busy || undefined}
                onChange={(event) => { if (!busy) void toggle(choice.id, event.target.checked); }}
              />
              <span>{choice.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {error ? <p className="lesson-element-error" role="alert">{error}</p> : null}
    </>
  );
}

function LessonQuiz(props: WebLessonElementProps) {
  const { element, response } = props;
  const { busy, error, submit } = useAnswer(props);
  const answered = Array.isArray(response?.value) ? response!.value : [];
  const [picked, setPicked] = useState<string[]>(answered);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    setPicked(Array.isArray(response?.value) ? response!.value : []);
    setRetrying(false);
  }, [response]);
  const showResult = Boolean(response) && !retrying;
  const correct = response?.correct === true;
  const name = `lesson-quiz-${element.id}`;
  const resultRef = useRef<HTMLDivElement | null>(null);
  const choicesRef = useRef<HTMLFieldSetElement | null>(null);
  const focusResult = useRef(false), focusChoices = useRef(false);
  useEffect(() => {
    if (showResult && focusResult.current) { focusResult.current = false; resultRef.current?.focus(); }
    if (!showResult && focusChoices.current) { focusChoices.current = false; choicesRef.current?.querySelector<HTMLElement>("input")?.focus(); }
  });
  const pick = (id: string, checked: boolean) => {
    setPicked((current) => (element.multiple ? (checked ? [...current, id] : current.filter((value) => value !== id)) : [id]));
  };
  return (
    <>
      <div className="lesson-element-head">
        <p className="lesson-element-prompt">{element.prompt}</p>
        <RequiredTag element={element} />
      </div>
      <fieldset ref={choicesRef} className="lesson-element-choices" aria-label={element.prompt} disabled={showResult && correct} aria-disabled={busy || undefined}>
        {(element.choices ?? []).map((choice) => {
          const isAnswer = showResult && correct && (response?.answer ?? []).includes(choice.id);
          return (
            <label key={choice.id} className={isAnswer ? "is-answer" : undefined}>
              <input
                type={element.multiple ? "checkbox" : "radio"}
                name={name}
                checked={picked.includes(choice.id)}
                onChange={(event) => { if (!busy) pick(choice.id, event.target.checked); }}
              />
              <span>{choice.label}</span>
            </label>
          );
        })}
      </fieldset>
      {showResult ? (
        <div ref={resultRef} tabIndex={-1} className={`lesson-element-result ${correct ? "is-correct" : "is-wrong"}`} role="status">
          <strong>{correct ? "Correct" : "Not quite"}</strong>
          {response?.explanation_md ? <div className="lesson-element-explanation">{renderMarkdown(response.explanation_md)}</div> : null}
          {!correct ? (
            <button type="button" className="lesson-element-secondary" onClick={() => { setRetrying(true); setPicked([]); focusChoices.current = true; }}>
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <div className="lesson-element-row">
          <button
            type="button"
            className="lesson-element-button"
            disabled={picked.length === 0}
            aria-disabled={busy || undefined}
            onClick={async () => {
              if (busy) return;
              // The button gives way to the result, so the result takes focus
              // (whenever it shows: the saved answer can arrive before or after this resolves).
              focusResult.current = true;
              if (!(await submit(picked))?.ok) focusResult.current = false;
            }}
          >
            Check answer
          </button>
          {element.multiple ? <span className="lesson-element-count">Pick every answer that applies</span> : null}
        </div>
      )}
      {error ? <p className="lesson-element-error" role="alert">{error}</p> : null}
    </>
  );
}

function LessonForm(props: WebLessonElementProps) {
  const { element } = props;
  const [open, setOpen] = useState(false);
  return (
    <div className="lesson-element-row">
      <ClipboardList aria-hidden="true" size={18} />
      <span className="lesson-element-prompt">{element.prompt || "A form for this step"}</span>
      <button
        type="button"
        className="lesson-element-button"
        onClick={() => (props.signedIn && props.forms ? setOpen(true) : props.onRequireSignIn())}
      >
        Open form
      </button>
      {open && element.form_key && props.forms ? (
        <LessonFormDialog formKey={element.form_key} forms={props.forms} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * The member's own Polynet Form, opened from a lesson. It is the same request a
 * Workflow stage assigned and the same runner as "Your next steps", so answers
 * reach the Workflow, the agent and the owner's member view as usual.
 */
function LessonFormDialog(props: { formKey: string; forms: WebLessonFormAccess; onClose: () => void }) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "error">("loading");
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ready = await props.forms.ensureSession(props.forms.session, "member_form");
        if (!ready) throw new Error("session_unavailable");
        const row = await findMyPendingFormByKey(ready, props.forms.communityId, props.formKey);
        if (!alive) return;
        setRequestId(row?.id ?? null);
        setState(row ? "ready" : "none");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, [props.formKey, props.forms]);
  useEffect(() => { dialog.current?.focus(); }, []);
  return createPortal(
    <div className="member-form-backdrop" onKeyDown={(event) => { if (event.key === "Escape") props.onClose(); }}>
      <div className="member-form-dialog" role="dialog" aria-modal="true" aria-label="Form" tabIndex={-1} ref={dialog}>
        {state === "ready" && requestId ? (
          <MemberFormRunner {...props.forms} requestId={requestId} onClose={props.onClose} />
        ) : (
          <>
            <header>
              <h2>Form</h2>
              <button type="button" onClick={props.onClose} aria-label="Close">×</button>
            </header>
            <p role="status">
              {state === "loading"
                ? "Loading form…"
                : state === "none"
                  ? "This form isn't open for you yet. It opens when you reach this step, or you've already sent it."
                  : "The form couldn't load. Close this and try again."}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
