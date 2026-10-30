import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, ChevronDown, ChevronRight, ClipboardList, GripVertical, MoreHorizontal, Plus, Sparkles, Trash2 } from "lucide-react";
import { WorkflowSentence, type WorkflowSentencePart } from "./workflowSubjectPills";
import { blankCommunityFormQuestion, communityFormIssue, communityFormValidationIssue, COMMUNITY_FORM_MAX_FORMS, COMMUNITY_FORM_MAX_QUESTIONS, type CommunityFormDraft, type CommunityFormQuestion, type CommunityFormUse, type CommunityFormValidationIssue } from "../../../../shared/communityForms";
import type { CommunityFormsGateway } from "../controllers/useWebCommunityFormsGateway";
import { communityClientPropertyAcceptsQuestion, type CommunityClientPropertyType } from "../../../../shared/communityClients";
import "./WebCommunityForms.css";

const clientPropertyFits = (propertyType: string, questionType: string) =>
  communityClientPropertyAcceptsQuestion(propertyType as CommunityClientPropertyType, questionType);

const contentKey = (form: CommunityFormDraft) => JSON.stringify({ name: form.name, questions: form.questions });
const errorText = (error: unknown, operation: "save" | "publish") => String(error).includes("form_revision_conflict")
  ? "This form changed in another session. Your edits are still here. Reload the saved form to continue."
  : String(error).includes("form_property_options_mismatch")
  ? "A choice question fills a property that doesn't have all its choices. Add them to the property, or change the question's choices."
  : String(error).includes("form_property_type_mismatch")
  ? "A question fills a property that can't hold its kind of answer. Pick another property under Fills."
  : String(error).includes("client_property_not_found")
  ? "A question fills a member property that no longer exists. Pick another property under Fills."
  : operation === "publish" ? "Could not confirm publication. Your draft is saved. Retry publishing to confirm it safely."
  : "Could not save. Your edits are still here. Try again.";

type LeaveGuard = MutableRefObject<(() => Promise<boolean>) | null>;
type Property = { key: string; name: string; type: string; options: string[] };

/** One short line per place a form is used, without repeating the form's name:
 *  "Sent in [Onboarding]", "Starts a step in [Onboarding]", "[Welcome page] join form". */
export function formUseParts(_form: CommunityFormDraft, use: CommunityFormUse): WorkflowSentencePart[] {
  if (use.kind === "welcome_page") return [{ pill: "stage", text: "Welcome page" }, " join form"];
  return [use.role === "sends" ? "Sent in " : "Starts a step in ", { pill: "stage", text: use.stageName || "a stage" }, ...(use.paused ? [" (off)"] : [])];
}
/** "2 automations · Welcome page" */
export function formUseSummary(uses: CommunityFormUse[]): string {
  const automations = uses.filter(use => use.kind === "automation").length;
  return [automations ? `${automations} automation${automations === 1 ? "" : "s"}` : "", uses.some(use => use.kind === "welcome_page") ? "Welcome page" : ""]
    .filter(Boolean).join(" · ");
}
const formFills = (form: CommunityFormDraft, properties: Property[]) => [...new Set(form.questions.flatMap(q => q.clientPropertyKey ? [q.clientPropertyKey] : []))]
  .map(key => properties.find(p => p.key === key)?.name ?? key);
const formStatus = (form: CommunityFormDraft) => form.publishedRevision === form.revision ? "published" : form.publishedRevision ? "edited" : "draft";
const atLimitFor = (forms: CommunityFormDraft[], deleted: CommunityFormDraft[]) => forms.length + deleted.length >= COMMUNITY_FORM_MAX_FORMS;
const STATUS_LABEL = { published: "Published", edited: "Unpublished edits", draft: "Draft" } as const;

