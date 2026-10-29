import { ArrowLeft, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { WebPlatformTabList, platformTabId, platformTabPanelId } from "./WebPlatformChoiceControls";
import { WORKFLOW_SECTIONS, workflowSectionFromSearch, workflowSectionUrl, type WorkflowSection } from "../../../../shared/workflowSection";

import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES,
  COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES,
  type CommunityMemberWorkflowAutomation,
  type CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";
import type {
  CloudCommunityMemberWorkflowBoard,
  CloudCommunityMemberWorkflowMember,
  CloudCommunityMemberSuccessDossier,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import { WebCommunityWorkflowMemberDossierModal } from "./WebCommunityWorkflowMemberDossierModal";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { WebCommunityWorkflowMilestoneModal } from "./WebCommunityWorkflowMilestoneModal";
import { pausedWorkflowAutomationInputs } from "./workflowMilestoneDraft";
import type { WorkflowCatalog } from "./WebCommunityWorkflowAutomationEditor";
import "./WebCommunityWorkflowsSection.css";
import { WebCommunityForms } from "./WebCommunityForms";
import { WebCommunityFormResponses } from "./WebCommunityFormResponses";
import { WebCommunityMemberCourseProgress } from "./WebCommunityMemberCourseProgress";
import type { CommunityFormsGateway } from "../controllers/useWebCommunityFormsGateway";
import type { WelcomeLessonOption } from "../controllers/useWebCommunityWorkflowsController";
import type { CloudCommunityWelcomePageDraft } from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import { WebCommunityWelcomeSettings } from "./WebCommunityWelcomeSettings";
import { WebCommunityTestRun, startTestRunInNewTab, testRunErrorMessage, type WebCommunityTestRunContext } from "./WebCommunityTestRun";
import { WebCommunityClientAccessPanel } from "./WebCommunityAccess";
import { WebCommunityAgentLedJourney } from "./WebCommunityAgentLedJourney";
import { WebCommunityWorkflowAutomations } from "./WebCommunityWorkflowAutomations";
import { WebCommunityWorkflowRunHistory } from "./WebCommunityWorkflowRunHistory";
import { WebCommunityWorkflowChanges, workflowProposalDrafts } from "./WebCommunityWorkflowChanges";
import type { CommunitySettingProposal } from "../../../../shared/cloudCommunitySettingProposalsGateway";
import type { AgentLedJourneyPlan } from "../../../../shared/agentLedJourneyTemplate";
import type { CommunityAccessGateway } from "../controllers/useWebCommunityAccessGateway";
import "./WebCommunityWorkflowsPage.css";
import "./workflowStageColors.css";
import { useWebCommunityFrame } from "../controllers/useWebCommunityFrame";

export type WebCommunityWorkflowsSectionProps = {
  forms?: CommunityFormsGateway;
  /** Clients and each member's Access: owners and admins only. */
  access?: CommunityAccessGateway;
  channels: CloudCommunityChannel[];
  channelsUnavailable: boolean;
  board: CloudCommunityMemberWorkflowBoard | null;
  members: CloudCommunityMemberWorkflowMember[];
  totalCount: number | null;
  hasMore: boolean;
  hasLoaded: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  isSaving: boolean;
  actionError: string | null;
  selectedMembershipId: string | null;
  memberDossier: CloudCommunityMemberSuccessDossier | null;
  isMemberDossierLoading: boolean;
  memberDossierError: string | null;
  onReload: () => Promise<unknown> | unknown;
  onLoadMore: () => Promise<unknown> | unknown;
  onCreateMilestone: (name: string, instructions?: string, goal?: string, requireHumanApproval?: boolean, color?: string) => Promise<boolean>;
  onUpdateMilestone: (
    milestoneKey: string,
    name: string,
    automations: CommunityMemberWorkflowAutomation[],
    instructions?: string,
    goal?: string,
    requireHumanApproval?: boolean,
    /** Left out keeps the stage's colour; "none" clears it. */
    color?: string,
  ) => Promise<boolean>;
  onDeleteMilestone: (milestoneKey: string) => Promise<boolean>;
  /** Adds the agent-led journey's stages (Workflows → board card). */
  onApplyAgentLedJourney?: (plan: AgentLedJourneyPlan) => Promise<boolean>;
  onSetWelcomeGate?: (enabled: boolean) => Promise<boolean>;
  onSetWelcomeDisplay?: (display: "page" | "popup") => Promise<boolean>;
  onSaveWelcomePage?: (page: CloudCommunityWelcomePageDraft) => Promise<boolean>;
  onLoadWelcomeLessonOptions?: () => Promise<WelcomeLessonOption[]>;
  onLoadTrackOptions?: () => Promise<Array<{ key: string; title: string }>>;
  onLoadOfferOptions?: () => Promise<Array<{ key: string; name: string }>>;
  /** Workflows → Test run: going through the community as a test member. */
  testRun?: WebCommunityTestRunContext | null;
  communityName?: string | null;
  onClearActionError: () => void;
  onOpenMemberDossier: (membershipId: string) => void;
  onCloseMemberDossier: () => void;
  onRetryMemberDossier: () => void;
  isServiceChannelSaving: boolean;
  serviceChannelError: string | null;
  onSetServiceChannel: (channelId: string | null, expectedRevision: number) => Promise<boolean>;
  onForceMove: (snapshot: CloudCommunityMemberSuccessDossier) => Promise<void>;
  onApproveMilestone?: (snapshot: CloudCommunityMemberSuccessDossier) => Promise<void>;
  onRetryGoalReview?: (snapshot: CloudCommunityMemberSuccessDossier) => Promise<void>;
  onRetryAction?: (snapshot: CloudCommunityMemberSuccessDossier, automationKey: string) => Promise<{ status: string; error_code?: string }>;
  onOpenServiceChannel: (channelId: string) => void;
};

const BLANK_MILESTONE: CommunityMemberWorkflowMilestone = {
  key: "",
  name: "",
  automations: [],
};

export function WebCommunityWorkflowsSection(
  props: WebCommunityWorkflowsSectionProps,
) {
  const [section, setSection] = useState<WorkflowSection>(() => workflowSectionFromSearch(window.location.search));
  const beforeLeave = useRef<(() => Promise<boolean>) | null>(null);
  const pending = useRef(false);
  const scopeEpoch = useRef(0);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    scopeEpoch.current++;
    pending.current = false; setSwitching(false);
    const next = workflowSectionFromSearch(window.location.search);
    setSection(next);
    if (new URLSearchParams(window.location.search).get("section") === "integrations") {
      window.history.replaceState(window.history.state, "", workflowSectionUrl(window.location.href, next));
    }
    return () => { scopeEpoch.current++; };
  }, [props.forms?.scopeKey]);
  const select = async (next: WorkflowSection, replace = false, fromHistory = false) => {
    if (pending.current) {
      if (fromHistory) window.history.replaceState(window.history.state, "", workflowSectionUrl(window.location.href, section));
      return;
    }
    if (next === section) {
      if (fromHistory) window.history.replaceState(window.history.state, "", workflowSectionUrl(window.location.href, section));
      return;
    }
    const epoch = scopeEpoch.current;
    pending.current = true; setSwitching(true);
    try {
      const allowed = !beforeLeave.current || await beforeLeave.current();
      if (epoch !== scopeEpoch.current) return;
      if (!allowed) {
        if (fromHistory) window.history.replaceState(window.history.state, "", workflowSectionUrl(window.location.href, section));
        return;
      }
      window.history[replace || fromHistory ? "replaceState" : "pushState"](window.history.state, "", workflowSectionUrl(window.location.href, next));
      setSection(next);
    } finally { if (epoch === scopeEpoch.current) { pending.current = false; setSwitching(false); } }
  };
  const selectRef = useRef(select); selectRef.current = select;
  useEffect(() => {
    const pathname = window.location.pathname;
    const onPop = () => { if (window.location.pathname === pathname) void selectRef.current(workflowSectionFromSearch(window.location.search), false, true); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const tabs = WORKFLOW_SECTIONS.map(id => ({ id, label: SECTION_LABELS[id], disabled: switching }));
  // Tests show up in Run history, under Tests, as soon as one starts.
  const [runsFilter, setRunsFilter] = useState<"all" | "tests">(() => new URLSearchParams(window.location.search).get("section") === "test" ? "tests" : "all");
  const [testError, setTestError] = useState<string | null>(null);
  const testStage = (milestoneKey: string | null) => {
    if (!props.testRun) return;
    setTestError(null);
    startTestRunInNewTab(props.testRun, milestoneKey).then(() => { setRunsFilter("tests"); void select("runs"); },
      (caught) => setTestError(testRunErrorMessage(caught)));
  };
  const milestones = props.board?.milestones ?? [];
  // In Channels this page has a
  // way back to the community, like Settings' own menu; Classroom has its
  // owner bar.
  const frame = useWebCommunityFrame();
  const back = frame.layout.navigation.position !== "top" && frame.community
    ? { label: frame.community.name, onBack: () => frame.onSelectTab(frame.layout.navigation.home === "agent" ? "chat" : frame.layout.navigation.home) }
    : null;
  // Agents' changes waiting for the owner, for the banner over Automations.
  const [waiting, setWaiting] = useState<CommunitySettingProposal[]>([]);
  const [waitingTick, setWaitingTick] = useState(0);
  useEffect(() => {
    const changes = props.forms?.changes;
    if (!changes) { setWaiting([]); return; }
    let alive = true;
    const load = () => changes.waiting().then(rows => { if (alive) setWaiting(rows); }).catch(() => undefined);
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") void load(); }, 20_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [props.forms?.changes, waitingTick, section]);
  // Edit first: the suggestion opens in Automations as unsaved changes, and
  // once the owner updates that stage the suggestion is closed.
  const [seed, setSeed] = useState<WorkflowSeed | null>(null);
  const editFirst = (proposal: CommunitySettingProposal) => {
    if (!proposal.workflow) return;
    setSeed({ stageKey: proposal.workflow.milestone_key, proposalId: proposal.proposal_id, token: crypto.randomUUID(), by: proposal.proposed_by ?? "The agent",
      rules: workflowProposalDrafts(proposal.workflow.current, proposal.workflow.proposed) });
    void select("workflows");
  };
  const seedSaved = () => {
    const proposalId = seed?.proposalId;
    setSeed(null);
    if (proposalId) void props.forms?.changes?.decline(proposalId).catch(() => undefined).finally(() => setWaitingTick(n => n + 1));
  };
  const firstWaiting = waiting[0];
  // Page header and underlined section tabs, after Substack's dashboard.
  return <div className="workflow-page workflow-sections pn-wf">
    <header className="pn-wf-header pn-wf-header-row">
      <div>
        {back ? <button type="button" className="pn-wf-back" onClick={back.onBack}>
          <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /><span>{back.label}</span></button> : null}
        <h1>Workflows</h1>
        <p>What happens to members automatically, from joining to their first win.</p>
      </div>
      {props.testRun ? <button type="button" className="workflow-secondary-button pn-wf-test" onClick={() => testStage(null)}>
        <Play size={15} strokeWidth={2} aria-hidden="true" /> Test as a new member</button> : null}
    </header>
    {testError ? <p role="alert" className="test-run-error pn-wf-test-error">{testError}</p> : null}
    <WebPlatformTabList tabs={tabs} activeTab={section} onSelectTab={(next, meta) => void select(next, meta.source === "keyboard")}
      ariaLabel="Workflow sections" idPrefix="workflow-sections" className="pn-wf-tabs" />
    <div className="workflow-section-content" role="tabpanel" id={platformTabPanelId("workflow-sections", section)} aria-labelledby={platformTabId("workflow-sections", section)}>
      {section === "workflows" && firstWaiting && seed?.proposalId !== firstWaiting.proposal_id ? <div className="pn-chg-banner" role="status">
        <span><strong>{firstWaiting.proposed_by ?? "An agent"}</strong> wants to change <strong>{firstWaiting.workflow?.proposed.name}</strong>
          {waiting.length > 1 ? ` and ${waiting.length - 1} more` : ""}. Nothing changes until you approve it.</span>
        <button type="button" className="pn-au-btn" onClick={() => void select("changes")}>Review</button>
      </div> : null}
      {section === "workflows" ? <WorkflowBoard {...props} onTestStage={props.testRun ? testStage : undefined} seed={seed} onSeedSaved={seedSaved} />
        : section === "changes" ? props.forms?.changes
          ? <WebCommunityWorkflowChanges key={props.forms.scopeKey} gateway={props.forms} channels={props.channels}
            communityName={props.communityName ?? ""} onEditFirst={editFirst} onChanged={() => { setWaitingTick(n => n + 1); void props.onReload(); }} />
          : <p className="pn-chg-muted">Recent changes isn't available here.</p>
        : section === "welcome" ? <WebCommunityWelcomeSettings key={props.forms?.scopeKey} board={props.board} communityName={props.communityName ?? null}
          forms={props.forms} isSaving={props.isSaving} actionError={props.actionError} onSetWelcomeGate={props.onSetWelcomeGate}
          onSetWelcomeDisplay={props.onSetWelcomeDisplay}
          onSaveWelcomePage={props.onSaveWelcomePage} onLoadWelcomeLessonOptions={props.onLoadWelcomeLessonOptions}
          onOpenWorkflows={() => void select("workflows")} leaveGuard={beforeLeave} />
        : section === "runs" ? props.testRun
          ? <WebCommunityWorkflowRunHistory key={`${props.testRun.communityId}:${runsFilter}`} context={props.testRun}
            milestones={milestones} names={{ channels: props.channels }} initialFilter={runsFilter}
            onOpenMember={props.onOpenMemberDossier}
            testRun={<WebCommunityTestRun key={props.testRun.communityId} {...props.testRun}
              stages={milestones.filter((m) => m.key && m.name.trim()).map((m) => ({ key: m.key, name: m.name }))}
              onOpenRecord={props.onOpenMemberDossier} hideEmpty />} />
          : <p role="status">Only the community's owner and admins can see runs.</p>
        : props.forms
        ? <WebCommunityForms key={props.forms.scopeKey} gateway={props.forms} leaveGuard={beforeLeave} />
        : <p role="status">Forms are unavailable.</p>}
    </div>
    <WebCommunityWorkflowMemberDossierModal
      formResponses={props.forms?.responses && props.memberDossier ? <WebCommunityFormResponses key={`${props.forms.scopeKey}:${props.memberDossier.membership_id}`} gateway={props.forms} membershipId={props.memberDossier.membership_id} evidenceKey={JSON.stringify(props.memberDossier.submitted_form_evidence)} /> : null}
      access={props.access && props.memberDossier ? <WebCommunityClientAccessPanel key={`${props.access.scopeKey}:${props.memberDossier.membership_id}`} gateway={props.access} membershipId={props.memberDossier.membership_id} /> : null}
      courseProgress={props.forms?.courseProgress && props.memberDossier ? <WebCommunityMemberCourseProgress key={`${props.forms.scopeKey}:${props.memberDossier.membership_id}`} load={props.forms.courseProgress} membershipId={props.memberDossier.membership_id} /> : null}
      isOpen={Boolean(props.selectedMembershipId)}
      dossier={props.memberDossier}
      isLoading={props.isMemberDossierLoading}
      error={props.memberDossierError}
      onClose={props.onCloseMemberDossier}
      onRetry={props.onRetryMemberDossier}
      channels={props.channels}
      channelsUnavailable={props.channelsUnavailable}
      isServiceChannelSaving={props.isServiceChannelSaving}
      serviceChannelError={props.serviceChannelError}
      onSetServiceChannel={props.onSetServiceChannel}
      onForceMove={props.onForceMove}
      onApproveMilestone={props.onApproveMilestone}
      onRetryGoalReview={props.onRetryGoalReview}
      onRetryAction={props.onRetryAction}
      onOpenServiceChannel={props.onOpenServiceChannel}
    />
  </div>;
}

const SECTION_LABELS: Record<WorkflowSection, string> = {
  workflows: "Automations", runs: "Run history", changes: "Recent changes", forms: "Forms", welcome: "Welcome page",
};

export type WorkflowSeed = { stageKey: string; proposalId: string; token: string; rules: CommunityMemberWorkflowAutomation[]; by: string };

function WorkflowBoard(props: WebCommunityWorkflowsSectionProps & { onTestStage?: (milestoneKey: string | null) => void;
  seed?: WorkflowSeed | null; onSeedSaved?: () => void }) {
  const [publishedForms, setPublishedForms] = useState<Array<{ key: string; name: string }>>([]);
  const [formsState, setFormsState] = useState<"loading" | "ready" | "error">("loading");
  const [formsRetry, setFormsRetry] = useState(0);
  useEffect(() => {
    let alive = true; setPublishedForms([]); setFormsState("loading");
    if (!props.forms) { setFormsState("error"); return; }
    props.forms.load().then(rows => { if (alive) { setPublishedForms(rows.filter(r => r.publishedRevision !== null)); setFormsState("ready"); } }).catch(() => { if (alive) setFormsState("error"); });
    return () => { alive = false; };
  }, [props.forms, formsRetry]);
  // Lessons, courses and client properties the rule editor offers; null while loading.
  const [catalog, setCatalog] = useState<WorkflowCatalog>({ lessons: null, properties: null });
  useEffect(() => {
    let alive = true; setCatalog({ lessons: null, properties: null });
    (props.onLoadWelcomeLessonOptions?.() ?? Promise.resolve([])).then(lessons => { if (alive) setCatalog(c => ({ ...c, lessons })); }).catch(() => { if (alive) setCatalog(c => ({ ...c, lessons: [] })); });
    (props.forms?.clientProperties?.() ?? Promise.resolve([])).then(properties => { if (alive) setCatalog(c => ({ ...c, properties })); }).catch(() => { if (alive) setCatalog(c => ({ ...c, properties: [] })); });
    (props.onLoadTrackOptions?.() ?? Promise.resolve([])).then(tracks => { if (alive) setCatalog(c => ({ ...c, tracks })); }).catch(() => { if (alive) setCatalog(c => ({ ...c, tracks: [] })); });
    (props.onLoadOfferOptions?.() ?? Promise.resolve([])).then(offers => { if (alive) setCatalog(c => ({ ...c, offers })); }).catch(() => { if (alive) setCatalog(c => ({ ...c, offers: [] })); });
    (props.forms?.guideChannelIds?.() ?? Promise.resolve([])).then(guideChannelIds => { if (alive) setCatalog(c => ({ ...c, guideChannelIds })); }).catch(() => { if (alive) setCatalog(c => ({ ...c, guideChannelIds: [] })); });
    return () => { alive = false; };
  }, [props.forms, props.onLoadWelcomeLessonOptions, props.onLoadTrackOptions, props.onLoadOfferOptions]);
  const [editingMilestoneKey, setEditingMilestoneKey] = useState<string | null>(null);
  const [isCreatingMilestone, setIsCreatingMilestone] = useState(false);
  const milestones = props.board?.milestones ?? [BLANK_MILESTONE];
  const editingMilestone = isCreatingMilestone
    ? BLANK_MILESTONE
    : milestones.find((milestone) => milestone.key === editingMilestoneKey) ?? null;
  const editingMilestoneIndex = isCreatingMilestone
    ? props.board
      ? milestones.length
      : 0
    : editingMilestone
      ? milestones.findIndex((milestone) => milestone.key === editingMilestone.key)
      : -1;
  const membersByMilestone = useMemo(() => {
    const grouped = new Map<string, CloudCommunityMemberWorkflowMember[]>();
    for (const member of props.members) {
      const members = grouped.get(member.current_milestone_key) ?? [];
      members.push(member);
      grouped.set(member.current_milestone_key, members);
    }
    return grouped;
  }, [props.members]);

  const [openTo, setOpenTo] = useState<{ automationKey?: string; addStep?: boolean } | null>(null);
  const openMilestone = (milestoneKey: string, to: { automationKey?: string; addStep?: boolean } | null = null) => {
    props.onClearActionError();
    setOpenTo(to);
    setIsCreatingMilestone(!milestoneKey);
    setEditingMilestoneKey(milestoneKey || null);
  };

  const closeMilestone = () => {
    setEditingMilestoneKey(null);
    setIsCreatingMilestone(false);
    props.onClearActionError();
  };

  const addMilestone = () => {
    if (
      props.isSaving ||
      (props.board?.milestones.length ?? 0) >= COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES
    ) return;
    openMilestone("");
  };

  const deleteEditingMilestone = async () => {
    if (!editingMilestone?.key || milestones.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES) return;
    if (await props.onDeleteMilestone(editingMilestone.key)) closeMilestone();
  };

  const saveMilestone = async (milestone: CommunityMemberWorkflowMilestone) => {
    const saved = !milestone.key || isCreatingMilestone
      ? await props.onCreateMilestone(milestone.name, milestone.instructions, milestone.goal, milestone.requireHumanApproval, milestone.color)
      : await props.onUpdateMilestone(
          milestone.key,
          milestone.name,
          // The stage dialog edits running rules; switched-off ones go back as they are.
          [...milestone.automations, ...pausedWorkflowAutomationInputs(editingMilestone)] as CommunityMemberWorkflowAutomation[],
          milestone.instructions,
          milestone.goal,
          milestone.requireHumanApproval,
          milestone.color ?? "none",
        );
    if (saved) closeMilestone();
  };

  if (props.isLoading && !props.hasLoaded) {
    return (
      <div className="workflow-page workflow-page-loading" aria-label="Loading workflows">
        <span className="workflow-loading-line" />
        <span className="workflow-loading-line is-short" />
        <span className="workflow-loading-board" />
      </div>
    );
  }

  if (props.error && !props.board) {
    return (
      <div className="workflow-page workflow-load-error">
        <h1>Workflows</h1>
        <p>{props.error}</p>
        <button
          className="workflow-secondary-button"
          type="button"
          onClick={() => void props.onReload()}
        >
          <RefreshCw size={15} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="workflow-page workflow-pipeline-page">
      <section
        className="community-panel community-utility-panel workflow-pipeline-shell"
        aria-label="Workflow board"
      >
        <WebCommunityWorkflowAutomations milestones={milestones} forms={publishedForms} channels={props.channels}
          channelsUnavailable={props.channelsUnavailable} catalog={catalog} isSaving={props.isSaving} error={editingMilestone ? null : props.actionError}
          memberCounts={new Map([...membersByMilestone].map(([key, members]) => [key, members.length]))}
          onSaveStage={(milestone, automations) => props.onUpdateMilestone(milestone.key, milestone.name, automations,
            milestone.instructions, milestone.goal, milestone.requireHumanApproval)}
          onEditStage={(key) => openMilestone(key)} onAddStage={addMilestone}
          onTestStage={props.onTestStage ? (key, index) => props.onTestStage?.(index === 0 ? null : key) : undefined}
          seed={props.seed ?? null} onSeedSaved={props.onSeedSaved} />
        {props.onApplyAgentLedJourney && formsState !== "loading" ? <WebCommunityAgentLedJourney milestones={props.board?.milestones ?? null}
          publishedForms={publishedForms} isSaving={props.isSaving} onApply={props.onApplyAgentLedJourney} /> : null}

        {props.hasMore ? (
          <button
            className="workflow-secondary-button workflow-load-more-button"
            type="button"
            onClick={() => void props.onLoadMore()}
            disabled={props.isLoadingMore}
          >
            {props.isLoadingMore ? "Loading…" : "Load more members"}
          </button>
        ) : props.totalCount !== null && props.members.length > 0 ? (
          <p className="workflow-board-footnote">{props.totalCount} members in all</p>
        ) : null}
        {!editingMilestone && props.actionError ? (
          <p className="workflow-error" role="alert">{props.actionError}</p>
        ) : null}
      </section>

      <WebCommunityWorkflowMilestoneModal
        catalog={catalog}
        formsStatus={formsState}
        onRetryForms={() => setFormsRetry(n => n + 1)}
        forms={publishedForms}
        channels={props.channels}
        channelsUnavailable={props.channelsUnavailable}
        isOpen={Boolean(editingMilestone)}
        milestone={editingMilestone}
        milestoneNumber={Math.max(1, editingMilestoneIndex + 1)}
        isSaving={props.isSaving}
        canDelete={
          Boolean(editingMilestone?.key) &&
          milestones.length > COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES
        }
        deleteDisabledReason={
          milestones.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES
            ? "A workflow needs at least one stage"
            : null
        }
        error={props.actionError}
        onClose={closeMilestone}
        onSave={saveMilestone}
        onDelete={deleteEditingMilestone}
        openTo={openTo}
      />
    </div>
  );
}
