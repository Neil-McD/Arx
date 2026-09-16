import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { blankCommunityFormQuestion, communityFormIssue, communityFormValidationIssue, COMMUNITY_FORM_MAX_FORMS, COMMUNITY_FORM_MAX_QUESTIONS, type CommunityFormDraft, type CommunityFormQuestion, type CommunityFormValidationIssue } from "../../../../shared/communityForms";
import type { CommunityFormsGateway } from "../controllers/useWebCommunityFormsGateway";
import "./WebCommunityForms.css";

const contentKey = (form: CommunityFormDraft) => JSON.stringify({ name: form.name, questions: form.questions });
const errorText = (error: unknown, operation: "save" | "publish") => String(error).includes("form_revision_conflict")
  ? "This form changed in another session. Your edits are still here. Reload the saved form to continue."
  : operation === "publish" ? "Could not confirm publication. Your draft is saved. Retry publishing to confirm it safely."
  : "Could not save. Your edits are still here. Try again.";

type LeaveGuard = MutableRefObject<(() => Promise<boolean>) | null>;
export function WebCommunityForms({ gateway, leaveGuard }: { gateway: CommunityFormsGateway; leaveGuard?: LeaveGuard }) {
  const [forms, setForms] = useState<CommunityFormDraft[]>([]);
  const [selected, setSelected] = useState<CommunityFormDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(false);
    gateway.load().then(rows => { if (active) setForms(rows); }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [gateway, refresh]);
  if (selected) return <CommunityFormEditor key={selected.key} initial={selected} gateway={gateway} leaveGuard={leaveGuard}
    onBack={() => { setSelected(null); setRefresh(n => n + 1); }} />;
  return <div className="workflow-page community-forms-page">
    {loading ? <p role="status">Loading forms…</p> : error ? <p role="alert">Could not load forms. <button className="workflow-secondary-button" onClick={() => setRefresh(n => n + 1)}>Try again</button></p> : <>
      <div className="community-form-list">{forms.map(form => <button key={form.key} onClick={() => setSelected(form)}>
        <span>{form.name || "Untitled form"}</span><small>{form.questions.length} questions · {form.publishedRevision === form.revision ? "Published" : form.publishedRevision ? "Unpublished edits" : "Draft"}</small>
      </button>)}</div>
      <button className="workflow-secondary-button" disabled={forms.length >= COMMUNITY_FORM_MAX_FORMS} onClick={() => setSelected({ key: crypto.randomUUID(), name: "Untitled form", questions: [blankCommunityFormQuestion()], revision: 0, publishedRevision: null })}><Plus size={16} /> New form</button>
      {!forms.length ? <p className="community-form-hint">Build a form, then preview it one question at a time.</p> : null}
    </>}
  </div>;
}

