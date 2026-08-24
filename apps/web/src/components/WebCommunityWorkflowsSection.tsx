import { Pencil, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES,
  COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES,
  normalizeCommunityMemberWorkflowDefinition,
  type CommunityMemberWorkflowDefinition,
  type CommunityMemberWorkflowStage,
} from "../../../../shared/communityMemberWorkflow";
import type { CloudCommunityMemberWorkflowBoard } from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import { WebCommunityWorkflowStageModal } from "./WebCommunityWorkflowStageModal";
import "./WebCommunityWorkflowsSection.css";

export type WebCommunityWorkflowsSectionProps = {
  board: CloudCommunityMemberWorkflowBoard | null;
  hasLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  actionError: string | null;
  onReload: () => Promise<unknown> | unknown;
  onSaveDefinition: (
    definition: CommunityMemberWorkflowDefinition,
  ) => Promise<boolean>;
  onClearActionError: () => void;
};

function blankCanvasDefinition(): CommunityMemberWorkflowDefinition {
  return { stages: [{ key: "new", name: "" }] };
}

function definitionFromBoard(
  board: CloudCommunityMemberWorkflowBoard,
): CommunityMemberWorkflowDefinition {
  return { stages: board.stages.map((stage) => ({ ...stage })) };
}

function uniqueStageKey(
  stages: CommunityMemberWorkflowDefinition["stages"],
): string {
  const used = new Set(stages.map((stage) => stage.key));
  let sequence = stages.length + 1;
  let candidate = `stage-${sequence}`;
  while (used.has(candidate)) {
    sequence += 1;
    candidate = `stage-${sequence}`;
  }
  return candidate;
}

