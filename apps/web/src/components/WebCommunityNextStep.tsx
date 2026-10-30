import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight } from "lucide-react";
import type { AuthSession } from "../auth";
import { getMemberForm, saveMemberForm, subscribeMemberForms, type MemberFormSummary, type MemberFormRequest } from "../../../../shared/cloudCommunityFormRequestsGateway";
import { formAnswersIssue, formQuestionAnswered, type FormAnswers } from "../../../../shared/communityFormAnswers";
import { communityClientAnswerFormatIssue } from "../../../../shared/communityClients";
import "./WebCommunityNextStep.css";
import { createMemberFormSave, type FormSaveIntent } from "./memberFormSave";

type Props = { communityId: string; session: AuthSession; ensureSession: (session: AuthSession, source?: string) => Promise<AuthSession | null> };
export function WebCommunityNextStep(props: Props) {
  const [rows, setRows] = useState<MemberFormSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const loadMore = useRef<(() => void) | undefined>(undefined);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true; setError(false);
    const stop = subscribeMemberForms(props.session, props.communityId, props.ensureSession, (r, more) => { if (alive) { setRows(r); setHasMore(Boolean(more)); setError(false); } }, () => { if (alive) { setRows([]); setHasMore(false); setError(true); } });
    loadMore.current = stop.loadMore;
    return () => { alive = false; loadMore.current = undefined; stop(); };
  }, [props.session, props.communityId, props.ensureSession, retry]);
  const close = () => { setOpen(false); setSelected(null); };
  const first = rows[0];
  return <>
    {first ? <button ref={button} className="community-next-step" onClick={() => { setSelected(first.id); setOpen(true); }}>
      <small>Your next step</small><strong>{first.name}</strong>
      <span>{first.answered} of {first.total} questions answered</span>
      <span className="community-next-step-action">{first.answered ? "Continue" : "Start"}<ArrowRight size={14} /></span>
    </button> : error ? <button className="community-next-step" onClick={() => setRetry(n => n + 1)}>Could not load your next step · Retry</button> : null}
    {rows.length > 1 || hasMore ? <button className="community-next-step-count" onClick={() => { setSelected(null); setOpen(true); }}>{rows.length}{hasMore ? "+" : ""} pending</button> : null}
    {open ? <MemberFormDialog {...props} rows={rows} hasMore={hasMore} onLoadMore={() => loadMore.current?.()} selected={selected} onSelect={setSelected} onClose={close} /> : null}
  </>;
}
function MemberFormDialog(props: Props & { rows: MemberFormSummary[]; hasMore: boolean; onLoadMore: () => void; selected: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    const wasInert = root?.hasAttribute("inert");
    root?.setAttribute("inert", "");
    dialog.current?.focus();
    return () => {
      if (!wasInert) root?.removeAttribute("inert");
      if (previousFocus?.isConnected) previousFocus.focus();
      else root?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    };
  }, []);
  return createPortal(<div className="member-form-backdrop"><div className="member-form-dialog" role="dialog" aria-modal="true" aria-label="Your next step" tabIndex={-1} ref={dialog}
    onKeyDown={e => { if (e.key !== "Tab") return; const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)') ?? []);
      const first = controls[0], last = controls.at(-1); if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }}>
    {props.selected ? <MemberFormRunner key={props.selected} {...props} requestId={props.selected} /> : <><header><h2>Your next steps</h2><button onClick={props.onClose} aria-label="Close"><X size={20} /></button></header>
      {props.rows.map(row => <button className="member-form-list-row" key={row.id} onClick={() => props.onSelect(row.id)}>{row.name}<span>{row.answered} of {row.total} answered</span></button>)}
      {props.hasMore ? <button className="member-form-list-row" onClick={props.onLoadMore}>Load more</button> : null}</>}
  </div></div>, document.body);
}
const FORMAT_HINTS = { number: "Answer with a number.", date: "Answer with a date, like 2026-11-01.", url: "Answer with a full link, starting with https://." } as const;
/** Where a form's answers live when they aren't an assigned form request: a Form shared in a post. */
export type MemberFormSource = {
  load: (session: AuthSession) => Promise<MemberFormRequest>;
  save: (session: AuthSession, row: MemberFormRequest, answers: FormAnswers, submit: boolean) => Promise<{ revision: number; submitted: boolean }>;
};
/** With `preview`, the owner sees and clicks through the form exactly as members do; nothing is loaded or saved. */
export function MemberFormRunner(props: Props & { requestId: string; onClose: () => void; preview?: MemberFormRequest; source?: MemberFormSource }) {
  const [request, setRequest] = useState<MemberFormRequest | null>(null);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<FormSaveIntent>("autosave");
  const [failedIntent, setFailedIntent] = useState<FormSaveIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const questionSection = useRef<HTMLElement>(null);
  // The owner's preview sits beside the editor, so it never takes focus on its own.
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (props.preview && !focusedOnce.current) { focusedOnce.current = Boolean(request); return; }
    questionSection.current?.querySelector<HTMLElement>("input,textarea,button")?.focus({ preventScroll: Boolean(props.preview) });
  }, [index, request?.id, done]);
  const alive = useRef(true), saving = useRef(false);
  const inflight = useRef<Promise<boolean> | null>(null);
  const latest = useRef(answers); latest.current = answers;
  const saver = useRef<ReturnType<typeof createMemberFormSave> | null>(null);
  const current = useRef<MemberFormRequest | null>(null);
  const session = useRef(props.session); session.current = props.session;
  const load = async () => {
    if (props.preview) { current.current = props.preview; setRequest(props.preview); setAnswers({}); setIndex(0); return; }
    if (saving.current) return;
    saving.current = true; setBusy(true); setIntent("close");
    try { const ready = await props.ensureSession(session.current, "member_form"); if (!ready) throw new Error("session_unavailable"); if (!alive.current) return;
      const row = props.source ? await props.source.load(ready) : await getMemberForm(ready, props.communityId, props.requestId); if (!alive.current) return;
      current.current = row;
      saver.current = createMemberFormSave(row, async attempt => {
        const ready = await props.ensureSession(session.current, "member_form");
        if (!ready || !alive.current) throw new Error("session_unavailable");
        return props.source
          ? props.source.save(ready, { ...row, revision: attempt.revision }, attempt.answers, attempt.intent === "submit")
          : saveMemberForm(ready, props.communityId, { ...row, revision: attempt.revision }, attempt.answers, attempt.intent === "submit");
      });
      setRequest(row); setAnswers(row.answers); setError(null); setValidation(null); setFailedIntent(null);
      // Back where they left off: after the furthest answered question, or on the
      // last one (to submit) when every question is answered.
      const last = row.questions.reduce((found, q, i) => formQuestionAnswered(q, row.answers) ? i : found, -1);
      setIndex(Math.max(0, Math.min(last + 1, row.questions.length - 1)));
    } catch { if (alive.current) { setFailedIntent(null); setError("This form could not be opened. It may no longer be required."); } }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);
  const save = async (nextIntent: FormSaveIntent = "autosave", retry = false): Promise<boolean> => {
    if (props.preview) {
      if (nextIntent === "autosave") return false;
      if (nextIntent === "close") { props.onClose(); return true; }
      const issue = formAnswersIssue(props.preview.questions, latest.current, nextIntent === "submit"); if (issue) { setValidation(issue); return false; }
      setValidation(null);
      if (nextIntent === "submit") setDone(true); else setIndex(n => n + 1);
      return true;
    }
    // Continue, Submit or Close pressed while an autosave is saving waits for it, instead of doing nothing.
    if (saving.current && nextIntent !== "autosave") await inflight.current;
    if (saving.current || !current.current || !saver.current) return false;
    const snapshot = latest.current;
    const issue = retry ? null : formAnswersIssue(current.current.questions, snapshot, nextIntent === "submit"); if (issue) { setValidation(issue); return false; }
    // A background autosave never clears the problem Continue just showed; typing clears it.
    if (nextIntent !== "autosave") setValidation(null);
    saving.current = true; setBusy(true); setIntent(nextIntent);
    const saver_ = saver.current;
    const work = (async () => { try {
      const result = await saver_.run(nextIntent, snapshot, retry);
      if (!alive.current || !result) return false;
      setError(null); setFailedIntent(null);
      if (result.submitted) setDone(true);
      else if (result.intent === "continue") setIndex(n => n + 1);
      else if (result.intent === "close") props.onClose();
      return true;
    } catch (e) { if (alive.current) { setFailedIntent(nextIntent); setError(String(e).includes("conflict") ? "Changed in another session. Reload saved answers before continuing." : "Could not save. Your answers are still here. Retry the same operation or discard and reload."); } return false;
    } finally { saving.current = false; if (alive.current) setBusy(false); } })();
    inflight.current = work;
    return work;
  };
  useEffect(() => { if (!request || done || busy || error || !saver.current?.dirty(answers)) return; const timer = setTimeout(() => { void save(); }, 600); return () => clearTimeout(timer); }, [answers, request, busy, error, done]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (saver.current?.dirty(latest.current)) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, []);
  const close = async () => { if (saving.current) await inflight.current; if (saving.current) return; if (done || !request) props.onClose(); else if (!error) await save("close"); };
  const locked = (busy && intent !== "autosave") || failedIntent !== null;
  const q = request?.questions[index];
  // The question, its help text, whether it's required and any problem are read
  // out with the answer field (or the group of choices), not only shown above it.
  const fieldId = `member-form-${props.requestId}-${index}`;
  const field = q ? {
    "aria-labelledby": `${fieldId}-title`,
    "aria-describedby": [q.description ? `${fieldId}-help` : "", q.answerFormat ? `${fieldId}-format` : "", `${fieldId}-count`, validation ? `${fieldId}-issue` : ""].filter(Boolean).join(" "),
    "aria-invalid": validation ? true : undefined,
  } : {};
  return <div onKeyDown={e => { if (e.key === "Escape" && !props.preview) { e.stopPropagation(); void close(); } }}>
    <header><h2>{request?.name ?? "Your next step"}</h2><button disabled={busy} onClick={() => void close()} aria-label="Save and close form"><X size={20} /></button></header>
    {done ? <section ref={questionSection}><h2>Submitted</h2><p>You’re all set.</p><button onClick={props.onClose}>Done</button></section> : q ? <section ref={questionSection} onChange={() => setValidation(null)}>
      <div className="member-form-progress" aria-hidden="true"><span style={{ width: `${((index + 1) / request!.questions.length) * 100}%` }} /></div><small id={`${fieldId}-count`}>{index + 1} of {request!.questions.length}{q.required ? " · Required" : " · Optional"}</small><h2 id={`${fieldId}-title`}>{q.title}</h2>{q.description ? <p id={`${fieldId}-help`}>{q.description}</p> : null}
      {q.answerFormat ? <p id={`${fieldId}-format`} className="member-form-format">{FORMAT_HINTS[q.answerFormat]}</p> : null}
      {q.type.endsWith("choice") ? <fieldset className="member-form-choices" {...field}>{q.options.map((option, i) => <label key={i}><input disabled={locked} name={q.key} type={q.type === "single_choice" ? "radio" : "checkbox"}
        checked={q.type === "single_choice" ? answers[q.key] === String(i) : ((answers[q.key] as string[]) ?? []).includes(String(i))}
        onChange={e => setAnswers(a => ({ ...a, [q.key]: q.type === "single_choice" ? String(i) : e.target.checked ? [...((a[q.key] as string[]) ?? []), String(i)] : ((a[q.key] as string[]) ?? []).filter(v => v !== String(i)) }))} />{option}</label>)}</fieldset>
        : q.type === "long_text" ? <textarea {...field} aria-required={q.required} rows={5} maxLength={10000} disabled={locked} value={(answers[q.key] as string) ?? ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} />
        : <input {...field} aria-required={q.required} maxLength={10000} inputMode={q.answerFormat === "number" ? "decimal" : q.answerFormat === "url" ? "url" : undefined} disabled={locked} value={(answers[q.key] as string) ?? ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} />}
      {/* Right under the answer, so it's seen without scrolling and read out with the field. */}
      {validation ? <p role="alert" id={`${fieldId}-issue`} className="member-form-issue">{validation}</p> : null}
      <footer><button disabled={locked || !!error || index === 0} onClick={() => { setIndex(index - 1); setValidation(null); }}>Back</button><button disabled={locked || !!error} onClick={async () => {
        const answerField = () => requestAnimationFrame(() => questionSection.current?.querySelector<HTMLElement>("input,textarea")?.focus());
        if (q.required && !formQuestionAnswered(q, answers)) { setValidation("Please answer this question."); answerField(); return; }
        const shape = q.answerFormat && typeof answers[q.key] === "string" ? communityClientAnswerFormatIssue(q.answerFormat, answers[q.key] as string) : null;
        if (shape) { setValidation(shape); answerField(); return; }
        await save(index === request!.questions.length - 1 ? "submit" : "continue");
      }}>{index === request!.questions.length - 1 ? "Submit" : "Continue"}</button><small role="status">{props.preview ? "Preview: answers aren't saved" : busy ? "Saving…" : saver.current?.dirty(answers) ? "Unsaved answers" : "Saved"}</small></footer>
    </section> : !error ? <p role="status">Loading form…</p> : null}
    {error ? <div role="alert"><p>{error}</p><button disabled={busy} onClick={() => failedIntent ? void save(failedIntent, true) : void load()}>Retry</button><button disabled={busy} onClick={() => void load()}>Discard edits and reload</button><button disabled={busy} onClick={props.onClose}>Discard unsaved answers and close</button></div> : null}
  </div>;
}
