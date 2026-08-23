import {
  ArrowRight,
  Check,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  DEFAULT_COMMUNITY_MEMBER_WORKFLOW_DRAFT,
  COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES,
  COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES,
  normalizeCommunityMemberWorkflowDraft,
  type CommunityMemberWorkflowDraft,
  type CommunityMemberWorkflowStage,
} from "../../../../shared/communityMemberWorkflow";
import type {
  CloudCommunityMemberWorkflowBoard,
  CloudCommunityMemberWorkflowEnrollmentDetail,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import { WebCommunityWorkflowStageModal } from "./WebCommunityWorkflowStageModal";
import "./WebCommunityWorkflowsSection.css";

export type WebCommunityWorkflowsSectionProps = {
  activeCommunityName: string | null;
  board: CloudCommunityMemberWorkflowBoard | null;
  hasLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  actionError: string | null;
  selectedEnrollmentId: string | null;
  selectedEnrollment: CloudCommunityMemberWorkflowEnrollmentDetail | null;
  isLoadingEnrollment: boolean;
  onReload: () => Promise<unknown> | unknown;
  onSaveDraft: (draft: CommunityMemberWorkflowDraft) => Promise<boolean>;
  onPublishDraft: (draft: CommunityMemberWorkflowDraft) => Promise<boolean>;
  onSelectEnrollment: (enrollmentId: string | null) => void;
  onAddEvidence: (summary: string) => Promise<boolean>;
  onMoveEnrollment: (
    targetStageKey: string,
    reason: string,
  ) => Promise<boolean>;
  onCompleteEnrollment: (reason: string) => Promise<boolean>;
  onClearActionError: () => void;
};

function cloneDraft(
  draft: CommunityMemberWorkflowDraft,
): CommunityMemberWorkflowDraft {
  return {
    ...draft,
    stages: draft.stages.map((stage) => ({ ...stage })),
  };
}

function draftFromBoard(
  board: CloudCommunityMemberWorkflowBoard,
): CommunityMemberWorkflowDraft {
  const version = board.draft_version ?? board.active_version;
  if (!version) return cloneDraft(DEFAULT_COMMUNITY_MEMBER_WORKFLOW_DRAFT);
  return {
    name: board.name,
    outcomeName: version.outcome_name,
    outcomeDefinition: version.outcome_definition,
    stages: version.stages.map((stage) => ({ ...stage })),
  };
}

function blankCanvasDraft(): CommunityMemberWorkflowDraft {
  return {
    ...cloneDraft(DEFAULT_COMMUNITY_MEMBER_WORKFLOW_DRAFT),
    stages: [
      {
        key: "new",
        name: "",
        objective: "",
        completionDefinition: "",
      },
    ],
  };
}

function stageName(
  board: CloudCommunityMemberWorkflowBoard,
  key: string | null,
): string {
  if (!key) return "None";
  const versions = [board.draft_version, board.active_version].filter(Boolean);
  for (const version of versions) {
    const name = version?.stages.find((stage) => stage.key === key)?.name;
    if (name) return name;
  }
  return key;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function WorkflowMemberInspector(props: {
  board: CloudCommunityMemberWorkflowBoard;
  detail: CloudCommunityMemberWorkflowEnrollmentDetail;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onAddEvidence: (summary: string) => Promise<boolean>;
  onMove: (stageKey: string, reason: string) => Promise<boolean>;
  onComplete: (reason: string) => Promise<boolean>;
}) {
  const { enrollment } = props.detail;
  const version = enrollment.workflow_version;
  const [targetStageKey, setTargetStageKey] = useState(
    enrollment.current_stage_key,
  );
  const [reason, setReason] = useState("");
  const [completionReason, setCompletionReason] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");

  useEffect(() => {
    setTargetStageKey(enrollment.current_stage_key);
    setReason("");
    setCompletionReason("");
    setEvidenceSummary("");
  }, [enrollment.id, enrollment.current_stage_key, enrollment.revision]);

  const submitMove = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim() || targetStageKey === enrollment.current_stage_key)
      return;
    if (await props.onMove(targetStageKey, reason)) setReason("");
  };

  const submitCompletion = async (event: FormEvent) => {
    event.preventDefault();
    if (!completionReason.trim()) return;
    if (await props.onComplete(completionReason)) setCompletionReason("");
  };

  const submitEvidence = async (event: FormEvent) => {
    event.preventDefault();
    if (!evidenceSummary.trim()) return;
    if (await props.onAddEvidence(evidenceSummary)) setEvidenceSummary("");
  };

  return (
    <aside
      className="workflow-inspector workflow-member-inspector"
      aria-label={`${enrollment.display_name} workflow details`}
    >
      <header className="workflow-inspector-header">
        <div className="workflow-member-identity">
          <UserAvatar
            name={enrollment.display_name}
            imageUrl={enrollment.avatar_url}
            focusX={enrollment.avatar_focus_x}
            focusY={enrollment.avatar_focus_y}
            zoom={enrollment.avatar_zoom}
            className="workflow-member-avatar workflow-member-avatar-large"
          />
          <div>
            <h2>{enrollment.display_name}</h2>
            <p>{stageName(props.board, enrollment.current_stage_key)}</p>
          </div>
        </div>
        <button
          className="workflow-icon-button"
          type="button"
          onClick={props.onClose}
          aria-label="Close member details"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="workflow-inspector-scroll">
        {enrollment.status === "active" && version.stages.length > 1 ? (
          <section className="workflow-inspector-section">
            <h3>Move member</h3>
            <form onSubmit={submitMove}>
              <label>
                <span>Stage</span>
                <select
                  value={targetStageKey}
                  onChange={(event) => setTargetStageKey(event.target.value)}
                >
                  {version.stages.map((stage) => (
                    <option key={stage.key} value={stage.key}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Reason</span>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="What changed?"
                />
              </label>
              <button
                className="workflow-primary-button"
                type="submit"
                disabled={
                  props.isSaving ||
                  !reason.trim() ||
                  targetStageKey === enrollment.current_stage_key
                }
              >
                Move member <ArrowRight size={15} aria-hidden="true" />
              </button>
            </form>
          </section>
        ) : null}

        {enrollment.status === "active" ? (
          <section className="workflow-inspector-section workflow-completion-section">
            <h3>Complete workflow</h3>
            <p>
              Completion is an explicit decision. It is never inferred from a
              stage position.
            </p>
            <form onSubmit={submitCompletion}>
              <label>
                <span>Reason</span>
                <textarea
                  rows={3}
                  value={completionReason}
                  onChange={(event) => setCompletionReason(event.target.value)}
                  placeholder="What proves the outcome was achieved?"
                />
              </label>
              <button
                className="workflow-primary-button"
                type="submit"
                disabled={props.isSaving || !completionReason.trim()}
              >
                <Check size={15} aria-hidden="true" /> Complete workflow
              </button>
            </form>
          </section>
        ) : null}

        <section className="workflow-inspector-section">
          <h3>Evidence</h3>
          <form className="workflow-evidence-form" onSubmit={submitEvidence}>
            <label>
              <span className="sr-only">Evidence note</span>
              <textarea
                rows={3}
                value={evidenceSummary}
                onChange={(event) => setEvidenceSummary(event.target.value)}
                placeholder="Add a concrete observation or result…"
              />
            </label>
            <button
              className="workflow-secondary-button"
              type="submit"
              disabled={props.isSaving || !evidenceSummary.trim()}
            >
              Add evidence
            </button>
          </form>
          {props.detail.evidence.length > 0 ? (
            <ul className="workflow-record-list">
              {props.detail.evidence.map((row) => (
                <li key={row.id}>
                  <p>{row.summary}</p>
                  <span>
                    {stageName(props.board, row.stage_key)} ·{" "}
                    {formatShortDate(row.observed_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="workflow-inspector-empty">
              No evidence recorded yet.
            </p>
          )}
        </section>

        <section className="workflow-inspector-section">
          <h3>History</h3>
          <ol className="workflow-history-list">
            {props.detail.transitions.map((row) => (
              <li key={row.id}>
                <span className="workflow-history-marker" aria-hidden="true" />
                <div>
                  <strong>
                    {row.kind === "enrolled"
                      ? `Entered ${stageName(props.board, row.to_stage_key)}`
                      : row.kind === "completed"
                        ? `Completed in ${stageName(props.board, row.to_stage_key)}`
                        : `${stageName(props.board, row.from_stage_key)} → ${stageName(props.board, row.to_stage_key)}`}
                  </strong>
                  <p>{row.reason}</p>
                  <small>{formatShortDate(row.occurred_at)}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>
        {props.error ? (
          <p className="workflow-error" role="alert">
            {props.error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function uniqueStageKey(
  stages: CommunityMemberWorkflowDraft["stages"],
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
  const [draft, setDraft] = useState<CommunityMemberWorkflowDraft>(() =>
    blankCanvasDraft(),
  );
  const [editingStageKey, setEditingStageKey] = useState<string | null>(null);
  const [provisionalStageKey, setProvisionalStageKey] = useState<string | null>(
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const nextDraft = props.board
      ? draftFromBoard(props.board)
      : blankCanvasDraft();
    setDraft(nextDraft);
    setEditingStageKey(null);
    setProvisionalStageKey(null);
    setLocalError(null);
  }, [
    props.board?.id,
    props.board?.revision,
    props.board?.active_version?.id,
    props.board?.draft_version?.id,
  ]);

  const editingStage =
    draft.stages.find((stage) => stage.key === editingStageKey) ?? null;
  const editingStageIndex = editingStage
    ? draft.stages.findIndex((stage) => stage.key === editingStage.key)
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

  const isStageIncomplete = (stage: CommunityMemberWorkflowStage) =>
    !stage.name.trim() ||
    !stage.objective.trim() ||
    !stage.completionDefinition.trim();
  const hasIncompleteStage = draft.stages.some(isStageIncomplete);
  const persistedStageKeys = new Set(
    (props.board?.draft_version ?? props.board?.active_version)?.stages.map(
      (stage) => stage.key,
    ) ?? [],
  );

  const openStage = (stageKey: string) => {
    props.onClearActionError();
    props.onSelectEnrollment(null);
    setLocalError(null);
    setEditingStageKey(stageKey);
  };

  const closeStage = () => {
    if (provisionalStageKey) {
      setDraft((current) => ({
        ...current,
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
      draft.stages.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES
    ) {
      return;
    }
    const key = uniqueStageKey(draft.stages);
    setDraft({
      ...draft,
      stages: [
        ...draft.stages,
        {
          key,
          name: "",
          objective: "",
          completionDefinition: "",
        },
      ],
    });
    props.onSelectEnrollment(null);
    setProvisionalStageKey(key);
    setEditingStageKey(key);
    setLocalError(null);
  };

  const editingStageHasMembers = editingStage
    ? (membersByStage.get(editingStage.key)?.length ?? 0) > 0
    : false;

  const deleteEditingStage = async () => {
    if (!editingStage) return;
    if (
      draft.stages.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES ||
      editingStageHasMembers
    ) {
      return;
    }
    const stages = draft.stages.filter(
      (stage) => stage.key !== editingStage.key,
    );
    if (
      provisionalStageKey === editingStage.key ||
      !persistedStageKeys.has(editingStage.key) ||
      stages.some(isStageIncomplete)
    ) {
      setDraft({ ...draft, stages });
      setEditingStageKey(null);
      setProvisionalStageKey(null);
      setLocalError(null);
      return;
    }
    try {
      const normalized = normalizeCommunityMemberWorkflowDraft({
        ...draft,
        stages,
      });
      if (await props.onSaveDraft(normalized)) {
        setDraft(normalized);
        setEditingStageKey(null);
      }
    } catch {
      setLocalError(
        "This stage could not be deleted. Nothing was changed.",
      );
    }
  };

  const saveStage = async (stage: CommunityMemberWorkflowStage) => {
    const next = {
      ...draft,
      stages: draft.stages.map((current) =>
        current.key === stage.key ? stage : current,
      ),
    };
    if (next.stages.some(isStageIncomplete)) {
      setDraft(next);
      setEditingStageKey(null);
      setProvisionalStageKey(null);
      setLocalError(null);
      return;
    }
    try {
      const normalized = normalizeCommunityMemberWorkflowDraft(next);
      if (await props.onSaveDraft(normalized)) {
        setDraft(normalized);
        setEditingStageKey(null);
        setProvisionalStageKey(null);
        setLocalError(null);
      }
    } catch {
      setLocalError("Name the stage and define its objective and completion.");
    }
  };

  const publishDraft = async () => {
    try {
      const normalized = normalizeCommunityMemberWorkflowDraft(draft);
      await props.onPublishDraft(normalized);
    } catch {
      setLocalError("Finish setting up every stage before starting the workflow.");
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

  const backfillPending =
    props.board?.enrollment_backfill_status === "queued" ||
    props.board?.enrollment_backfill_status === "running";
  const status = props.board?.active_version
    ? props.board.draft_version
      ? "Draft changes"
      : "Active"
    : props.board?.draft_version
      ? "Draft"
      : null;
  const canPublish = Boolean(props.board?.draft_version) && !hasIncompleteStage;

  return (
    <div className="workflow-page workflow-pipeline-page">
      <section
        className="community-panel community-utility-panel workflow-pipeline-shell"
        aria-labelledby="workflow-title"
      >
        <header className="feed-header-row workflow-pipeline-header">
          <div className="workflow-board-title-line">
            <h1 className="resources-header" id="workflow-title">
              Workflows
            </h1>
            {status ? (
              <span
                className={`workflow-status workflow-status-${status.toLowerCase().replace(" ", "-")}`}
              >
                {status}
              </span>
            ) : null}
          </div>
          <div className="feed-header-actions workflow-board-actions">
            {canPublish ? (
              <button
                className="workflow-primary-button"
                type="button"
                disabled={props.isSaving}
                onClick={() => void publishDraft()}
              >
                <Check size={16} aria-hidden="true" />
                {props.board?.active_version
                  ? "Publish changes"
                  : "Start workflow"}
              </button>
            ) : null}
          </div>
        </header>

        {backfillPending ? (
          <div className="workflow-sync-note" role="status">
            Adding current members to this workflow…
          </div>
        ) : null}
        {props.board?.enrollment_backfill_status === "error" ? (
          <div className="workflow-sync-note is-error" role="alert">
            Some current members could not be added. Reload to check the latest
            state.
          </div>
        ) : null}

        <div className="workflow-stage-canvas" aria-label="Member success stages">
          {draft.stages.map((stage, index) => {
            const members = membersByStage.get(stage.key) ?? [];
            const incomplete = isStageIncomplete(stage);
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
                      <button
                        className="workflow-member-row"
                        type="button"
                        key={member.enrollment_id}
                        onClick={() =>
                          props.onSelectEnrollment(member.enrollment_id)
                        }
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
                        {member.status !== "active" ? (
                          <small>{member.status}</small>
                        ) : null}
                      </button>
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
              draft.stages.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES
            }
            onClick={addStage}
            aria-label="Add stage"
            title="Add stage"
          >
            <Plus size={19} aria-hidden="true" />
          </button>
        </div>

        {props.board?.truncated_stage_keys.length ? (
          <p className="workflow-board-footnote">
            Some stages contain more members than this first view shows.
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
          draft.stages.length > COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES &&
          !editingStageHasMembers
        }
        deleteDisabledReason={
          editingStageHasMembers
            ? "Move members before deleting this stage"
            : draft.stages.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES
              ? "A workflow needs at least one stage"
              : null
        }
        error={localError ?? props.actionError}
        onClose={closeStage}
        onSave={saveStage}
        onDelete={deleteEditingStage}
      />

      {props.selectedEnrollmentId ? (
        <div
          className="modal-overlay workflow-member-overlay"
          onMouseDown={() => props.onSelectEnrollment(null)}
        >
          <div
            className="modal workflow-member-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Member workflow details"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {props.selectedEnrollment ? (
              <WorkflowMemberInspector
                board={props.board!}
                detail={props.selectedEnrollment}
                isSaving={props.isSaving}
                error={props.actionError}
                onClose={() => props.onSelectEnrollment(null)}
                onAddEvidence={props.onAddEvidence}
                onMove={props.onMoveEnrollment}
                onComplete={props.onCompleteEnrollment}
              />
            ) : (
              <aside
                className="workflow-inspector workflow-inspector-loading"
                aria-label="Loading member details"
              >
                <span className="workflow-loading-line" />
                <span className="workflow-loading-line is-short" />
                <span className="workflow-loading-block" />
              </aside>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
