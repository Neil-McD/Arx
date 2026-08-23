import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
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
} from "../../../../shared/communityMemberWorkflow";
import type {
  CloudCommunityMemberWorkflowBoard,
  CloudCommunityMemberWorkflowEnrollmentDetail,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
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
  onActivateDraft: () => Promise<boolean>;
  onSelectEnrollment: (enrollmentId: string | null) => void;
  onAddEvidence: (summary: string) => Promise<boolean>;
  onMoveEnrollment: (
    targetStageKey: string,
    reason: string,
  ) => Promise<boolean>;
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

function stageName(
  board: CloudCommunityMemberWorkflowBoard,
  key: string | null,
): string {
  if (!key) return "None";
  const version = board.active_version ?? board.draft_version;
  return version?.stages.find((stage) => stage.key === key)?.name ?? key;
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

function WorkflowEmptyState(props: {
  communityName: string | null;
  isSaving: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="workflow-empty-state">
      <div className="workflow-empty-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h1>Give every member a clear path to success.</h1>
      <p>
        Define the few stages that matter. Then keep each member moving with
        explicit decisions and evidence.
      </p>
      <button
        className="workflow-primary-button"
        type="button"
        disabled={props.isSaving}
        onClick={props.onCreate}
      >
        <Plus size={16} aria-hidden="true" />
        {props.isSaving ? "Creating…" : "Create workflow"}
      </button>
      {props.communityName ? (
        <small>Only builders in {props.communityName} can see this.</small>
      ) : null}
    </div>
  );
}

function WorkflowDraftEditor(props: {
  initialDraft: CommunityMemberWorkflowDraft;
  hasActiveVersion: boolean;
  hasSavedDraft: boolean;
  isSaving: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSave: (draft: CommunityMemberWorkflowDraft) => Promise<boolean>;
  onActivate: () => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => cloneDraft(props.initialDraft));
  const [isDirty, setIsDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(cloneDraft(props.initialDraft));
    setIsDirty(false);
    setLocalError(null);
  }, [props.initialDraft]);

  const updateDraft = (next: CommunityMemberWorkflowDraft) => {
    setDraft(next);
    setIsDirty(true);
    setLocalError(null);
  };

  const updateStage = (
    index: number,
    field: "name" | "objective" | "completionDefinition",
    value: string,
  ) => {
    const stages = draft.stages.map((stage, stageIndex) =>
      stageIndex === index ? { ...stage, [field]: value } : stage,
    );
    updateDraft({ ...draft, stages });
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.stages.length) return;
    const stages = draft.stages.slice();
    const [stage] = stages.splice(index, 1);
    stages.splice(target, 0, stage!);
    updateDraft({ ...draft, stages });
  };

  const save = async () => {
    try {
      const normalized = normalizeCommunityMemberWorkflowDraft(draft);
      const saved = await props.onSave(normalized);
      if (saved) setIsDirty(false);
    } catch {
      setLocalError(
        `Add a name, outcome, objective, and completion definition for each of the ${COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES}–${COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES} stages.`,
      );
    }
  };

  const activate = async () => {
    if (isDirty) {
      setLocalError("Save this draft before activating it.");
      return;
    }
    if (await props.onActivate()) props.onCancel();
  };

  return (
    <section
      className="workflow-editor"
      aria-labelledby="workflow-editor-title"
    >
      <header className="workflow-editor-header">
        <div>
          <span className="workflow-eyebrow">Workflow draft</span>
          <h1 id="workflow-editor-title">
            {props.hasActiveVersion
              ? "Edit the success path"
              : "Define the success path"}
          </h1>
        </div>
        {props.hasActiveVersion ? (
          <button
            className="workflow-icon-button"
            type="button"
            onClick={props.onCancel}
            aria-label="Close workflow editor"
            title="Close editor"
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <div className="workflow-editor-fields">
        <label>
          <span>Workflow name</span>
          <input
            value={draft.name}
            onChange={(event) =>
              updateDraft({ ...draft, name: event.target.value })
            }
            placeholder="Client success"
          />
        </label>
        <label>
          <span>Outcome</span>
          <input
            value={draft.outcomeName}
            onChange={(event) =>
              updateDraft({ ...draft, outcomeName: event.target.value })
            }
            placeholder="The result members should achieve"
          />
        </label>
        <label className="workflow-editor-wide-field">
          <span>What does success mean?</span>
          <textarea
            rows={3}
            value={draft.outcomeDefinition}
            onChange={(event) =>
              updateDraft({ ...draft, outcomeDefinition: event.target.value })
            }
          />
        </label>
      </div>

      <div className="workflow-editor-stage-heading">
        <div>
          <h2>Stages</h2>
          <p>Keep the path short enough that every stage means something.</p>
        </div>
        <button
          className="workflow-secondary-button"
          type="button"
          disabled={draft.stages.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES}
          onClick={() => {
            const nextNumber = draft.stages.length + 1;
            updateDraft({
              ...draft,
              stages: [
                ...draft.stages,
                {
                  key: `stage-${Date.now().toString(36)}`,
                  name: `Stage ${nextNumber}`,
                  objective: "Define the concrete objective for this stage.",
                  completionDefinition:
                    "Define the evidence that proves this stage is complete.",
                },
              ],
            });
          }}
        >
          <Plus size={15} aria-hidden="true" /> Add stage
        </button>
      </div>

      <ol className="workflow-editor-stage-list">
        {draft.stages.map((stage, index) => (
          <li className="workflow-editor-stage" key={stage.key}>
            <div className="workflow-editor-stage-order" aria-hidden="true">
              {index + 1}
            </div>
            <div className="workflow-editor-stage-fields">
              <label>
                <span>Stage name</span>
                <input
                  value={stage.name}
                  onChange={(event) =>
                    updateStage(index, "name", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Objective</span>
                <textarea
                  rows={2}
                  value={stage.objective}
                  onChange={(event) =>
                    updateStage(index, "objective", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Completion definition</span>
                <textarea
                  rows={2}
                  value={stage.completionDefinition}
                  onChange={(event) =>
                    updateStage(
                      index,
                      "completionDefinition",
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>
            <div className="workflow-editor-stage-actions">
              <button
                className="workflow-icon-button"
                type="button"
                disabled={index === 0}
                onClick={() => moveStage(index, -1)}
                aria-label={`Move ${stage.name} earlier`}
              >
                <ChevronUp size={16} aria-hidden="true" />
              </button>
              <button
                className="workflow-icon-button"
                type="button"
                disabled={index === draft.stages.length - 1}
                onClick={() => moveStage(index, 1)}
                aria-label={`Move ${stage.name} later`}
              >
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              <button
                className="workflow-icon-button workflow-destructive-icon"
                type="button"
                disabled={
                  draft.stages.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES
                }
                onClick={() =>
                  updateDraft({
                    ...draft,
                    stages: draft.stages.filter(
                      (_, stageIndex) => stageIndex !== index,
                    ),
                  })
                }
                aria-label={`Delete ${stage.name}`}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {localError || props.serverError ? (
        <p className="workflow-error" role="alert">
          {localError ?? props.serverError}
        </p>
      ) : null}

      <footer className="workflow-editor-footer">
        <span>{isDirty ? "Unsaved changes" : "Draft saved"}</span>
        <div>
          <button
            className="workflow-secondary-button"
            type="button"
            disabled={props.isSaving || !isDirty}
            onClick={() => void save()}
          >
            {props.isSaving ? "Saving…" : "Save draft"}
          </button>
          {props.hasSavedDraft ? (
            <button
              className="workflow-primary-button"
              type="button"
              disabled={props.isSaving || isDirty}
              onClick={() => void activate()}
            >
              <Check size={16} aria-hidden="true" />
              {props.hasActiveVersion ? "Activate update" : "Activate workflow"}
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}

function WorkflowMemberInspector(props: {
  board: CloudCommunityMemberWorkflowBoard;
  detail: CloudCommunityMemberWorkflowEnrollmentDetail;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onAddEvidence: (summary: string) => Promise<boolean>;
  onMove: (stageKey: string, reason: string) => Promise<boolean>;
}) {
  const { enrollment } = props.detail;
  const version = enrollment.workflow_version;
  const [targetStageKey, setTargetStageKey] = useState(
    enrollment.current_stage_key,
  );
  const [reason, setReason] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");

  useEffect(() => {
    setTargetStageKey(enrollment.current_stage_key);
    setReason("");
    setEvidenceSummary("");
  }, [enrollment.id, enrollment.current_stage_key, enrollment.revision]);

  const submitMove = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim() || targetStageKey === enrollment.current_stage_key)
      return;
    if (await props.onMove(targetStageKey, reason)) setReason("");
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

function WorkflowBoard(
  props: WebCommunityWorkflowsSectionProps & {
    board: CloudCommunityMemberWorkflowBoard;
    onEdit: () => void;
  },
) {
  const version = props.board.active_version ?? props.board.draft_version;
  const [selectedStageKey, setSelectedStageKey] = useState(
    version?.stages[0]?.key ?? "",
  );
  const selectedStage =
    version?.stages.find((stage) => stage.key === selectedStageKey) ??
    version?.stages[0] ??
    null;

  useEffect(() => {
    if (!version?.stages.some((stage) => stage.key === selectedStageKey)) {
      setSelectedStageKey(version?.stages[0]?.key ?? "");
    }
  }, [selectedStageKey, version]);

  if (!version) return null;
  const backfillPending =
    props.board.enrollment_backfill_status === "queued" ||
    props.board.enrollment_backfill_status === "running";

  return (
    <section
      className="workflow-board-shell"
      aria-labelledby="workflow-board-title"
    >
      <header className="workflow-board-header">
        <div>
          <div className="workflow-board-title-line">
            <h1 id="workflow-board-title">{props.board.name}</h1>
            <span
              className={`workflow-status workflow-status-${props.board.status}`}
            >
              {props.board.status === "active" ? "Active" : "Draft"}
            </span>
            {props.board.draft_version && props.board.active_version ? (
              <span className="workflow-draft-note">Draft changes</span>
            ) : null}
          </div>
          <p>{version.outcome_name}</p>
        </div>
        <div className="workflow-board-actions">
          <button
            className="workflow-icon-button"
            type="button"
            onClick={() => void props.onReload()}
            disabled={props.isLoading}
            aria-label="Reload workflow"
            title="Reload"
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button
            className="workflow-secondary-button"
            type="button"
            onClick={props.onEdit}
          >
            <Pencil size={15} aria-hidden="true" /> Edit workflow
          </button>
        </div>
      </header>

      {backfillPending ? (
        <div className="workflow-sync-note" role="status">
          Adding current members to this workflow…
        </div>
      ) : null}
      {props.board.enrollment_backfill_status === "error" ? (
        <div className="workflow-sync-note is-error" role="alert">
          Some current members could not be added. Reload to check the latest
          state.
        </div>
      ) : null}

      <div
        className={`workflow-board-layout${props.selectedEnrollmentId ? " has-member-inspector" : ""}`}
      >
        <div className="workflow-board-main">
          <div
            className="workflow-stage-board"
            aria-label="Member success stages"
          >
            {version.stages.map((stage, index) => {
              const members = props.board.members.filter(
                (member) => member.current_stage_key === stage.key,
              );
              const isSelected = selectedStage?.key === stage.key;
              return (
                <section
                  className={`workflow-stage-column${isSelected ? " is-selected" : ""}`}
                  key={stage.key}
                >
                  <button
                    className="workflow-stage-header"
                    type="button"
                    onClick={() => {
                      setSelectedStageKey(stage.key);
                      props.onSelectEnrollment(null);
                    }}
                    aria-pressed={isSelected && !props.selectedEnrollmentId}
                  >
                    <span className="workflow-stage-number">{index + 1}</span>
                    <span>{stage.name}</span>
                    <span className="workflow-stage-count">
                      {members.length}
                    </span>
                  </button>
                  <div className="workflow-stage-members">
                    {members.length > 0 ? (
                      members.map((member) => (
                        <button
                          className={`workflow-member-row${props.selectedEnrollmentId === member.enrollment_id ? " is-selected" : ""}`}
                          type="button"
                          key={member.enrollment_id}
                          onClick={() => {
                            setSelectedStageKey(stage.key);
                            props.onSelectEnrollment(member.enrollment_id);
                          }}
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
                      <p className="workflow-stage-empty">No members</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          {props.board.truncated_stage_keys.length > 0 ? (
            <p className="workflow-board-footnote">
              Some stages contain more members than this first view shows.
            </p>
          ) : null}
        </div>

        {props.selectedEnrollmentId ? (
          props.selectedEnrollment ? (
            <WorkflowMemberInspector
              board={props.board}
              detail={props.selectedEnrollment}
              isSaving={props.isSaving}
              error={props.actionError}
              onClose={() => props.onSelectEnrollment(null)}
              onAddEvidence={props.onAddEvidence}
              onMove={props.onMoveEnrollment}
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
          )
        ) : selectedStage ? (
          <aside
            className="workflow-inspector workflow-stage-inspector"
            aria-label={`${selectedStage.name} stage details`}
          >
            <span className="workflow-eyebrow">
              Stage {version.stages.indexOf(selectedStage) + 1}
            </span>
            <h2>{selectedStage.name}</h2>
            <section>
              <h3>Objective</h3>
              <p>{selectedStage.objective}</p>
            </section>
            <section>
              <h3>Complete when</h3>
              <p>{selectedStage.completionDefinition}</p>
            </section>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

export function WebCommunityWorkflowsSection(
  props: WebCommunityWorkflowsSectionProps,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [editorDraft, setEditorDraft] = useState<CommunityMemberWorkflowDraft>(
    () => cloneDraft(DEFAULT_COMMUNITY_MEMBER_WORKFLOW_DRAFT),
  );

  useEffect(() => {
    if (!props.board) {
      setIsEditing(false);
      return;
    }
    if (!props.board.active_version) {
      setEditorDraft(draftFromBoard(props.board));
      setIsEditing(true);
    }
  }, [props.board?.id, props.board?.active_version?.id]);

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

  if (!props.board) {
    return (
      <div className="workflow-page">
        <WorkflowEmptyState
          communityName={props.activeCommunityName}
          isSaving={props.isSaving}
          onCreate={() => {
            void props.onSaveDraft(
              cloneDraft(DEFAULT_COMMUNITY_MEMBER_WORKFLOW_DRAFT),
            );
          }}
        />
        {props.actionError ? (
          <p className="workflow-error" role="alert">
            {props.actionError}
          </p>
        ) : null}
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="workflow-page workflow-page-editor">
        <WorkflowDraftEditor
          initialDraft={editorDraft}
          hasActiveVersion={Boolean(props.board.active_version)}
          hasSavedDraft={Boolean(props.board.draft_version)}
          isSaving={props.isSaving}
          serverError={props.actionError}
          onCancel={() => {
            props.onClearActionError();
            setIsEditing(false);
          }}
          onSave={async (draft) => {
            const saved = await props.onSaveDraft(draft);
            if (saved) setEditorDraft(draft);
            return saved;
          }}
          onActivate={props.onActivateDraft}
        />
      </div>
    );
  }

  return (
    <div className="workflow-page workflow-page-board">
      <WorkflowBoard
        {...props}
        board={props.board}
        onEdit={() => {
          props.onClearActionError();
          setEditorDraft(draftFromBoard(props.board!));
          setIsEditing(true);
        }}
      />
    </div>
  );
}
