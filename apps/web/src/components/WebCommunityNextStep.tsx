import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight } from "lucide-react";
import type { AuthSession } from "../auth";
import { getMemberForm, saveMemberForm, subscribeMemberForms, type MemberFormSummary, type MemberFormRequest } from "../../../../shared/cloudCommunityFormRequestsGateway";
import { formAnswersIssue, formQuestionAnswered, type FormAnswers } from "../../../../shared/communityFormAnswers";
import "./WebCommunityNextStep.css";

type Props = { communityId: string; session: AuthSession; ensureSession: (session: AuthSession, source?: string) => Promise<AuthSession | null> };
export function WebCommunityNextStep(props: Props) {
  const [rows, setRows] = useState<MemberFormSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true; setError(false);
    const stop = subscribeMemberForms(props.session, props.communityId, props.ensureSession, r => { if (alive) { setRows(r); setError(false); } }, () => { if (alive) { setRows([]); setError(true); } });
    return () => { alive = false; stop(); };
  }, [props.session, props.communityId, props.ensureSession, retry]);
  const close = () => { setOpen(false); setSelected(null); button.current?.focus(); };
  const first = rows[0];
  return <>
    {first ? <button ref={button} className="community-next-step" onClick={() => { setSelected(first.id); setOpen(true); }}>
      <small>Your next step</small><strong>{first.name}</strong>
      <span>{first.answered} of {first.total} questions answered</span>
      <span className="community-next-step-action">{first.answered ? "Continue" : "Start"}<ArrowRight size={14} /></span>
    </button> : error ? <button className="community-next-step" onClick={() => setRetry(n => n + 1)}>Could not load your next step · Retry</button> : null}
    {rows.length > 1 ? <button className="community-next-step-count" onClick={() => { setSelected(null); setOpen(true); }}>{rows.length} pending</button> : null}
    {open ? <MemberFormDialog {...props} rows={rows} selected={selected} onSelect={setSelected} onClose={close} /> : null}
  </>;
}
function MemberFormDialog(props: Props & { rows: MemberFormSummary[]; selected: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.getElementById("root"); root?.setAttribute("inert", "");
    dialog.current?.focus();
    return () => root?.removeAttribute("inert");
  }, []);
  return createPortal(<div className="member-form-backdrop"><div className="member-form-dialog" role="dialog" aria-modal="true" aria-label="Your next step" tabIndex={-1} ref={dialog}
    onKeyDown={e => { if (e.key !== "Tab") return; const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)') ?? []);
      const first = controls[0], last = controls.at(-1); if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }}>
    {props.selected ? <MemberFormRunner key={props.selected} {...props} requestId={props.selected} /> : <><header><h2>Your next steps</h2><button onClick={props.onClose} aria-label="Close"><X size={20} /></button></header>
      {props.rows.map(row => <button className="member-form-list-row" key={row.id} onClick={() => props.onSelect(row.id)}>{row.name}<span>{row.answered} of {row.total} answered</span></button>)}</>}
  </div></div>, document.body);
}
function MemberFormRunner(props: Props & { requestId: string; onClose: () => void }) {
  const [request, setRequest] = useState<MemberFormRequest | null>(null);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const alive = useRef(true), saving = useRef(false);
  const latest = useRef(answers); latest.current = answers;
  const saved = useRef("{}");
  const current = useRef<MemberFormRequest | null>(null);
  const session = useRef(props.session); session.current = props.session;
  const load = async () => {
    try { const ready = await props.ensureSession(session.current, "member_form"); if (!ready || !alive.current) return;
      const row = await getMemberForm(ready, props.communityId, props.requestId); if (!alive.current) return;
      current.current = row; saved.current = JSON.stringify(row.answers); setRequest(row); setAnswers(row.answers); setError(null);
      const next = row.questions.findIndex(q => !formQuestionAnswered(q, row.answers)); setIndex(Math.max(0, next));
    } catch { if (alive.current) setError("This form could not be opened. It may no longer be required."); }
  };
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);
  const save = async (submit = false) => {
    if (saving.current || !current.current) return false;
    const snapshot = latest.current;
    if (!submit && JSON.stringify(snapshot) === saved.current) return true;
    const issue = formAnswersIssue(current.current.questions, snapshot, submit); if (issue) { setError(issue); return false; }
    saving.current = true; setBusy(true);
    try { const ready = await props.ensureSession(session.current, "member_form"); if (!ready || !alive.current) return false;
      const result = await saveMemberForm(ready, props.communityId, current.current, snapshot, submit);
      if (!alive.current) return false;
      current.current = { ...current.current, revision: result.revision }; saved.current = JSON.stringify(snapshot); setError(null); if (result.submitted) setDone(true); return true;
    } catch (e) { if (alive.current) setError(String(e).includes("conflict") ? "Changed in another session. Reload saved answers before continuing." : "Could not save. Your answers are still here. Retry or reopen the form."); return false;
    } finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { if (!request || done || busy || error) return; const timer = setTimeout(() => { void save(); }, 600); return () => clearTimeout(timer); }, [answers, request, busy, error, done]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (saved.current !== JSON.stringify(latest.current)) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, []);
  const close = async () => { if (done || !request || await save()) props.onClose(); };
  const q = request?.questions[index];
  return <div onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); void close(); } }}>
    <header><h2>{request?.name ?? "Your next step"}</h2><button disabled={busy} onClick={() => void close()} aria-label="Save and close form"><X size={20} /></button></header>
    {done ? <section><h2>Submitted</h2><p>You’re all set.</p><button onClick={props.onClose}>Done</button></section> : q ? <section>
      <small>{index + 1} of {request!.questions.length}{q.required ? " · Required" : " · Optional"}</small><h2>{q.title}</h2>{q.description ? <p>{q.description}</p> : null}
      {q.type.endsWith("choice") ? <div className="member-form-choices">{q.options.map((option, i) => <label key={i}><input disabled={busy} name={q.key} type={q.type === "single_choice" ? "radio" : "checkbox"}
        checked={q.type === "single_choice" ? answers[q.key] === String(i) : ((answers[q.key] as string[]) ?? []).includes(String(i))}
        onChange={e => setAnswers(a => ({ ...a, [q.key]: q.type === "single_choice" ? String(i) : e.target.checked ? [...((a[q.key] as string[]) ?? []), String(i)] : ((a[q.key] as string[]) ?? []).filter(v => v !== String(i)) }))} />{option}</label>)}</div>
        : q.type === "long_text" ? <textarea aria-label={q.title} rows={5} maxLength={10000} disabled={busy} value={(answers[q.key] as string) ?? ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} />
        : <input aria-label={q.title} maxLength={10000} disabled={busy} value={(answers[q.key] as string) ?? ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} />}
      <footer><button disabled={busy || index === 0} onClick={() => { setIndex(index - 1); setError(null); }}>Back</button><button disabled={busy} onClick={async () => {
        if (q.required && !formQuestionAnswered(q, answers)) { setError("Please answer this question."); return; }
        if (index === request!.questions.length - 1) await save(true); else if (await save()) { setIndex(index + 1); setError(null); }
      }}>{index === request!.questions.length - 1 ? "Submit" : "Continue"}</button><small role="status">{busy ? "Saving…" : JSON.stringify(answers) !== saved.current ? "Unsaved answers" : "Saved"}</small></footer>
    </section> : !error ? <p role="status">Loading form…</p> : null}
    {error ? <div role="alert"><p>{error}</p><button disabled={busy} onClick={() => request ? void save() : void load()}>Retry</button><button disabled={busy} onClick={() => void load()}>Discard edits and reload</button><button disabled={busy} onClick={props.onClose}>Discard unsaved answers and close</button></div> : null}
  </div>;
}