// Workflows → Forms as a Notion-style table: drag a row to reorder, see where
// each form is used, and delete one only when nothing uses it.
export function WebCommunityForms({ gateway, leaveGuard }: { gateway: CommunityFormsGateway; leaveGuard?: LeaveGuard }) {
  const [forms, setForms] = useState<CommunityFormDraft[]>([]);
  const [deleted, setDeleted] = useState<CommunityFormDraft[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selected, setSelected] = useState<CommunityFormDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "used" | "unused">("all");
  const [menu, setMenu] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const dragged = useRef<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("the agent");
  const [drafting, setDrafting] = useState<{ brief: string; busy: boolean; error: string | null } | null>(null);
  const [drafted, setDrafted] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError(false);
    gateway.load().then(rows => { if (active) setForms(rows); }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    gateway.loadDeleted?.().then(rows => { if (active) setDeleted(rows); }).catch(() => {});
    gateway.clientProperties?.().then(rows => { if (active) setProperties(rows); }).catch(() => {});
    return () => { active = false; };
  }, [gateway, refresh]);
  useEffect(() => {
    let active = true;
    gateway.agentName?.().then(name => { if (active && name) setAgentName(name); }).catch(() => {});
    return () => { active = false; };
  }, [gateway]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".community-form-menu")) setMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [menu]);
  if (selected) return <CommunityFormEditor key={selected.key} initial={selected} gateway={gateway} leaveGuard={leaveGuard}
    draftedBy={drafted === selected.key ? agentName : undefined}
    onBack={() => { setSelected(null); setDrafted(null); setRefresh(n => n + 1); }} />;
  const draftWithAgent = async () => {
    if (!drafting?.brief.trim() || !gateway.draftWithAgent) return;
    setDrafting({ ...drafting, busy: true, error: null });
    try {
      const form = await gateway.draftWithAgent(drafting.brief);
      const key = crypto.randomUUID();
      setDrafting(null); setDrafted(key);
      setSelected({ key, name: form.name, questions: form.questions, revision: 0, publishedRevision: null });
    } catch (e) {
      const text = String(e);
      setDrafting(d => d && { ...d, busy: false, error: text.includes("form_draft_unreadable") || text.includes("form_draft_empty")
        ? `${agentName} didn't return a usable form. Try again, or say a little more about what it's for.`
        : `${agentName} couldn't write the form right now. Try again in a minute, or start a blank form.` });
    }
  };
  const draftButton = gateway.draftWithAgent ? <button type="button" className="workflow-secondary-button community-form-agent-button" disabled={atLimitFor(forms, deleted) || Boolean(drafting)} onClick={() => setDrafting({ brief: "", busy: false, error: null })}><Sparkles size={15} aria-hidden="true" /> Draft with {agentName}</button> : null;
  const draftPanel = drafting ? <form className="community-form-agent" onSubmit={e => { e.preventDefault(); void draftWithAgent(); }}>
    <label htmlFor="community-form-agent-brief"><Sparkles size={15} aria-hidden="true" /> What's this form for?</label>
    <p>{agentName} writes the questions and links each answer to a member field. Nothing goes to members until you check it and press Publish.</p>
    <textarea id="community-form-agent-brief" rows={3} maxLength={2000} autoFocus disabled={drafting.busy} value={drafting.brief}
      placeholder="A welcome form that asks what kind of business they run, how big it is and what they want to build first"
      onChange={e => setDrafting({ ...drafting, brief: e.target.value, error: null })}
      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void draftWithAgent(); } }} />
    {drafting.error ? <p className="workflow-error" role="alert">{drafting.error}</p> : null}
    <div>
      <button type="button" className="workflow-secondary-button" disabled={drafting.busy} onClick={() => setDrafting(null)}>Cancel</button>
      <button type="submit" className="pn-wf-primary" disabled={drafting.busy || !drafting.brief.trim()}>{drafting.busy ? `${agentName} is writing…` : "Write the questions"}</button>
    </div>
  </form> : null;
  const newForm = () => setSelected({ key: crypto.randomUUID(), name: "Untitled form", questions: [blankCommunityFormQuestion()], revision: 0, publishedRevision: null });
  const atLimit = atLimitFor(forms, deleted);
  const used = (form: CommunityFormDraft) => (form.usedIn?.length ?? 0) > 0;
  const shown = forms.filter(form => filter === "all" || (filter === "used") === used(form));
  const drop = (target: string) => {
    const from = dragged.current; dragged.current = null; setDropOn(null);
    if (!from || from === target || !gateway.reorder) return;
    const keys = forms.map(form => form.key).filter(key => key !== from);
    keys.splice(keys.indexOf(target), 0, from);
    const before = forms;
    setForms(keys.map(key => forms.find(form => form.key === key)!));
    gateway.reorder(keys).catch(() => { setForms(before); setNotice("Couldn't save the new order. Try again."); });
  };
  const remove = async (form: CommunityFormDraft) => {
    setMenu(null);
    if (!gateway.remove || !window.confirm(`Delete “${form.name || "Untitled form"}”? Past answers stay on member records, and you can restore it from Deleted forms.`)) return;
    try { await gateway.remove(form.key); setNotice(`Deleted “${form.name}”.`); setRefresh(n => n + 1); }
    catch (e) { setNotice(String(e).includes("form_in_use") ? "That form is in use now. Take it out of its automations first." : "Couldn't delete the form. Try again."); setRefresh(n => n + 1); }
  };
  const restore = async (form: CommunityFormDraft) => {
    try { await gateway.restore?.(form.key); setNotice(`Restored “${form.name}”.`); setRefresh(n => n + 1); } catch { setNotice("Couldn't restore the form. Try again."); }
  };
  const count = (kind: "all" | "used" | "unused") => kind === "all" ? forms.length : forms.filter(form => (kind === "used") === used(form)).length;
  return <div className="workflow-page community-forms-page">
    <div className="pn-wf-section-head">
      <div>
        <h2>Forms</h2>
        <p>Questions members answer when they join or reach a stage. Their answers fill their member record.</p>
      </div>
      {!loading && !error && forms.length ? <div className="community-form-head-actions">{draftButton}<button type="button" className="pn-wf-primary" disabled={atLimit} onClick={newForm}><Plus size={16} aria-hidden="true" /> New form</button></div> : null}
    </div>
    {draftPanel}
    {notice ? <p className="community-form-notice" role="status">{notice} <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button></p> : null}
    {loading ? <p role="status" className="pn-wf-muted">Loading forms…</p> : error ? <p role="alert">Could not load forms. <button className="workflow-secondary-button" onClick={() => setRefresh(n => n + 1)}>Try again</button></p>
      : !forms.length ? <div className="pn-wf-empty">
        <span className="pn-wf-empty-icon" aria-hidden="true"><ClipboardList size={20} strokeWidth={2} /></span>
        <strong>No forms yet</strong>
        <p>Build a form, then preview it one question at a time.</p>
        <div className="community-form-head-actions">{draftButton}<button type="button" className="pn-wf-primary" onClick={newForm}><Plus size={16} aria-hidden="true" /> New form</button></div>
      </div>
      : <div className="community-form-table-card">
        <div className="community-form-filters" role="tablist" aria-label="Show forms">
          {(["all", "used", "unused"] as const).map(kind => <button key={kind} type="button" role="tab" aria-selected={filter === kind} onClick={() => setFilter(kind)}>
            {kind === "all" ? "All" : kind === "used" ? "In use" : "Not used"} <span>{count(kind)}</span></button>)}
        </div>
        <div className="community-form-table-scroll">
        <table className="community-form-table">
          <thead><tr><th aria-label="Drag to reorder" /><th>Name</th><th>Used in</th><th>Fills</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>{shown.map(form => {
            const status = formStatus(form);
            const fills = formFills(form, properties);
            return <tr key={form.key} className={dropOn === form.key ? "is-drop" : undefined}
              onDragOver={event => { if (dragged.current) { event.preventDefault(); setDropOn(form.key); } }} onDragLeave={() => setDropOn(null)} onDrop={() => drop(form.key)}>
              <td className="community-form-grip">{gateway.reorder && filter === "all" ? <span draggable aria-label={`Drag to reorder ${form.name}`} title="Drag to reorder"
                onDragStart={event => { dragged.current = form.key; event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragged.current = null; setDropOn(null); }}>
                <GripVertical size={15} aria-hidden="true" /></span> : null}</td>
              <td><button type="button" className="community-form-open" onClick={() => setSelected(form)}>
                <ClipboardList size={15} strokeWidth={2} aria-hidden="true" /><span><strong>{form.name || "Untitled form"}</strong>
                <small>{form.questions.length} {form.questions.length === 1 ? "question" : "questions"}</small></span></button></td>
              <td className="community-form-uses">{used(form) ? <>
                <strong>{formUseSummary(form.usedIn!)}</strong>
                {form.usedIn!.map((use, i) => <span key={i}><WorkflowSentence parts={formUseParts(form, use)} /></span>)}
              </> : <small>Not used anywhere</small>}</td>
              <td className="community-form-fills">{fills.length ? fills.map(name => <span key={name} className="pn-pill pn-pill-field">{name}</span>) : <small>—</small>}</td>
              <td><span className={`pn-wf-badge is-${status}`}>{STATUS_LABEL[status]}</span></td>
              <td className="community-form-menu">
                <button type="button" className="pn-au-iconbtn" aria-label={`More for ${form.name}`} aria-expanded={menu === form.key} onClick={() => setMenu(menu === form.key ? null : form.key)}>
                  <MoreHorizontal size={16} aria-hidden="true" /></button>
                {menu === form.key ? <div className="community-form-pop" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenu(null); setSelected(form); }}>Open</button>
                  {used(form) ? <div className="is-disabled" role="menuitem" aria-disabled="true">Delete<small>Used by {form.usedIn!.length === 1 ? "1 place" : `${form.usedIn!.length} places`}. Take it out of {form.usedIn!.some(use => use.kind === "welcome_page") ? "the Welcome page and its automations" : "its automations"} first.</small></div>
                    : <button type="button" role="menuitem" className="is-danger" disabled={!gateway.remove} onClick={() => void remove(form)}>Delete</button>}
                </div> : null}
              </td>
            </tr>;
          })}</tbody>
        </table>
        </div>
        {filter !== "all" ? <p className="community-form-foot">Show All to drag forms into a new order.</p> : null}
        {deleted.length ? <div className="community-form-deleted">
          <button type="button" aria-expanded={showDeleted} onClick={() => setShowDeleted(!showDeleted)}>{showDeleted ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />} Deleted forms ({deleted.length})</button>
          {showDeleted ? <ul>{deleted.map(form => <li key={form.key}><span>{form.name || "Untitled form"}</span>
            <button type="button" className="workflow-secondary-button" onClick={() => void restore(form)}>Restore</button></li>)}</ul> : null}
        </div> : null}
      </div>}
  </div>;
}

