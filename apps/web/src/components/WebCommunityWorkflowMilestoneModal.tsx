import { Plus, Trash2, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_CHECKS_PER_MILESTONE,
  type CommunityMemberWorkflowCheck,
  type CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";

type WebCommunityWorkflowMilestoneModalProps = {
  isOpen: boolean;
  milestone: CommunityMemberWorkflowMilestone | null;
  milestoneNumber: number;
  isSaving: boolean;
  canDelete: boolean;
  deleteDisabledReason: string | null;
  error: string | null;
  onClose: () => void;
  onSave: (milestone: CommunityMemberWorkflowMilestone) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
};

function temporaryCheckKey(): string {
  return `draft-${crypto.randomUUID()}`;
}

export function WebCommunityWorkflowMilestoneModal(
  props: WebCommunityWorkflowMilestoneModalProps,
) {
  const [name, setName] = useState("");
  const [checks, setChecks] = useState<CommunityMemberWorkflowCheck[]>([]);
  const dialogRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!props.isOpen || !props.milestone) return;
    setName(props.milestone.name);
    setChecks(props.milestone.checks);
  }, [props.isOpen, props.milestone]);

  useEffect(() => {
    if (!props.isOpen) return;
    const priorFocus = document.activeElement as HTMLElement | null;
    const appRoot = document.getElementById("root");
    appRoot?.setAttribute("inert", "");
    queueMicrotask(() => dialogRef.current?.querySelector<HTMLElement>("input")?.focus());
    return () => {
      appRoot?.removeAttribute("inert");
      priorFocus?.focus();
    };
  }, [props.isOpen]);

  if (!props.isOpen || !props.milestone) return null;

  const checksValid = checks.every(
    (check) => check.type === "automatic" || check.criterion.trim().length > 0,
  );
  const canSave = name.trim().length > 0 && checksValid;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || props.isSaving) return;
    void props.onSave({
      key: props.milestone!.key,
      name,
      checks: checks.map((check) => ({
        ...check,
        key: check.key.startsWith("draft-") ? "" : check.key,
      })) as CommunityMemberWorkflowCheck[],
    });
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape" && !props.isSaving) {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const addAutomaticCheck = () => {
    if (checks.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_CHECKS_PER_MILESTONE) return;
    setChecks((current) => [
      ...current,
      {
        key: temporaryCheckKey(),
        type: "automatic",
        signal: "channel_posted",
      },
    ]);
  };

  const addJudgmentCheck = () => {
    if (checks.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_CHECKS_PER_MILESTONE) return;
    setChecks((current) => [
      ...current,
      { key: temporaryCheckKey(), type: "judgment", criterion: "" },
    ]);
  };

  return createPortal(
    <div
      className="modal-overlay workflow-milestone-modal-overlay"
      onMouseDown={props.isSaving ? undefined : props.onClose}
    >
      <form
        ref={dialogRef}
        className="modal resource-modal workflow-milestone-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-milestone-modal-title"
        onSubmit={submit}
        onKeyDown={trapFocus}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title" id="workflow-milestone-modal-title">
            {props.milestone.name.trim()
              ? props.milestone.name
              : `Set up milestone ${props.milestoneNumber}`}
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={props.onClose}
            disabled={props.isSaving}
            aria-label="Close milestone editor"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <div className="workflow-milestone-form">
            <label>
              <span>Milestone name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Launch your offer"
                disabled={props.isSaving}
              />
            </label>

            {props.milestone.key ? (
              <section className="workflow-milestone-checks" aria-labelledby="milestone-checks-title">
                <div className="workflow-milestone-checks-header">
                  <div>
                    <span id="milestone-checks-title">Complete when</span>
                    <small>All checks must pass.</small>
                  </div>
                  <div className="workflow-milestone-add-checks">
                    <button
                      type="button"
                      className="secondary"
                      onClick={addAutomaticCheck}
                      disabled={
                        props.isSaving ||
                        checks.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_CHECKS_PER_MILESTONE
                      }
                    >
                      <Plus size={14} aria-hidden="true" /> Automatic
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={addJudgmentCheck}
                      disabled={
                        props.isSaving ||
                        checks.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_CHECKS_PER_MILESTONE
                      }
                    >
                      <Plus size={14} aria-hidden="true" /> AI judgment
                    </button>
                  </div>
                </div>

                {checks.length === 0 ? (
                  <p className="workflow-milestone-checks-empty">
                    Add a check to make this milestone completable.
                  </p>
                ) : (
                  <div className="workflow-milestone-check-list">
                    {checks.map((check, index) => (
                      <div className="workflow-milestone-check-row" key={check.key}>
                        {check.type === "automatic" ? (
                          <label>
                            <span>Automatic</span>
                            <select
                              value={check.signal}
                              disabled={props.isSaving}
                              onChange={(event) =>
                                setChecks((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index && item.type === "automatic"
                                      ? {
                                          ...item,
                                          signal: event.target.value as "channel_posted" | "channel_replied",
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="channel_posted">Member posted in a channel</option>
                              <option value="channel_replied">Member replied in a channel</option>
                            </select>
                          </label>
                        ) : (
                          <label>
                            <span>AI judgment</span>
                            <textarea
                              value={check.criterion}
                              disabled={props.isSaving}
                              rows={3}
                              maxLength={2_000}
                              placeholder="The member has demonstrated the outcome required to continue."
                              onChange={(event) =>
                                setChecks((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index && item.type === "judgment"
                                      ? { ...item, criterion: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          className="workflow-milestone-remove-check"
                          aria-label={`Remove check ${index + 1}`}
                          disabled={props.isSaving}
                          onClick={() =>
                            setChecks((current) =>
                              current.filter((_item, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {props.error ? <p className="workflow-error" role="alert">{props.error}</p> : null}
          </div>
        </div>

        <div className="modal-footer">
          <div className="workflow-milestone-modal-actions">
            <button
              className="secondary danger workflow-milestone-delete-button"
              type="button"
              onClick={() => void props.onDelete()}
              disabled={!props.canDelete || props.isSaving}
              title={props.deleteDisabledReason ?? "Delete milestone"}
            >
              <Trash2 size={15} aria-hidden="true" /> Delete
            </button>
            <div>
              <button
                className="secondary"
                type="button"
                onClick={props.onClose}
                disabled={props.isSaving}
              >
                Cancel
              </button>
              <button
                className="platform-save-button"
                type="submit"
                disabled={!canSave || props.isSaving}
              >
                {props.isSaving ? "Saving…" : "Save milestone"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
