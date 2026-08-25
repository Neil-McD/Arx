import { Pencil, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES,
  COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES,
  type CommunityMemberWorkflowStage,
} from "../../../../shared/communityMemberWorkflow";
import type {
  CloudCommunityMemberWorkflowBoard,
  CloudCommunityMemberWorkflowMember,
  CloudCommunityMemberSuccessDossier,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import { WebCommunityWorkflowMemberDossierModal } from "./WebCommunityWorkflowMemberDossierModal";
import { WebCommunityWorkflowMemberStub } from "./WebCommunityWorkflowMemberStub";
import { WebCommunityWorkflowStageModal } from "./WebCommunityWorkflowStageModal";
import "./WebCommunityWorkflowsSection.css";

export type WebCommunityWorkflowsSectionProps = {
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
  onCreateStage: (name: string) => Promise<boolean>;
  onUpdateStage: (
    stageKey: string,
    name: string,
    milestone: string | null,
  ) => Promise<boolean>;
  onDeleteStage: (stageKey: string) => Promise<boolean>;
  onClearActionError: () => void;
  onOpenMemberDossier: (membershipId: string) => void;
  onCloseMemberDossier: () => void;
};

const BLANK_STAGE: CommunityMemberWorkflowStage = { key: "", name: "" };

export function WebCommunityWorkflowsSection(
  props: WebCommunityWorkflowsSectionProps,
) {
  const [editingStageKey, setEditingStageKey] = useState<string | null>(null);
  const [isCreatingStage, setIsCreatingStage] = useState(false);
  const stages = props.board?.stages ?? [BLANK_STAGE];
  const editingStage = isCreatingStage
    ? BLANK_STAGE
    : stages.find((stage) => stage.key === editingStageKey) ?? null;
  const editingStageIndex = isCreatingStage
    ? props.board
      ? stages.length
      : 0
    : editingStage
      ? stages.findIndex((stage) => stage.key === editingStage.key)
      : -1;
  const membersByStage = useMemo(() => {
    const grouped = new Map<string, CloudCommunityMemberWorkflowMember[]>();
    for (const member of props.members) {
      const members = grouped.get(member.current_stage_key) ?? [];
      members.push(member);
      grouped.set(member.current_stage_key, members);
    }
    return grouped;
  }, [props.members]);

  const openStage = (stageKey: string) => {
    props.onClearActionError();
    setIsCreatingStage(!stageKey);
    setEditingStageKey(stageKey || null);
  };

  const closeStage = () => {
    setEditingStageKey(null);
    setIsCreatingStage(false);
    props.onClearActionError();
  };

  const addStage = () => {
    if (
      props.isSaving ||
      (props.board?.stages.length ?? 0) >= COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES
    ) return;
    openStage("");
  };

  const deleteEditingStage = async () => {
    if (!editingStage?.key || stages.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES) return;
    if (await props.onDeleteStage(editingStage.key)) closeStage();
  };

  const saveStage = async (stage: CommunityMemberWorkflowStage) => {
    const saved = !stage.key || isCreatingStage
      ? await props.onCreateStage(stage.name)
      : await props.onUpdateStage(
          stage.key,
          stage.name,
          stage.milestone ?? null,
        );
    if (saved) closeStage();
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
        aria-labelledby="workflow-title"
      >
        <header className="feed-header-row workflow-pipeline-header">
          <h1 className="resources-header" id="workflow-title">Workflows</h1>
        </header>

        <div className="workflow-stage-canvas" aria-label="Member success stages">
          {stages.map((stage, index) => {
            const members = membersByStage.get(stage.key) ?? [];
            const incomplete = !stage.name.trim();
            return (
              <section className="workflow-stage-column" key={stage.key || "blank-stage"}>
                <header className="workflow-stage-column-header">
                  <div>
                    <span className="workflow-stage-position">{index + 1}</span>
                    <h2>{stage.name.trim() || `Stage ${index + 1}`}</h2>
                  </div>
                  <div className="workflow-stage-column-actions">
                    <span>{members.length}</span>
                    {!incomplete ? (
                      <button
                        className="workflow-stage-edit-button"
                        type="button"
                        onClick={() => openStage(stage.key)}
                        aria-label={`Edit ${stage.name}`}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </header>
                <div className="workflow-stage-column-body">
                  {incomplete ? (
                    <button
                      className="workflow-stage-setup-button"
                      type="button"
                      onClick={() => openStage("")}
                    >
                      <Plus size={17} aria-hidden="true" />
                      Set up stage
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
                    <p className="workflow-stage-empty">No members yet</p>
                  )}
                </div>
              </section>
            );
          })}
          <button
            className="workflow-add-stage-button"
            type="button"
            disabled={
              props.isSaving ||
              !props.board ||
              props.board.stages.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES
            }
            onClick={addStage}
            aria-label="Add stage"
            title="Add stage"
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
        {!editingStage && props.actionError ? (
          <p className="workflow-error" role="alert">{props.actionError}</p>
        ) : null}
      </section>

      <WebCommunityWorkflowStageModal
        isOpen={Boolean(editingStage)}
        stage={editingStage}
        stageNumber={Math.max(1, editingStageIndex + 1)}
        isSaving={props.isSaving}
        canDelete={
          Boolean(editingStage?.key) &&
          stages.length > COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES
        }
        canConfigureMilestone={
          Boolean(editingStage?.key) && editingStageIndex < stages.length - 1
        }
        deleteDisabledReason={
          stages.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES
            ? "A workflow needs at least one stage"
            : null
        }
        error={props.actionError}
        onClose={closeStage}
        onSave={saveStage}
        onDelete={deleteEditingStage}
      />
      <WebCommunityWorkflowMemberDossierModal
        isOpen={Boolean(props.selectedMembershipId)}
        dossier={props.memberDossier}
        isLoading={props.isMemberDossierLoading}
        error={props.memberDossierError}
        onClose={props.onCloseMemberDossier}
      />
    </div>
  );
}