export function CommunityFormEditor({ initial, gateway, onBack, leaveGuard }: { initial: CommunityFormDraft; gateway: CommunityFormsGateway; onBack: () => void; leaveGuard?: LeaveGuard }) {
  const [draft, setDraft] = useState(initial);
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState(false);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [validation, setValidation] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; operation: "save" | "publish" } | null>(null);
  const [validationTarget, setValidationTarget] = useState<CommunityFormValidationIssue | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!validationTarget) return;
    const label = validationTarget.field === "name" ? "Form name" : validationTarget.field === "options" ? "Option 1" : validationTarget.field === "description" ? "Question description" : "Question";
    editor.current?.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.focus();
    setValidationTarget(null);
  }, [validationTarget]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(initial.publishedRevision);
  const [revision, setRevision] = useState(initial.revision);
  const desired = useRef(draft); desired.current = draft;
  const saved = useRef(initial.revision ? contentKey(initial) : "");
  const persisted = useRef(initial);
  const inFlight = useRef<Promise<void> | null>(null);
  const alive = useRef(true);
  const dragged = useRef<number | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const dirty = contentKey(draft) !== saved.current;
  const flush = async () => {
    while (inFlight.current) await inFlight.current;
    if (!alive.current || saved.current === contentKey(desired.current)) return;
    const snapshot = { ...desired.current, revision: persisted.current.revision };
    const issue = communityFormIssue(snapshot); if (issue) { setError({ message: issue, operation: "save" }); throw new Error(issue); }
    setSaving(true);
    const pending = gateway.save(snapshot).then(result => {
      persisted.current = result; saved.current = contentKey(snapshot);
      if (alive.current) { setRevision(result.revision); setPublished(result.publishedRevision); setError(null); }
    }).catch(e => { if (alive.current) setError({ message: errorText(e, "save"), operation: "save" }); throw e; });
    inFlight.current = pending;
    try { await pending; } finally { inFlight.current = null; if (alive.current) setSaving(false); }
  };
  const prepareLeave = async () => {
    if (publishing) return false;
    try {
      do { await flush(); } while (alive.current && saved.current !== contentKey(desired.current));
      return alive.current;
    } catch { return false; }
  };
  useEffect(() => {
    if (!leaveGuard) return;
    leaveGuard.current = prepareLeave;
    return () => { leaveGuard.current = null; };
  });
  useEffect(() => {
    if (!dirty || saving || error || publishing) return;
    const timer = window.setTimeout(() => { void flush().catch(() => {}); }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, saving, error, publishing]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saved.current !== contentKey(desired.current)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const q = draft.questions[index] ?? draft.questions[0];
  const patch = (change: Partial<CommunityFormQuestion>) => { setValidation(null); setDraft(d => ({ ...d, questions: d.questions.map(item => item.key === q.key ? { ...item, ...change } : item) })); };
  const move = (from: number, to: number) => {
    if (publishing || to < 0 || to >= draft.questions.length || from === to) return;
    const items = [...draft.questions]; const [item] = items.splice(from, 1); items.splice(to, 0, item);
    setDraft({ ...draft, questions: items }); setIndex(to);
  };
  const close = async () => { if (await prepareLeave()) onBack(); };
  const publish = async () => {
    const issue = communityFormValidationIssue(desired.current, true);
    if (issue) { if (issue.questionIndex !== undefined) setIndex(issue.questionIndex); setValidation(issue.message); setValidationTarget(issue); return; }
    setPublishing(true); setValidation(null);
    try {
      try { await flush(); } catch { return; } // Save failure remains a save retry.
      if (!alive.current) return;
      try { const result = await gateway.publish(persisted.current);
        if (alive.current) { persisted.current = result; setPublished(result.publishedRevision); setError(null); }
      } catch (e) { if (alive.current) setError({ message: errorText(e, "publish"), operation: "publish" }); }
    } finally { if (alive.current) setPublishing(false); }
  };
  const next = () => {
    const value = answers[q.key];
    if (q.required && (!value || (typeof value === "string" ? !value.trim() : !value.length))) { setValidation("Please answer this question."); return; }
    setValidation(null); if (index === draft.questions.length - 1) setFinished(true); else setIndex(index + 1);
  };
  return <div ref={editor} className="workflow-page community-forms-page">
    <header className="community-forms-header">
      <button className="workflow-secondary-button" disabled={publishing} onClick={() => void close()}><ArrowLeft size={16} /> Forms</button>
      <input className="community-form-name" aria-label="Form name" maxLength={120} disabled={preview || publishing} value={draft.name} onChange={e => { setValidation(null); setDraft({ ...draft, name: e.target.value }); }} />
      <span className="community-form-hint" role="status">{saving ? "Saving…" : dirty ? "Unsaved edits" : published === revision ? "Published" : published ? "Unpublished edits · Saved" : "Draft saved"}</span>
      <button className="workflow-secondary-button" onClick={() => { setPreview(!preview); setFinished(false); setIndex(0); setValidation(null); setAnswers({}); }}>{preview ? "Edit" : "Preview"}</button>
      {!preview ? <button className="workflow-secondary-button" disabled={publishing || saving || (!dirty && published === revision)} onClick={() => void publish()}>{publishing ? "Publishing…" : "Publish"}</button> : null}
    </header>
    {error ? <div role="alert" className="workflow-error">{error.message} <button className="workflow-secondary-button" disabled={publishing || saving} onClick={() => { if (error.operation === "publish") void publish(); else { setError(null); void flush().catch(() => {}); } }}>{error.operation === "publish" ? "Retry publish" : "Retry save"}</button>
      <button className="workflow-secondary-button" disabled={publishing || saving} onClick={async () => { try { const rows = await gateway.load(); const row = rows.find(f => f.key === draft.key); if (alive.current && row) { persisted.current = row; saved.current = contentKey(row); setDraft(row); setRevision(row.revision); setPublished(row.publishedRevision); setIndex(0); setError(null); } else if (alive.current) setError({ ...error, message: "Saved form not found. Your edits are still here." }); } catch { if (alive.current) setError({ ...error, message: "Could not reload the saved form." }); } }}>Discard edits and reload</button></div> : null}
    <div className={`community-form-workspace ${preview ? "is-preview" : ""}`}>
      {!preview ? <aside aria-label="Questions" className="community-form-questions">
        {draft.questions.map((item, i) => <div className={i === index ? "is-selected" : ""} key={item.key} draggable={!publishing}
          onDragStart={() => { dragged.current = i; }} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragged.current !== null) move(dragged.current, i); dragged.current = null; }}>
          <button disabled={publishing} aria-current={i === index ? "step" : undefined} onClick={() => { setIndex(i); setValidation(null); }}><span>{i + 1}</span>{item.title || "Untitled question"}</button>
          <button disabled={publishing || i === 0} aria-label={`Move question ${i + 1} up`} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></button>
          <button disabled={publishing || i === draft.questions.length - 1} aria-label={`Move question ${i + 1} down`} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></button>
        </div>)}
        <button className="workflow-secondary-button" disabled={publishing || draft.questions.length >= COMMUNITY_FORM_MAX_QUESTIONS} onClick={() => { setDraft({ ...draft, questions: [...draft.questions, blankCommunityFormQuestion()] }); setIndex(draft.questions.length); }}><Plus size={15} /> Add question</button>
      </aside> : null}
      <main className="community-form-canvas">
        {!preview ? <div className="community-form-tools">
          <label>Answer <select disabled={publishing} aria-label="Answer type" value={q.type} onChange={e => { const type = e.target.value as CommunityFormQuestion["type"]; patch({ type, options: type.endsWith("choice") && q.options.length < 2 ? ["", ""] : q.options }); }}>
            <option value="short_text">Short text</option><option value="long_text">Long text</option><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option>
          </select></label>
          <label><input type="checkbox" disabled={publishing} checked={q.required} onChange={e => patch({ required: e.target.checked })} /> Required</label>
          <button className="workflow-secondary-button" aria-label="Delete question" disabled={publishing || draft.questions.length === 1} onClick={() => { setDraft({ ...draft, questions: draft.questions.filter(item => item.key !== q.key) }); setIndex(Math.max(0, index - 1)); }}><Trash2 size={15} /></button>
        </div> : <p className="community-form-hint">Preview only · Answers are not submitted</p>}
        {finished ? <div className="community-form-question"><h2>Preview complete</h2><p>No answers were submitted.</p><button className="workflow-secondary-button" onClick={() => { setFinished(false); setIndex(0); }}>Start again</button></div> : <div className="community-form-question" key={`${q.key}-${preview}`}>
          <p className="community-form-hint">{index + 1} / {draft.questions.length}{q.required ? " · Required" : " · Optional"}</p>
          {preview ? <><h2>{q.title || "Untitled question"}</h2>{q.description ? <p>{q.description}</p> : null}</> : <>
            <textarea className="community-form-title" rows={2} aria-label="Question" placeholder="Your question goes here…" maxLength={500} disabled={publishing} value={q.title} onChange={e => patch({ title: e.target.value })} />
            <textarea className="community-form-description" rows={2} aria-label="Question description" placeholder="Add a description (optional)" maxLength={2000} disabled={publishing} value={q.description} onChange={e => patch({ description: e.target.value })} />
          </>}
          {q.type.endsWith("choice") ? <div className="community-form-options">{q.options.map((option, i) => preview ? <label key={i}><input type={q.type === "single_choice" ? "radio" : "checkbox"} name={q.key} checked={q.type === "single_choice" ? answers[q.key] === String(i) : (answers[q.key] as string[] | undefined)?.includes(String(i)) ?? false} onChange={e => setAnswers(a => ({ ...a, [q.key]: q.type === "single_choice" ? String(i) : e.target.checked ? [...((a[q.key] as string[]) || []), String(i)] : ((a[q.key] as string[]) || []).filter(v => v !== String(i)) }))} />{option || `Option ${i + 1}`}</label> : <div key={i}><span>{String.fromCharCode(65 + i)}</span><input aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} maxLength={200} disabled={publishing} value={option} onChange={e => patch({ options: q.options.map((v, n) => n === i ? e.target.value : v) })} /><button aria-label={`Remove option ${i + 1}`} disabled={publishing || q.options.length <= 2} onClick={() => patch({ options: q.options.filter((_, n) => n !== i) })}>×</button></div>)}
            {!preview ? <button className="workflow-secondary-button" disabled={publishing || q.options.length >= 12} onClick={() => patch({ options: [...q.options, ""] })}><Plus size={14} /> Add option</button> : null}</div> : q.type === "long_text" ? <textarea className="community-form-answer" rows={4} aria-label="Your answer" placeholder="Type your answer here…" disabled={!preview} value={(answers[q.key] as string) || ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} /> : <input className="community-form-answer" aria-label="Your answer" placeholder="Type your answer here…" disabled={!preview} value={(answers[q.key] as string) || ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} />}
          {validation ? <p className="workflow-error" role="alert">{validation}</p> : null}
          {preview ? <div className="community-form-navigation"><button className="workflow-secondary-button" disabled={index === 0} onClick={() => { setIndex(index - 1); setValidation(null); }}>Back</button><button className="workflow-secondary-button" onClick={next}>{index === draft.questions.length - 1 ? "Finish preview" : "Continue"}</button></div> : <p className="community-form-hint">Drafts save automatically. Publishing creates a fixed version for future requests.</p>}
        </div>}
      </main>
    </div>
  </div>;
}
