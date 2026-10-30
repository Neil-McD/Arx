import { Bot, Lock, Mail, PenLine, Undo2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CommunityMemberWorkflowAutomation, CommunityMemberWorkflowMilestone } from "../../../../shared/communityMemberWorkflow";
import type { CommunityFormDraft } from "../../../../shared/communityForms";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import type { CommunitySettingProposal } from "../../../../shared/cloudCommunitySettingProposalsGateway";
import type { WorkflowAgentChangeReview, WorkflowStageChange, WorkflowStageChanges } from "../../../../shared/cloudCommunityWorkflowChangesGateway";
import type { CommunityFormsGateway } from "../controllers/useWebCommunityFormsGateway";
import { WorkflowSentence, workflowActionParts, workflowTriggerParts, type WorkflowSentencePart } from "./workflowSubjectPills";
import type { WorkflowStepNames } from "./workflowStepSentences";
import "./WebCommunityWorkflowChanges.css";

// Workflows › Recent changes. Agents such as Claude Code
// change stages over the MCP/CLI; here the owner sees each change as rule
// sentences plus what the member will get, can undo it, and picks whether an
// agent's change goes live at once or waits for them (Approve, Decline, Edit
// first). It is Linear's activity history and Triage, for Workflows.

const REFRESH_MS = 15_000;
const SAMPLE_MEMBER = "Alex";

const REVIEW_CHOICES: Array<{ value: WorkflowAgentChangeReview; label: string; hint: string }> = [
  { value: "apply", label: "Apply right away", hint: "Agents' changes go live at once. You can undo any of them here." },
  { value: "ask_others", label: "Ask me first for other admins", hint: "Your own agent's changes go live; other admins' agents wait for you." },
  { value: "ask", label: "Always ask me first", hint: "Every agent change waits here until you approve it." },
];

type Rule = CommunityMemberWorkflowAutomation & { paused?: boolean };
type Diff = { added: Rule[]; removed: Rule[]; changed: Rule[]; renamed: string | null };

function rulesOf(stage: CommunityMemberWorkflowMilestone | null | undefined): Rule[] {
  if (!stage) return [];
  return [...(stage.automations ?? []), ...(stage.pausedAutomations ?? []).map(rule => ({ ...rule, paused: true }))];
}

/** What changed between two versions of a stage, rule by rule. */
export function workflowStageDiff(before: CommunityMemberWorkflowMilestone | null | undefined, after: CommunityMemberWorkflowMilestone | null | undefined): Diff {
  const old = new Map(rulesOf(before).map(rule => [rule.key, rule]));
  const next = rulesOf(after);
  const added: Rule[] = [], changed: Rule[] = [];
  for (const rule of next) {
    const was = old.get(rule.key);
    if (!was) added.push(rule);
    else if (JSON.stringify({ ...was, timerGeneration: undefined }) !== JSON.stringify({ ...rule, timerGeneration: undefined })) changed.push(rule);
  }
  const kept = new Set(next.map(rule => rule.key));
  return { added, changed, removed: rulesOf(before).filter(rule => !kept.has(rule.key)),
    renamed: before && after && before.name !== after.name ? before.name : null };
}

