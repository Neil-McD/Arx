import { Pencil, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { WebPlatformTabList, platformTabId, platformTabPanelId } from "./WebPlatformChoiceControls";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
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
import { WebCommunityWorkflowMemberStub } from "./WebCommunityWorkflowMemberStub";
import { WebCommunityWorkflowMilestoneModal } from "./WebCommunityWorkflowMilestoneModal";
import "./WebCommunityWorkflowsSection.css";
import { WebCommunityForms } from "./WebCommunityForms";
import { WebCommunityFormResponses } from "./WebCommunityFormResponses";
import type { CommunityFormsGateway } from "../controllers/useWebCommunityFormsGateway";

export type WebCommunityWorkflowsSectionProps = {
  forms?: CommunityFormsGateway;
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
  onCreateMilestone: (name: string, instructions?: string, goal?: string) => Promise<boolean>;
  onUpdateMilestone: (
    milestoneKey: string,
    name: string,
    automations: CommunityMemberWorkflowAutomation[],
    instructions?: string,
    goal?: string,
  ) => Promise<boolean>;
  onDeleteMilestone: (milestoneKey: string) => Promise<boolean>;
  onClearActionError: () => void;
  onOpenMemberDossier: (membershipId: string) => void;
  onCloseMemberDossier: () => void;
  onRetryMemberDossier: () => void;
  isServiceChannelSaving: boolean;
  serviceChannelError: string | null;
  onSetServiceChannel: (channelId: string | null, expectedRevision: number) => Promise<boolean>;
  onForceMove: (snapshot: CloudCommunityMemberSuccessDossier) => Promise<void>;
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
    setSection(workflowSectionFromSearch(window.location.search));
    return () => { scopeEpoch.current++; };
  }, [props.forms?.scopeKey]);
  const select = async (next: WorkflowSection, replace = false, fromHistory = false) => {
    if (pending.current) {
      if (fromHistory) window.history.replaceState(window.history.state, "", workflowSectionUrl(window.location.href, section));
      return;
    }
    if (next === section) return;
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
  const tabs = WORKFLOW_SECTIONS.map(id => ({ id, label: id[0].toUpperCase() + id.slice(1), disabled: switching }));
  return <div className="workflow-page workflow-sections">
    <WebPlatformTabList tabs={tabs} activeTab={section} onSelectTab={(next, meta) => void select(next, meta.source === "keyboard")}
      ariaLabel="Workflow sections" idPrefix="workflow-sections" className="platform-switcher platform-switcher-compact workflow-section-tabs"
      style={buildPlatformSwitcherStyle(3, WORKFLOW_SECTIONS.indexOf(section))} />
    <div className="workflow-section-content" role="tabpanel" id={platformTabPanelId("workflow-sections", section)} aria-labelledby={platformTabId("workflow-sections", section)}>
      {section === "workflows" ? <WorkflowBoard {...props} /> : section === "forms" ? props.forms
        ? <WebCommunityForms key={props.forms.scopeKey} gateway={props.forms} leaveGuard={beforeLeave} />
        : <p role="status">Forms are unavailable.</p>
        : <div className="workflow-integrations-empty"><h2>Integrations are not available yet</h2><p>App and MCP connections are not enabled for workflows.</p></div>}
    </div>
  </div>;
}

