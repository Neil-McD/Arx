import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
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
    cloneDraft(DEFAULT_COMMUNITY_MEMBER_WORKFLOW_DRAFT),
  );
  const [selectedStageKey, setSelectedStageKey] = useState(
    DEFAULT_COMMUNITY_MEMBER_WORKFLOW_DRAFT.stages[0]!.key,
  );
  const [isPathEditing, setIsPathEditing] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const nextDraft = props.board
      ? draftFromBoard(props.board)
      : cloneDraft(DEFAULT_COMMUNITY_MEMBER_WORKFLOW_DRAFT);
    setDraft(nextDraft);
    setSelectedStageKey((current) =>
      nextDraft.stages.some((stage) => stage.key === current)
        ? current
        : nextDraft.stages[0]!.key,
    );
    setIsPathEditing(!props.board?.active_version);
    setIsDirty(false);
    setLocalError(null);
  }, [
    props.board?.id,
    props.board?.revision,
    props.board?.active_version?.id,
    props.board?.draft_version?.id,
  ]);

  const selectedStage =
    draft.stages.find((stage) => stage.key === selectedStageKey) ??
    draft.stages[0]!;
  const selectedStageMembers = useMemo(
    () =>
      (props.board?.members ?? []).filter(
        (member) => member.current_stage_key === selectedStage.key,
      ),
    [props.board?.members, selectedStage.key],
  );

  const updateDraft = (next: CommunityMemberWorkflowDraft) => {
    setDraft(next);
    setIsDirty(true);
    setLocalError(null);
  };

  const updateSelectedStage = (
    field: "name" | "objective" | "completionDefinition",
    value: string,
  ) => {
    updateDraft({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.key === selectedStage.key ? { ...stage, [field]: value } : stage,
      ),
    });
  };

  const addStage = () => {
    const key = uniqueStageKey(draft.stages);
    updateDraft({
      ...draft,
      stages: [
        ...draft.stages,
        {
          key,
          name: `Stage ${draft.stages.length + 1}`,
          objective: "Define the concrete objective for this stage.",
          completionDefinition:
            "Define the evidence that proves this stage is complete.",
        },
      ],
    });
    setSelectedStageKey(key);
    setIsPathEditing(true);
    props.onSelectEnrollment(null);
  };

  const moveSelectedStage = (direction: -1 | 1) => {
    const index = draft.stages.findIndex(
      (stage) => stage.key === selectedStage.key,
    );
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.stages.length) return;
    const stages = draft.stages.slice();
    const [stage] = stages.splice(index, 1);
    stages.splice(target, 0, stage!);
    updateDraft({ ...draft, stages });
  };

  const selectedStageHasMembers = (props.board?.members ?? []).some(
    (member) => member.current_stage_key === selectedStage.key,
  );

  const deleteSelectedStage = () => {
    if (
      draft.stages.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES ||
      selectedStageHasMembers
    ) {
      return;
    }
    const index = draft.stages.findIndex(
      (stage) => stage.key === selectedStage.key,
    );
    const stages = draft.stages.filter(
      (stage) => stage.key !== selectedStage.key,
    );
    updateDraft({ ...draft, stages });
    setSelectedStageKey(stages[Math.max(0, index - 1)]!.key);
  };

  const normalizedDraft = () => {
    try {
      return normalizeCommunityMemberWorkflowDraft(draft);
    } catch {
      setLocalError(
        `Add a workflow name, outcome, and complete definition for each of the ${COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES}–${COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES} stages.`,
      );
      return null;
    }
  };

  const saveDraft = async () => {
    const normalized = normalizedDraft();
    if (!normalized) return;
    if (await props.onSaveDraft(normalized)) setIsDirty(false);
  };

  const publishDraft = async () => {
    const normalized = normalizedDraft();
    if (!normalized) return;
    if (await props.onPublishDraft(normalized)) {
      setIsDirty(false);
      setIsPathEditing(false);
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
  const status = props.board?.active_version ? "Active" : "Draft";

  return (
    <div className="workflow-page workflow-pipeline-page">
      <section
        className="workflow-pipeline-shell"
        aria-labelledby="workflow-title"
      >
        <header className="workflow-pipeline-header">
          <div>
            <div className="workflow-board-title-line">
              <h1 id="workflow-title">{draft.name}</h1>
              <span
                className={`workflow-status workflow-status-${status.toLowerCase()}`}
              >
                {status}
              </span>
              {props.board?.draft_version && props.board.active_version ? (
                <span className="workflow-draft-note">Draft changes</span>
              ) : null}
            </div>
            <p>{draft.outcomeName}</p>
            {props.activeCommunityName ? (
              <small>{props.activeCommunityName}</small>
            ) : null}
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
            {props.board?.active_version && !isPathEditing ? (
              <button
                className="workflow-secondary-button"
                type="button"
                onClick={() => {
                  props.onClearActionError();
                  setIsPathEditing(true);
                }}
              >
                <Pencil size={15} aria-hidden="true" /> Edit path
              </button>
            ) : (
              <>
                <button
                  className="workflow-secondary-button"
                  type="button"
                  disabled={props.isSaving || !isDirty}
                  onClick={() => void saveDraft()}
                >
                  {props.isSaving ? "Saving…" : "Save draft"}
                </button>
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
                {props.board?.active_version ? (
                  <button
                    className="workflow-icon-button"
                    type="button"
                    onClick={() => {
                      setDraft(draftFromBoard(props.board!));
                      setIsPathEditing(false);
                      setIsDirty(false);
                      setLocalError(null);
                    }}
                    aria-label="Cancel path editing"
                  >
                    <X size={17} aria-hidden="true" />
                  </button>
                ) : null}
              </>
            )}
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

        <nav className="workflow-stage-rail" aria-label="Member success stages">
          {draft.stages.map((stage, index) => {
            const memberCount = (props.board?.members ?? []).filter(
              (member) => member.current_stage_key === stage.key,
            ).length;
            const isSelected = selectedStage.key === stage.key;
            return (
              <div className="workflow-stage-rail-item" key={stage.key}>
                <button
                  className={`workflow-stage-chip${isSelected ? " is-selected" : ""}`}
                  type="button"
                  aria-current={isSelected ? "step" : undefined}
                  onClick={() => {
                    setSelectedStageKey(stage.key);
                    props.onSelectEnrollment(null);
                  }}
                >
                  <span className="workflow-stage-number">{index + 1}</span>
                  <span>{stage.name}</span>
                  <span className="workflow-stage-count">{memberCount}</span>
                </button>
                {index < draft.stages.length - 1 ? (
                  <ChevronRight
                    className="workflow-stage-connector"
                    size={17}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
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
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </nav>

        {isPathEditing ? (
          <details className="workflow-details-disclosure">
            <summary>Workflow details</summary>
            <div className="workflow-details-fields">
              <label>
                <span>Workflow name</span>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Outcome</span>
                <input
                  value={draft.outcomeName}
                  onChange={(event) =>
                    updateDraft({ ...draft, outcomeName: event.target.value })
                  }
                />
              </label>
              <label className="workflow-details-wide-field">
                <span>What does success mean?</span>
                <textarea
                  rows={3}
                  value={draft.outcomeDefinition}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      outcomeDefinition: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          </details>
        ) : null}

        <div className="workflow-pipeline-workspace">
          <section
            className="workflow-stage-members-panel"
            aria-labelledby="stage-members-title"
          >
            <header>
              <div>
                <span className="workflow-eyebrow">
                  Stage {draft.stages.indexOf(selectedStage) + 1}
                </span>
                <h2 id="stage-members-title">{selectedStage.name}</h2>
              </div>
              <span>{selectedStageMembers.length} members</span>
            </header>
            <div className="workflow-stage-member-list">
              {selectedStageMembers.length > 0 ? (
                selectedStageMembers.map((member) => (
                  <button
                    className={`workflow-member-row${props.selectedEnrollmentId === member.enrollment_id ? " is-selected" : ""}`}
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
                <p className="workflow-stage-empty">
                  No members in this stage.
                </p>
              )}
            </div>
          </section>

          {props.selectedEnrollmentId ? (
            props.selectedEnrollment ? (
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
            )
          ) : (
            <aside
              className="workflow-stage-editor"
              aria-label={`${selectedStage.name} stage settings`}
            >
              <header className="workflow-stage-editor-header">
                <div>
                  <span className="workflow-eyebrow">Stage setup</span>
                  <h2>{selectedStage.name}</h2>
                </div>
                {isPathEditing ? (
                  <div className="workflow-stage-order-actions">
                    <button
                      className="workflow-icon-button"
                      type="button"
                      disabled={draft.stages.indexOf(selectedStage) === 0}
                      onClick={() => moveSelectedStage(-1)}
                      aria-label={`Move ${selectedStage.name} earlier`}
                    >
                      <ChevronLeft size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="workflow-icon-button"
                      type="button"
                      disabled={
                        draft.stages.indexOf(selectedStage) ===
                        draft.stages.length - 1
                      }
                      onClick={() => moveSelectedStage(1)}
                      aria-label={`Move ${selectedStage.name} later`}
                    >
                      <ChevronRight size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="workflow-icon-button workflow-destructive-icon"
                      type="button"
                      disabled={
                        draft.stages.length <=
                          COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES ||
                        selectedStageHasMembers
                      }
                      onClick={deleteSelectedStage}
                      aria-label={`Delete ${selectedStage.name}`}
                      title={
                        selectedStageHasMembers
                          ? "Move members before deleting this stage"
                          : "Delete stage"
                      }
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </header>

              {isPathEditing ? (
                <div className="workflow-stage-editor-fields">
                  <label>
                    <span>Stage name</span>
                    <input
                      value={selectedStage.name}
                      onChange={(event) =>
                        updateSelectedStage("name", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Objective</span>
                    <textarea
                      rows={4}
                      value={selectedStage.objective}
                      onChange={(event) =>
                        updateSelectedStage("objective", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Complete when</span>
                    <textarea
                      rows={4}
                      value={selectedStage.completionDefinition}
                      onChange={(event) =>
                        updateSelectedStage(
                          "completionDefinition",
                          event.target.value,
                        )
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className="workflow-stage-definition">
                  <section>
                    <h3>Objective</h3>
                    <p>{selectedStage.objective}</p>
                  </section>
                  <section>
                    <h3>Complete when</h3>
                    <p>{selectedStage.completionDefinition}</p>
                  </section>
                </div>
              )}
            </aside>
          )}
        </div>

        {props.board?.truncated_stage_keys.length ? (
          <p className="workflow-board-footnote">
            Some stages contain more members than this first view shows.
          </p>
        ) : null}
        {localError || props.actionError ? (
          <p className="workflow-error" role="alert">
            {localError ?? props.actionError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