/** A proposed stage as editor drafts: rules that don't exist yet get draft keys, so saving them makes new rules. */
export function workflowProposalDrafts(current: CommunityMemberWorkflowMilestone | null | undefined, proposed: CommunityMemberWorkflowMilestone): Rule[] {
  const ruleKeys = new Set(rulesOf(current).map(rule => rule.key));
  const actionKeys = new Set(rulesOf(current).map(rule => rule.action.key));
  const rename = new Map<string, string>();
  for (const rule of rulesOf(proposed)) if (!actionKeys.has(rule.action.key)) rename.set(rule.action.key, `draft-action-${crypto.randomUUID()}`);
  return rulesOf(proposed).map(rule => ({
    ...rule,
    key: ruleKeys.has(rule.key) ? rule.key : `draft-rule-${crypto.randomUUID()}`,
    action: { ...rule.action, key: rename.get(rule.action.key) ?? rule.action.key },
    trigger: rule.trigger.type === "previous_action_completed" && rename.has(rule.trigger.predecessorActionKey)
      ? { ...rule.trigger, predecessorActionKey: rename.get(rule.trigger.predecessorActionKey)! } : rule.trigger,
  })) as Rule[];
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

const fill = (text: string, community: string) => text.replace(/\{first_name\}/g, SAMPLE_MEMBER).replace(/\{name\}/g, `${SAMPLE_MEMBER} Rivera`).replace(/\{community\}/g, community);

const lowerFirst = (parts: WorkflowSentencePart[]): WorkflowSentencePart[] =>
  typeof parts[0] === "string" ? [parts[0].charAt(0).toLowerCase() + parts[0].slice(1), ...parts.slice(1)] : parts;

function RuleLine(props: { rule: Rule; names: WorkflowStepNames; stageName: string; mark: "+" | "~" | "−" }) {
  const trigger = workflowTriggerParts(props.rule, props.names, props.stageName);
  const parts: WorkflowSentencePart[] = props.rule.trigger.type === "previous_action_completed"
    ? [...trigger, trigger.length === 1 && trigger[0] === "Then" ? " " : ", ", ...lowerFirst(workflowActionParts(props.rule, props.names))]
    : ["When ", ...trigger, " · Then ", ...workflowActionParts(props.rule, props.names)];
  const word = props.mark === "+" ? "Added" : props.mark === "~" ? "Changed" : "Removed";
  return <li className={`pn-chg-rule is-${word.toLowerCase()}`}>
    <span className="pn-chg-mark" aria-label={word}>{props.mark}</span>
    <span className="pn-chg-sentence"><WorkflowSentence parts={parts} />{props.rule.paused ? <em> (off)</em> : null}</span>
  </li>;
}

/** What the member will actually get from one step: the email, the form, the agent's message, the pod. */
function MemberMockup(props: { rule: Rule; forms: CommunityFormDraft[]; channels: CloudCommunityChannel[]; community: string; properties: WorkflowStepNames["catalog"] }) {
  const action = props.rule.action;
  switch (action.type) {
    case "send_email":
      return <figure className="pn-chg-mock is-email">
        <figcaption><Mail size={13} aria-hidden="true" /> Email</figcaption>
        <div className="pn-chg-email-head"><span>From <strong>{props.community || "your community"}</strong></span><span>To {SAMPLE_MEMBER}</span></div>
        <strong className="pn-chg-email-subject">{fill(action.subject || "(no subject)", props.community)}</strong>
        <div className="pn-chg-email-body">{fill(action.body || "", props.community).split(/\n{2,}/).slice(0, 4).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        <small>Unsubscribe</small>
      </figure>;
    case "request_form": {
      const form = props.forms.find(item => item.key === action.formKey);
      return <figure className="pn-chg-mock is-form">
        <figcaption>Form</figcaption>
        <strong>{form?.name ?? "A form"}</strong>
        <ol>{(form?.questions ?? []).slice(0, 4).map(question => <li key={question.key}><span>{question.title}</span><i aria-hidden="true" /></li>)}</ol>
        {(form?.questions.length ?? 0) > 4 ? <small>and {form!.questions.length - 4} more</small> : null}
        <span className="pn-chg-form-submit" aria-hidden="true">Submit</span>
      </figure>;
    }
    case "prompt_agent":
      return <figure className="pn-chg-mock is-agent">
        <figcaption><Bot size={13} aria-hidden="true" /> Agent message, in their personal pod</figcaption>
        <div className="pn-chg-bubble">{action.prompt ? <>Writes to {SAMPLE_MEMBER} from these instructions: <q>{action.prompt.slice(0, 280)}</q></> : "Writes to them (no instructions yet)."}</div>
      </figure>;
    case "set_pod_member": {
      const pod = props.channels.find(channel => channel.id === action.channelId)?.name ?? "a pod";
      return <figure className="pn-chg-mock is-chip"><Users size={14} aria-hidden="true" /> {action.active ? `Joins ${pod}` : `Leaves ${pod}`}</figure>;
    }
    case "create_service_channel":
      return <figure className="pn-chg-mock is-chip"><Lock size={14} aria-hidden="true" /> Gets a personal pod with you and the agent</figure>;
    case "set_client_property": {
      const field = props.properties?.properties?.find(item => item.key === action.propertyKey)?.name ?? action.propertyKey;
      return <figure className="pn-chg-mock is-chip is-quiet"><PenLine size={14} aria-hidden="true" /> Not shown to them: {field} is set on their record</figure>;
    }
  }
}

function ChangeBody(props: { before: CommunityMemberWorkflowMilestone | null | undefined; after: CommunityMemberWorkflowMilestone | null | undefined;
  names: WorkflowStepNames; forms: CommunityFormDraft[]; channels: CloudCommunityChannel[]; community: string }) {
  const diff = workflowStageDiff(props.before, props.after);
  const stageName = props.after?.name ?? props.before?.name ?? "";
  const shown = [...diff.added, ...diff.changed].filter(rule => !rule.paused);
  const nothing = !diff.added.length && !diff.changed.length && !diff.removed.length;
  return <>
    <ul className="pn-chg-rules">
      {diff.renamed ? <li className="pn-chg-rule is-changed"><span className="pn-chg-mark">~</span><span className="pn-chg-sentence">Renamed from “{diff.renamed}”</span></li> : null}
      {diff.added.map(rule => <RuleLine key={rule.key} rule={rule} names={props.names} stageName={stageName} mark="+" />)}
      {diff.changed.map(rule => <RuleLine key={rule.key} rule={rule} names={props.names} stageName={stageName} mark="~" />)}
      {diff.removed.map(rule => <RuleLine key={rule.key} rule={rule} names={props.names} stageName={stageName} mark="−" />)}
      {nothing && !diff.renamed ? <li className="pn-chg-rule"><span className="pn-chg-sentence">Stage details changed (goal, notes or colour)</span></li> : null}
    </ul>
    {shown.length ? <div className="pn-chg-mocks" aria-label="What the member gets">
      <span className="pn-chg-mocks-title">What the member gets</span>
      <div className="pn-chg-mocks-row">{shown.map(rule => <MemberMockup key={rule.key} rule={rule} forms={props.forms} channels={props.channels}
        community={props.community} properties={props.names.catalog} />)}</div>
    </div> : null}
  </>;
}

function who(change: WorkflowStageChange): ReactNode {
  return <>
    <strong>{change.changed_by}</strong>
    {change.via === "agent" && change.on_behalf_of ? <span className="pn-chg-muted"> for {change.on_behalf_of}</span> : null}
    {change.undo_of ? " undid a change to " : " changed "}<strong>{change.stage_name}</strong>
    {change.approved_by ? <span className="pn-chg-muted"> · approved by {change.approved_by}</span> : null}
  </>;
}

export function WebCommunityWorkflowChanges(props: {
  gateway: CommunityFormsGateway; channels: CloudCommunityChannel[]; communityName: string;
  /** Edit first: open the suggestion in Automations as unsaved changes. */
  onEditFirst: (proposal: CommunitySettingProposal) => void;
  onChanged?: () => void;
}) {
  const changes = props.gateway.changes!;
  const [data, setData] = useState<WorkflowStageChanges | null>(null);
  const [waiting, setWaiting] = useState<CommunitySettingProposal[]>([]);
  const [forms, setForms] = useState<CommunityFormDraft[]>([]);
  const [properties, setProperties] = useState<NonNullable<WorkflowStepNames["catalog"]>["properties"]>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([changes.list(), changes.waiting()])
      .then(([list, pending]) => { if (alive) { setData(list); setWaiting(pending); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [changes, tick]);
  useEffect(() => { const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") setTick(n => n + 1); }, REFRESH_MS); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    let alive = true;
    props.gateway.load().then(rows => { if (alive) setForms(rows); }).catch(() => undefined);
    props.gateway.clientProperties?.().then(rows => { if (alive) setProperties(rows); }).catch(() => undefined);
    return () => { alive = false; };
  }, [props.gateway]);

  const names = useMemo<WorkflowStepNames>(() => ({ channels: props.channels, forms: forms.map(form => ({ key: form.key, name: form.name })),
    catalog: { lessons: null, properties } }), [props.channels, forms, properties]);
  const run = async (id: string, work: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(id); setNotice(null);
    try { await work(); setNotice({ text: done }); props.onChanged?.(); }
    catch (error) { setNotice({ error: true, text: refusal(error) }); }
    finally { setBusy(null); setTick(n => n + 1); }
  };

  const review = data?.agent_change_review ?? "apply";
  const body = (before: CommunityMemberWorkflowMilestone | null | undefined, after: CommunityMemberWorkflowMilestone | null | undefined) =>
    <ChangeBody before={before} after={after} names={names} forms={forms} channels={props.channels} community={props.communityName} />;

  return <div className="pn-chg">
    <section className="pn-chg-permission" aria-labelledby="pn-chg-permission-title">
      <div>
        <h2 id="pn-chg-permission-title">When an agent changes a stage</h2>
        <p>Claude Code, Codex or any agent connected to your Polynet MCP or CLI can build and change automations.</p>
      </div>
      <div className="pn-runs-seg pn-chg-choices" role="radiogroup" aria-label="When an agent changes a stage">
        {REVIEW_CHOICES.map(choice => <button key={choice.value} type="button" role="radio" aria-checked={review === choice.value}
          aria-selected={review === choice.value} disabled={!data || busy !== null}
          onClick={() => review !== choice.value && void run(`review:${choice.value}`, () => changes.setReview(choice.value), `Saved: ${choice.label.toLowerCase()}.`)}>
          {choice.label}</button>)}
      </div>
      <small className="pn-chg-muted">{REVIEW_CHOICES.find(choice => choice.value === review)?.hint}</small>
    </section>

    {notice ? <p className={`pn-chg-notice${notice.error ? " is-error" : ""}`} role="status">{notice.text}</p> : null}

    {waiting.length ? <section className="pn-chg-list" aria-labelledby="pn-chg-waiting-title">
      <h2 id="pn-chg-waiting-title">Waiting for you</h2>
      {waiting.map(proposal => {
        const stale = proposal.workflow?.stale;
        return <article key={proposal.proposal_id} className="pn-chg-card is-waiting">
          <header>
            <span><strong>{proposal.proposed_by ?? "An agent"}</strong> wants to change <strong>{proposal.workflow?.proposed.name}</strong></span>
            <span className="pn-chg-muted">{ago(proposal.created_at)}</span>
          </header>
          {proposal.note ? <p className="pn-chg-note">“{proposal.note}”</p> : null}
          {body(proposal.workflow?.current, proposal.workflow?.proposed)}
          {stale ? <p className="pn-chg-notice is-error">This stage changed since the agent looked, so this can't be applied. Decline it and ask the agent again.</p> : null}
          <footer>
            <button type="button" className="pn-au-ghost" disabled={busy !== null}
              onClick={() => void run(proposal.proposal_id, () => changes.decline(proposal.proposal_id), "Declined. Nothing changed.")}>Decline</button>
            {!stale ? <button type="button" className="pn-au-btn" disabled={busy !== null} onClick={() => props.onEditFirst(proposal)}>Edit first</button> : null}
            {!stale ? <button type="button" className="pn-wf-primary is-small" disabled={busy !== null}
              onClick={() => void run(proposal.proposal_id, async () => {
                const result = await changes.approve(proposal.proposal_id);
                if (result.status === "failed") throw new Error(result.error ?? "refused");
              }, "Approved. It's live.")}>{busy === proposal.proposal_id ? "Approving…" : "Approve"}</button> : null}
          </footer>
        </article>;
      })}
    </section> : null}

    <section className="pn-chg-list" aria-labelledby="pn-chg-recent-title">
      <h2 id="pn-chg-recent-title">Recent changes</h2>
      {failed && !data ? <div className="pn-runs-empty" role="alert"><strong>Couldn't load changes</strong>
        <button type="button" className="pn-au-btn" onClick={() => setTick(n => n + 1)}>Try again</button></div>
        : !data ? <div className="pn-runs-empty"><span className="workflow-loading-line" /></div>
        : !data.changes.length ? <div className="pn-runs-empty"><strong>No changes yet</strong>
          <span>When you or an agent update a stage, it shows here with what changed.</span></div>
        : data.changes.map(change => <article key={change.change_id} className="pn-chg-card">
          <header>
            <span>{who(change)}</span>
            <span className="pn-chg-muted">{ago(change.created_at)}</span>
          </header>
          {body(change.before, change.after)}
          <footer>
            <button type="button" className="pn-au-btn" disabled={!change.can_undo || busy !== null}
              title={change.can_undo ? "Put this stage back as it was before this change" : "The stage changed again since. Undo the newer change first."}
              onClick={() => void run(change.change_id, () => changes.undo(change.change_id), `Undone. ${change.stage_name} is back as it was.`)}>
              <Undo2 size={14} aria-hidden="true" /> {busy === change.change_id ? "Undoing…" : "Undo"}</button>
          </footer>
        </article>)}
    </section>
  </div>;
}

function refusal(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("setting_proposal_stale")) return "This stage changed since the agent looked. Decline it and ask the agent again.";
  if (message.includes("workflow_change_newer_edits")) return "The stage changed again since. Undo the newer change first.";
  if (message.includes("workflow_agent_review_owner_only")) return "Only the community's owner can change this.";
  if (message.includes("community_member_workflow_revision_conflict")) return "Someone saved the workflow at the same moment. Try again.";
  return "That didn't go through. Try again.";
}