export function WebCommunityWorkflowsSection(
  props: WebCommunityWorkflowsSectionProps,
) {
  const [definition, setDefinition] =
    useState<CommunityMemberWorkflowDefinition>(blankCanvasDefinition);
  const [editingStageKey, setEditingStageKey] = useState<string | null>(null);
  const [provisionalStageKey, setProvisionalStageKey] = useState<string | null>(
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDefinition(
      props.board
        ? definitionFromBoard(props.board)
        : blankCanvasDefinition(),
    );
    setEditingStageKey(null);
    setProvisionalStageKey(null);
    setLocalError(null);
  }, [props.board?.id, props.board?.revision]);

  const editingStage =
    definition.stages.find((stage) => stage.key === editingStageKey) ?? null;
  const editingStageIndex = editingStage
    ? definition.stages.findIndex((stage) => stage.key === editingStage.key)
    : -1;
  const membersByStage = useMemo(() => {
    const grouped = new Map<
      string,
      NonNullable<WebCommunityWorkflowsSectionProps["board"]>["members"]
    >();
    for (const member of props.board?.members ?? []) {
      const members = grouped.get(member.current_stage_key) ?? [];
      members.push(member);
      grouped.set(member.current_stage_key, members);
    }
    return grouped;
  }, [props.board?.members]);
  const editingStageHasMembers = editingStage
    ? (membersByStage.get(editingStage.key)?.length ?? 0) > 0
    : false;
  const persistedStageKeys = new Set(
    props.board?.stages.map((stage) => stage.key) ?? [],
  );

  const openStage = (stageKey: string) => {
    props.onClearActionError();
    setLocalError(null);
    setEditingStageKey(stageKey);
  };

  const closeStage = () => {
    if (provisionalStageKey) {
      setDefinition((current) => ({
        stages: current.stages.filter(
          (stage) => stage.key !== provisionalStageKey,
        ),
      }));
    }
    setEditingStageKey(null);
    setProvisionalStageKey(null);
    setLocalError(null);
    props.onClearActionError();
  };

  const addStage = () => {
    if (
      props.isSaving ||
      definition.stages.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES
    ) {
      return;
    }
    const key = uniqueStageKey(definition.stages);
    setDefinition((current) => ({
      stages: [...current.stages, { key, name: "" }],
    }));
    setProvisionalStageKey(key);
    setEditingStageKey(key);
    setLocalError(null);
  };

  const deleteEditingStage = async () => {
    if (
      !editingStage ||
      editingStageHasMembers ||
      definition.stages.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES
    ) {
      return;
    }
    const next = {
      stages: definition.stages.filter(
        (stage) => stage.key !== editingStage.key,
      ),
    };
    if (
      provisionalStageKey === editingStage.key ||
      !persistedStageKeys.has(editingStage.key)
    ) {
      setDefinition(next);
      setEditingStageKey(null);
      setProvisionalStageKey(null);
      return;
    }
    try {
      const normalized = normalizeCommunityMemberWorkflowDefinition(next);
      if (await props.onSaveDefinition(normalized)) {
        setDefinition(normalized);
        setEditingStageKey(null);
      }
    } catch {
      setLocalError("This stage could not be deleted. Nothing was changed.");
    }
  };

  const saveStage = async (stage: CommunityMemberWorkflowStage) => {
    const next = {
      stages: definition.stages.map((current) =>
        current.key === stage.key ? stage : current,
      ),
    };
    try {
      const normalized = normalizeCommunityMemberWorkflowDefinition(next);
      if (await props.onSaveDefinition(normalized)) {
        setDefinition(normalized);
        setEditingStageKey(null);
        setProvisionalStageKey(null);
        setLocalError(null);
      }
    } catch {
      setLocalError("Name the stage before saving it.");
    }
  };

  if (props.isLoading && !props.hasLoaded) {
    return (
      <div
        className="workflow-page workflow-page-loading"
        aria-label="Loading workflows"
      >
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
          <h1 className="resources-header" id="workflow-title">
            Workflows
          </h1>
        </header>

        <div className="workflow-stage-canvas" aria-label="Member success stages">
          {definition.stages.map((stage, index) => {
            const members = membersByStage.get(stage.key) ?? [];
            const incomplete = !stage.name.trim();
            return (
              <section className="workflow-stage-column" key={stage.key}>
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
                      onClick={() => openStage(stage.key)}
                    >
                      <Plus size={17} aria-hidden="true" />
                      Set up stage
                    </button>
                  ) : members.length > 0 ? (
                    members.map((member) => (
                      <div
                        className="workflow-member-row"
                        key={member.membership_id}
                      >
                        <UserAvatar
                          name={member.display_name}
                          imageUrl={member.avatar_url}
                          focusX={member.avatar_focus_x}
                          focusY={member.avatar_focus_y}
                          zoom={member.avatar_zoom}
                          className="workflow-member-avatar"
                        />
                        <span>{member.display_name}</span>
                      </div>
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
              definition.stages.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES
            }
            onClick={addStage}
            aria-label="Add stage"
            title="Add stage"
          >
            <Plus size={19} aria-hidden="true" />
          </button>
        </div>

        {props.board?.members_truncated ? (
          <p className="workflow-board-footnote">
            This first view shows the earliest 200 active members.
          </p>
        ) : null}
        {!editingStage && (localError || props.actionError) ? (
          <p className="workflow-error" role="alert">
            {localError ?? props.actionError}
          </p>
        ) : null}
      </section>

      <WebCommunityWorkflowStageModal
        isOpen={Boolean(editingStage)}
        stage={editingStage}
        stageNumber={Math.max(1, editingStageIndex + 1)}
        isSaving={props.isSaving}
        canDelete={
          Boolean(editingStage) &&
          definition.stages.length > COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES &&
          !editingStageHasMembers
        }
        deleteDisabledReason={
          editingStageHasMembers
            ? "Move members before deleting this stage"
            : definition.stages.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES
              ? "A workflow needs at least one stage"
              : null
        }
        error={localError ?? props.actionError}
        onClose={closeStage}
        onSave={saveStage}
        onDelete={deleteEditingStage}
      />
    </div>
  );
}