export function CommunityFormEditor({ initial, gateway, onBack, leaveGuard, draftedBy }: { initial: CommunityFormDraft; gateway: CommunityFormsGateway; onBack: () => void; leaveGuard?: LeaveGuard; draftedBy?: string }) {
  const [draft, setDraft] = useState(initial);
  const [clientProperties, setClientProperties] = useState<Array<{ key: string; name: string; type: string; options: string[] }>>([]);
  useEffect(() => {
    let active = true;
    gateway.clientProperties?.().then(rows => { if (active) setClientProperties(rows); }).catch(() => {});
    return () => { active = false; };
  }, [gateway]);
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
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [slash, setSlash] = useState<{ at: number } | null>(null);
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
  const TYPE_LABEL: Record<CommunityFormQuestion["type"], string> = { short_text: "Short text", long_text: "Long text", single_choice: "Single choice", multiple_choice: "Multiple choice" };
  const addQuestion = (type: CommunityFormQuestion["type"], at = draft.questions.length) => {
    if (publishing || draft.questions.length >= COMMUNITY_FORM_MAX_QUESTIONS) return;
    const question = { ...blankCommunityFormQuestion(), type, options: type.endsWith("choice") ? ["", ""] : [] };
    const questions = [...draft.questions]; questions.splice(at, 0, question);
    setDraft({ ...draft, questions }); setIndex(at); setSlash(null);
  };
  const propertyName = (key?: string) => key ? clientProperties.find(p => p.key === key)?.name ?? key : null;
  const fills = [...new Set(draft.questions.flatMap(item => item.clientPropertyKey ? [item.clientPropertyKey] : []))];
  const missing = (() => {
    const property = clientProperties.find(p => p.key === q.clientPropertyKey);
    return property && (property.type === "select" || property.type === "multi_select")
      ? { property, options: q.options.filter(option => !property.options.some(name => name.trim().toLowerCase() === option.trim().toLowerCase())) } : null;
  })();
  const status = saving ? "Saving…" : dirty ? "Unsaved edits" : published === revision ? "Published" : published ? "Unpublished edits · Saved" : "Draft saved";
  return <div ref={editor} className="workflow-page community-forms-page community-form-doc">
    <header className="community-forms-header">
      <nav className="community-form-crumb" aria-label="Breadcrumb">
        <button type="button" disabled={publishing} onClick={() => void close()}><ArrowLeft size={15} aria-hidden="true" /> Forms</button>
        <span aria-hidden="true">/</span><span>{draft.name || "Untitled form"}</span>
      </nav>
      <span className="community-form-hint" role="status" data-state={saving ? "saving" : dirty ? "dirty" : published === revision ? "published" : published ? "edited" : "draft"}>{status}</span>
      <button className="workflow-secondary-button" onClick={() => { setPreview(!preview); setFinished(false); setIndex(0); setValidation(null); setAnswers({}); }}>{preview ? "Edit" : "Preview"}</button>
      {!preview ? <button className="pn-wf-primary" disabled={publishing || saving || (!dirty && published === revision)} onClick={() => void publish()}>{publishing ? "Publishing…" : "Publish"}</button> : null}
    </header>
    {error ? <div role="alert" className="workflow-error">{error.message} <button className="workflow-secondary-button" disabled={publishing || saving} onClick={() => { if (error.operation === "publish") void publish(); else { setError(null); void flush().catch(() => {}); } }}>{error.operation === "publish" ? "Retry publish" : "Retry save"}</button>
      <button className="workflow-secondary-button" disabled={publishing || saving} onClick={async () => { try { const rows = await gateway.load(); const row = rows.find(f => f.key === draft.key); if (alive.current && row) { persisted.current = row; saved.current = contentKey(row); setDraft(row); setRevision(row.revision); setPublished(row.publishedRevision); setIndex(0); setError(null); } else if (alive.current) setError({ ...error, message: "Saved form not found. Your edits are still here." }); } catch { if (alive.current) setError({ ...error, message: "Could not reload the saved form." }); } }}>Discard edits and reload</button></div> : null}
    {draftedBy && !preview && published === null ? <p className="community-form-notice community-form-drafted" role="status"><Sparkles size={15} aria-hidden="true" /> {draftedBy} drafted these questions. Check each one and what it fills, then Publish. Until then members never see it.</p> : null}
    {preview ? <div className="community-form-preview">
      <p className="community-form-hint">Preview only · Answers are not submitted</p>
      {finished ? <div className="community-form-question"><h2>Preview complete</h2><p>No answers were submitted.</p><button className="workflow-secondary-button" onClick={() => { setFinished(false); setIndex(0); }}>Start again</button></div> : <div className="community-form-question" key={q.key}>
        <p className="community-form-hint">{index + 1} / {draft.questions.length}{q.required ? " · Required" : " · Optional"}</p>
        <h2>{q.title || "Untitled question"}</h2>{q.description ? <p>{q.description}</p> : null}
        {q.type.endsWith("choice") ? <div className="community-form-options">{q.options.map((option, i) => <label key={i}><input type={q.type === "single_choice" ? "radio" : "checkbox"} name={q.key} checked={q.type === "single_choice" ? answers[q.key] === String(i) : (answers[q.key] as string[] | undefined)?.includes(String(i)) ?? false} onChange={e => setAnswers(a => ({ ...a, [q.key]: q.type === "single_choice" ? String(i) : e.target.checked ? [...((a[q.key] as string[]) || []), String(i)] : ((a[q.key] as string[]) || []).filter(v => v !== String(i)) }))} />{option || `Option ${i + 1}`}</label>)}</div>
          : q.type === "long_text" ? <textarea className="community-form-answer" rows={4} aria-label="Your answer" placeholder="Type your answer here…" value={(answers[q.key] as string) || ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} />
          : <input className="community-form-answer" aria-label="Your answer" placeholder="Type your answer here…" value={(answers[q.key] as string) || ""} onChange={e => setAnswers({ ...answers, [q.key]: e.target.value })} />}
        {validation ? <p className="workflow-error" role="alert">{validation}</p> : null}
        <div className="community-form-navigation"><button className="workflow-secondary-button" disabled={index === 0} onClick={() => { setIndex(index - 1); setValidation(null); }}>Back</button><button className="workflow-secondary-button" onClick={next}>{index === draft.questions.length - 1 ? "Finish preview" : "Continue"}</button></div>
      </div>}
    </div> : <div className="community-form-workspace">
      <main className="community-form-page">
        <input className="community-form-name" aria-label="Form name" placeholder="Untitled form" maxLength={120} disabled={publishing} value={draft.name} onChange={e => { setValidation(null); setDraft({ ...draft, name: e.target.value }); }} />
        <dl className="community-form-props">
          <dt>Status</dt><dd><span className={`pn-wf-badge is-${published === revision ? "published" : published ? "edited" : "draft"}`}>{published === revision ? "Published" : published ? "Unpublished edits" : "Draft"}</span> <small>Drafts save as you type. Publishing fixes a version for future requests.</small></dd>
          <dt>Used in</dt><dd className="community-form-props-uses">{initial.usedIn?.length ? initial.usedIn.map((use, i) => <span key={i}><WorkflowSentence parts={formUseParts(draft, use)} /></span>) : <small>Not used anywhere yet</small>}</dd>
          <dt>Fills</dt><dd>{fills.length ? fills.map(key => <span key={key} className="pn-pill pn-pill-field">{propertyName(key)}</span>) : <small>No member fields yet. Pick one per question under Fills.</small>}</dd>
        </dl>
        <ol className="community-form-blocks" aria-label="Questions">
          {draft.questions.map((item, i) => {
            const selected = i === index;
            return <li key={item.key} className={`community-form-block${selected ? " is-selected" : ""}${dropAt === i ? " is-drop" : ""}`}
              onDragOver={e => { if (dragged.current !== null) { e.preventDefault(); setDropAt(i); } }} onDragLeave={() => setDropAt(at => at === i ? null : at)}
              onDrop={() => { if (dragged.current !== null) move(dragged.current, i); dragged.current = null; setDropAt(null); }}
              onFocus={() => { if (!selected) { setIndex(i); setValidation(null); } }} onClick={() => { if (!selected) { setIndex(i); setValidation(null); } }}>
              <div className="community-form-block-handle">
                <button type="button" aria-label={`Add a question below question ${i + 1}`} title="Add a question below" disabled={publishing || draft.questions.length >= COMMUNITY_FORM_MAX_QUESTIONS} onClick={e => { e.stopPropagation(); setSlash({ at: i + 1 }); }}><Plus size={15} /></button>
                <span draggable={!publishing} title="Drag to reorder" aria-hidden="true" onDragStart={e => { dragged.current = i; e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragged.current = null; setDropAt(null); }}><GripVertical size={15} /></span>
              </div>
              <div className="community-form-block-body">
                <p className="community-form-block-meta">{i + 1} · {TYPE_LABEL[item.type]}{item.required ? " · required" : ""}</p>
                <textarea className="community-form-title" rows={1} aria-label={selected ? "Question" : `Question ${i + 1}`} placeholder="Your question goes here…" maxLength={500} disabled={publishing} value={item.title}
                  onChange={e => { setValidation(null); setDraft(d => ({ ...d, questions: d.questions.map(row => row.key === item.key ? { ...row, title: e.target.value } : row) })); }} />
                {selected || item.description ? <textarea className="community-form-description" rows={1} aria-label={selected ? "Question description" : `Question ${i + 1} description`} placeholder="Add a description (optional)" maxLength={2000} disabled={publishing} value={item.description}
                  onChange={e => setDraft(d => ({ ...d, questions: d.questions.map(row => row.key === item.key ? { ...row, description: e.target.value } : row) }))} /> : null}
                {item.type.endsWith("choice") ? selected ? <div className="community-form-options">
                  {item.options.map((option, n) => <div key={n}><span>{String.fromCharCode(65 + n)}</span><input aria-label={`Option ${n + 1}`} placeholder={`Option ${n + 1}`} maxLength={200} disabled={publishing} value={option} onChange={e => patch({ options: item.options.map((v, m) => m === n ? e.target.value : v) })} /><button aria-label={`Remove option ${n + 1}`} disabled={publishing || item.options.length <= 2} onClick={() => patch({ options: item.options.filter((_, m) => m !== n) })}>×</button></div>)}
                  <button className="workflow-secondary-button" disabled={publishing || item.options.length >= 12} onClick={() => patch({ options: [...item.options, ""] })}><Plus size={14} /> Add option</button>
                </div> : <div className="community-form-chips">{item.options.map((option, n) => <span key={n}>{option || `Option ${n + 1}`}</span>)}</div>
                  : <div className={`community-form-answer-ghost${item.type === "long_text" ? " is-long" : ""}`} aria-hidden="true">Type your answer…</div>}
                {item.clientPropertyKey ? <p className="community-form-block-fills">Fills <span className="pn-pill pn-pill-field">{propertyName(item.clientPropertyKey)}</span> on <span className="pn-pill pn-pill-member">Member’s</span> record</p> : null}
                {selected && validation ? <p className="workflow-error" role="alert">{validation}</p> : null}
              </div>
            </li>;
          })}
        </ol>
        <div className="community-form-slash">
          <input aria-label="Add a question" placeholder={draft.questions.length >= COMMUNITY_FORM_MAX_QUESTIONS ? "30 questions is the most a form can hold" : "Type “/” or click to add a question…"} disabled={publishing || draft.questions.length >= COMMUNITY_FORM_MAX_QUESTIONS} value=""
            onChange={() => {}} onClick={() => setSlash({ at: draft.questions.length })}
            onKeyDown={e => { if (e.key === "/" || e.key === "Enter") { e.preventDefault(); setSlash({ at: draft.questions.length }); } }} />
          {slash ? <SlashMenu labels={TYPE_LABEL} below={slash.at < draft.questions.length ? slash.at : null} onPick={type => addQuestion(type, slash.at)} onClose={() => setSlash(null)} /> : null}
        </div>
      </main>
      <aside className="community-form-side" aria-label={`Question ${index + 1} settings`}>
        <h3>Question {index + 1}</h3>
        <label>Answer type<select disabled={publishing} aria-label="Answer type" value={q.type} onChange={e => { const type = e.target.value as CommunityFormQuestion["type"]; patch({ type, options: type.endsWith("choice") && q.options.length < 2 ? ["", ""] : q.options }); }}>
          {(Object.keys(TYPE_LABEL) as CommunityFormQuestion["type"][]).map(type => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
        </select></label>
        {clientProperties.length || q.clientPropertyKey ? <label title="The answer fills this property on the member's record">Fills on their record<select disabled={publishing} aria-label="Member property this answer fills" value={q.clientPropertyKey ?? ""}
          onChange={e => { const { clientPropertyKey: _old, ...rest } = q; setValidation(null); setDraft(d => ({ ...d, questions: d.questions.map(item => item.key === q.key ? (e.target.value ? { ...rest, clientPropertyKey: e.target.value } : rest) : item) })); }}>
          <option value="">Nothing</option>
          {clientProperties.filter(p => clientPropertyFits(p.type, q.type) || p.key === q.clientPropertyKey).map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select></label> : null}
        {missing?.options.length ? <small className="community-form-hint" role="status">{missing.property.name} doesn't have {missing.options.map(option => `“${option}”`).join(", ")}. Add {missing.options.length > 1 ? "them" : "it"} to the property or change the choices, so every answer fills it.</small> : null}
        <label className="community-form-side-toggle">Required<input type="checkbox" disabled={publishing} checked={q.required} onChange={e => patch({ required: e.target.checked })} /></label>
        <div className="community-form-side-actions">
          <button className="workflow-secondary-button" disabled={publishing || index === 0} aria-label={`Move question ${index + 1} up`} onClick={() => move(index, index - 1)}><ArrowUp size={14} /></button>
          <button className="workflow-secondary-button" disabled={publishing || index === draft.questions.length - 1} aria-label={`Move question ${index + 1} down`} onClick={() => move(index, index + 1)}><ArrowDown size={14} /></button>
          <button className="workflow-secondary-button is-danger" aria-label="Delete question" disabled={publishing || draft.questions.length === 1} onClick={() => { setDraft({ ...draft, questions: draft.questions.filter(item => item.key !== q.key) }); setIndex(Math.max(0, index - 1)); }}><Trash2 size={14} /> Delete</button>
        </div>
        <p className="community-form-hint">Drag ⋮⋮ to reorder questions. Hover a question and press + to add one below it.</p>
      </aside>
    </div>}
  </div>;
}

/** The "/" menu: pick the kind of question to add. Arrow keys move, Enter picks, Escape closes. */
function SlashMenu({ labels, below, onPick, onClose }: { labels: Record<CommunityFormQuestion["type"], string>; below: number | null; onPick: (type: CommunityFormQuestion["type"]) => void; onClose: () => void }) {
  const types = Object.keys(labels) as CommunityFormQuestion["type"][];
  const [active, setActive] = useState(0);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { menu.current?.focus(); }, []);
  useEffect(() => {
    const away = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("mousedown", away); return () => document.removeEventListener("mousedown", away);
  }, [onClose]);
  return <div ref={menu} className="community-form-slash-menu" role="menu" tabIndex={-1} aria-label="Add a question"
    onKeyDown={e => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => (a + 1) % types.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => (a + types.length - 1) % types.length); }
      else if (e.key === "Enter") { e.preventDefault(); onPick(types[active]); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }}>
    <p>{below === null ? "Add a question" : `Add below question ${below}`}</p>
    {types.map((type, i) => <button key={type} type="button" role="menuitem" className={i === active ? "is-active" : undefined} onMouseEnter={() => setActive(i)} onClick={() => onPick(type)}>{labels[type]}</button>)}
  </div>;
}
