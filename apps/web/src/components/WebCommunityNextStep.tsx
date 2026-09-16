import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight } from "lucide-react";
import type { AuthSession } from "../auth";
import { getMemberForm, saveMemberForm, subscribeMemberForms, type MemberFormSummary, type MemberFormRequest } from "../../../../shared/cloudCommunityFormRequestsGateway";
import { formAnswersIssue, formQuestionAnswered, type FormAnswers } from "../../../../shared/communityFormAnswers";
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
function MemberFormRunner(props: Props & { requestId: string; onClose: () => void }) {
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
  useEffect(() => {
    questionSection.current?.querySelector<HTMLElement>("input,textarea,button")?.focus();
  }, [index, request?.id, done]);
  const alive = useRef(true), saving = useRef(false);
  const latest = useRef(answers); latest.current = answers;
  const saver = useRef<ReturnType<typeof createMemberFormSave> | null>(null);
  const current = useRef<MemberFormRequest | null>(null);
  const session = useRef(props.session); session.current = props.session;
  const load = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setIntent("close");
    try { const ready = await props.ensureSession(session.current, "member_form"); if (!ready) throw new Error("session_unavailable"); if (!alive.current) return;
      const row = await getMemberForm(ready, props.communityId, props.requestId); if (!alive.current) return;
      current.current = row;
      saver.current = createMemberFormSave(row, async attempt => {
        const ready = await props.ensureSession(session.current, "member_form");
        if (!ready || !alive.current) throw new Error("session_unavailable");
        return saveMemberForm(ready, props.communityId, { ...row, revision: attempt.revision }, attempt.answers, attempt.intent === "submit");
      });
      setRequest(row); setAnswers(row.answers); setError(null); setValidation(null); setFailedIntent(null);
      const next = row.questions.findIndex(q => !formQuestionAnswered(q, row.answers)); setIndex(Math.max(0, next));
    } catch { if (alive.current) { setFailedIntent(null); setError("This form could not be opened. It may no longer be required."); } }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);
  const save = async (nextIntent: FormSaveIntent = "autosave", retry = false) => {
    if (saving.current || !current.current || !saver.current) return false;
    const snapshot = latest.current;
    const issue = retry ? null : formAnswersIssue(current.current.questions, snapshot, nextIntent === "submit"); if (issue) { setValidation(issue); return false; }
    setValidation(null);
    saving.current = true; setBusy(true); setIntent(nextIntent);
    try {
      const result = await saver.current.run(nextIntent, snapshot, retry);
      if (!alive.current || !result) return false;
      setError(null); setFailedIntent(null);
      if (result.submitted) setDone(true);
      else if (result.intent === "continue") setIndex(n => n + 1);
      else if (result.intent === "close") props.onClose();
      return true;
    } catch (e) { if (alive.current) { setFailedIntent(nextIntent); setError(String(e).includes("conflict") ? "Changed in another session. Reload saved answers before continuing." : "Could not save. Your answers are still here. Retry the same operation or discard and reload."); } return false;
    } finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { if (!request || done || busy || error || !saver.current?.dirty(answers)) return; const timer = setTimeout(() => { void save(); }, 600); return () => clearTimeout(timer); }, [answers, request, busy, error, done]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (saver.current?.dirty(latest.current)) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, []);
  const close = async () => { if (saving.current) return; if (done || !request) props.onClose(); else if (!error) await save("close"); };
  const locked = (busy && intent !== "autosave") || failedIntent !== null;
  const q = request?.questions[index];
  return <div onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); void close(); } }}>
    <header><h2>{request?.name ?? "Your next step"}</h2><button disabled={busy} onClick={() => void close()} aria-label="Save and close form"><X size={20} /></button></header>
    {done ? <section ref={questionSection}><h2>Submitted</h2><p>You’re all set.</p><button onClick={props.onClose}>Done</button></section> : q ? <section ref={questionSection} onChange={() => setValidation(null)}>
      <small>{index + 1} of {request!.questions.length}{q.required ? " · Required" : " · Optional"}</small><h2>{q.title}</h2>{q.description ? <p>{q.description}</p> : null}
      {q.type.endsWith("choice") ? <div className="member-form-choices">{q.options.map((option, i) => <label key={i}><input disabled={locked} name={q.key} type={q.type === "single_choice" ? "radio" : "checkbox"}
        checked={q.type === "single_choice" ? answers[q.key] === String(i) : ((answers[q.key] as string[]) ?? []).includes(String(i))}
        onChange={e => setAnswers(a => ({ ...a, [q.key]: q.type === "single_choice" ? String(i) : e.target.checked ? [...((a[q.key] as string[]) ?? []), String(i)] : ((a[q.key] as string[]) ?? []).filter(v => v !== String(i)) }))} />{option}</label>)}</div>
        : q.type === "long_text" ? <textarea aria-label={q.title} rows={5} maxLength={10000} disabled={locked} value={(answers[q.key] as string) ?? ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} />
        : <input aria-label={q.title} maxLength={10000} disabled={locked} value={(answers[q.key] as string) ?? ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} />}
      <footer><button disabled={busy || !!error || index === 0} onClick={() => { setIndex(index - 1); setValidation(null); }}>Back</button><button disabled={busy || !!error} onClick={async () => {
        if (q.required && !formQuestionAnswered(q, answers)) { setValidation("Please answer this question."); return; }
        await save(index === request!.questions.length - 1 ? "submit" : "continue");
      }}>{index === request!.questions.length - 1 ? "Submit" : "Continue"}</button><small role="status">{busy ? "Saving…" : saver.current?.dirty(answers) ? "Unsaved answers" : "Saved"}</small></footer>
      {validation ? <p role="alert">{validation}</p> : null}
    </section> : !error ? <p role="status">Loading form…</p> : null}
    {error ? <div role="alert"><p>{error}</p><button disabled={busy} onClick={() => failedIntent ? void save(failedIntent, true) : void load()}>Retry</button><button disabled={busy} onClick={() => void load()}>Discard edits and reload</button><button disabled={busy} onClick={props.onClose}>Discard unsaved answers and close</button></div> : null}
  </div>;
}