function WorkflowBoard(props: WebCommunityWorkflowsSectionProps) {
  const [publishedForms, setPublishedForms] = useState<Array<{ key: string; name: string }>>([]);
  const [formsState, setFormsState] = useState<"loading" | "ready" | "error">("loading");
  const [formsRetry, setFormsRetry] = useState(0);
  useEffect(() => {
    let alive = true; setPublishedForms([]); setFormsState("loading");
    if (!props.forms) { setFormsState("error"); return; }
    props.forms.load().then(rows => { if (alive) { setPublishedForms(rows.filter(r => r.publishedRevision !== null)); setFormsState("ready"); } }).catch(() => { if (alive) setFormsState("error"); });
    return () => { alive = false; };
  }, [props.forms, formsRetry]);
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

  const openMilestone = (milestoneKey: string) => {
    props.onClearActionError();
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
      ? await props.onCreateMilestone(milestone.name, milestone.instructions, milestone.goal)
      : await props.onUpdateMilestone(
          milestone.key,
          milestone.name,
          milestone.automations,
          milestone.instructions,
          milestone.goal,
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
        <div className="workflow-milestone-canvas" aria-label="Member success milestones">
          {milestones.map((milestone, index) => {
            const members = membersByMilestone.get(milestone.key) ?? [];
            const incomplete = !milestone.name.trim();
            return (
              <section className="workflow-milestone-column" key={milestone.key || "blank-milestone"}>
                <header className="workflow-milestone-column-header">
                  <div>
                    <span className="workflow-milestone-position">{index + 1}</span>
                    <h2>{milestone.name.trim() || `Milestone ${index + 1}`}</h2>
                  </div>
                  <div className="workflow-milestone-column-actions">
                    <span aria-label={`${members.length} members`}>{members.length}</span>
                    {!incomplete ? (
                      <button
                        className="workflow-milestone-edit-button"
                        type="button"
                        onClick={() => openMilestone(milestone.key)}
                        aria-label={`Edit ${milestone.name}`}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </header>
                <div className="workflow-milestone-column-body">
                  {incomplete ? (
                    <button
                      className="workflow-milestone-setup-button"
                      type="button"
                      onClick={() => openMilestone("")}
                    >
                      <Plus size={17} aria-hidden="true" />
                      Set up milestone
                    </button>
                  ) : members.length > 0 ? (
                    members.map((member) => (
                      <WebCommunityWorkflowMemberStub
                        key={member.membership_id}
                        member={member}
                        onOpen={() => props.onOpenMemberDossier(member.membership_id)}
                      />
                    ))
                  ) : (
                    <p className="workflow-milestone-empty">No members yet</p>
                  )}
                </div>
              </section>
            );
          })}
          <button
            className="workflow-add-milestone-button"
            type="button"
            disabled={
              props.isSaving ||
              !props.board ||
              props.board.milestones.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES
            }
            onClick={addMilestone}
            aria-label="Add milestone"
            title="Add milestone"
          >
            <Plus size={19} aria-hidden="true" />
          </button>
        </div>

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
          <p className="workflow-board-footnote">{props.totalCount} members</p>
        ) : null}
        {!editingMilestone && props.actionError ? (
          <p className="workflow-error" role="alert">{props.actionError}</p>
        ) : null}
      </section>

      <WebCommunityWorkflowMilestoneModal
        formsStatus={formsState}
        onRetryForms={() => setFormsRetry(n => n + 1)}
        forms={publishedForms}
        channels={props.channels}
        channelsUnavailable={props.channelsUnavailable}
        isOpen={Boolean(editingMilestone)}
        milestone={editingMilestone}
        milestoneNumber={Math.max(1, editingMilestoneIndex + 1)}
        nextMilestoneName={milestones[editingMilestoneIndex + 1]?.name ?? null}
        isSaving={props.isSaving}
        canDelete={
          Boolean(editingMilestone?.key) &&
          milestones.length > COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES
        }
        deleteDisabledReason={
          milestones.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES
            ? "A workflow needs at least one milestone"
            : null
        }
        error={props.actionError}
        onClose={closeMilestone}
        onSave={saveMilestone}
        onDelete={deleteEditingMilestone}
      />
      <WebCommunityWorkflowMemberDossierModal
        formResponses={props.forms?.responses && props.memberDossier ? <WebCommunityFormResponses key={`${props.forms.scopeKey}:${props.memberDossier.membership_id}`} gateway={props.forms} membershipId={props.memberDossier.membership_id} /> : null}
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
        onOpenServiceChannel={props.onOpenServiceChannel}
      />
    </div>
  );
}
