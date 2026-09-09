import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { WebCommunityWorkflowAutomationEditor } from "./WebCommunityWorkflowAutomationEditor";
import {
  isWorkflowMilestoneDraftDirty,
  hasAssessmentMovementOverlap,
  toWorkflowAutomationDraft,
  workflowDraftAutomations,
  workflowAutomationIssue,
  workflowMoveLabel,
  type WorkflowAutomationDraft,
} from "./workflowMilestoneDraft";

import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE,
  workflowTriggerIdentity,
  type CommunityMemberWorkflowAutomation,
  type CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";

type Props = {
  formsStatus?: "loading" | "ready" | "error";
  onRetryForms?: () => void;
  forms?: Array<{ key: string; name: string }>;
  channels: CloudCommunityChannel[];
  channelsUnavailable: boolean;
  isOpen: boolean;
  milestone: CommunityMemberWorkflowMilestone | null;
  milestoneNumber: number;
  nextMilestoneName: string | null;
  isSaving: boolean;
  canDelete: boolean;
  deleteDisabledReason: string | null;
  error: string | null;
  onClose: () => void;
  onSave: (milestone: CommunityMemberWorkflowMilestone) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
};

function draftKey(prefix: string): string {
  return `draft-${prefix}-${crypto.randomUUID()}`;
}

function newAutomation(requirement = false): WorkflowAutomationDraft {
  return toWorkflowAutomationDraft({
    key: draftKey("rule"),
    trigger: { type: "member_contributed" },
    action: requirement ? { key: draftKey("action"), type: "move_member", destination: "next_or_complete" }
      : { key: draftKey("action"), type: "prompt_agent", prompt: "" },
  });
}

export function WebCommunityWorkflowMilestoneModal(props: Props) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [goal, setGoal] = useState("");
  const [automations, setAutomations] = useState<WorkflowAutomationDraft[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [expandedAutomationKey, setExpandedAutomationKey] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const addAutomationRef = useRef<HTMLButtonElement | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement | null>(null);
  const closeOriginRef = useRef<HTMLElement | null>(null);
  const focusNewRuleRef = useRef<string | null>(null);
  const editingSnapshot = useRef<CommunityMemberWorkflowMilestone | null>(null);

  useEffect(() => {
    if (!props.isOpen || !props.milestone) {
      editingSnapshot.current = null;
      return;
    }
    // Live member activity replaces board objects; it must not erase a draft.
    if (editingSnapshot.current?.key === props.milestone.key) return;
    editingSnapshot.current = props.milestone;
    focusNewRuleRef.current = null;
    setConfirmDiscard(false);
    setExpandedAutomationKey(null);
    setName(props.milestone.name);
    setInstructions(props.milestone.instructions ?? "");
    setGoal(props.milestone.goal ?? "");
    setAutomations(props.milestone.automations.map(toWorkflowAutomationDraft));
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

  useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus();
  }, [confirmDiscard]);

  useEffect(() => {
    const key = focusNewRuleRef.current;
    if (!key) return;
    const row = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("[data-automation-key]") ?? [])
      .find((element) => element.dataset.automationKey === key);
    if (!row) return;
    focusNewRuleRef.current = null;
    row.scrollIntoView({ block: "nearest" });
    row.querySelector<HTMLButtonElement>("[data-workflow-rule-start]")?.focus({ preventScroll: true });
  }, [automations, expandedAutomationKey]);

  if (!props.isOpen || !props.milestone) return null;
  const hasConflict = editingSnapshot.current !== null
    && JSON.stringify(editingSnapshot.current) !== JSON.stringify(props.milestone);
  const isDirty = isWorkflowMilestoneDraftDirty(editingSnapshot.current, name, automations, instructions, goal);
  const requirements = automations.filter(automation => automation.action.type === "move_member");
  const duplicateRequirement = new Set(requirements.map(a => workflowTriggerIdentity(a.trigger))).size !== requirements.length;
  const joinLanes = automations.filter(a => a.trigger.type === "member_joined").map(a => a.action.type === "request_form" ? `form:${a.action.formKey}` : a.action.type);
  const duplicateJoinAction = new Set(joinLanes).size !== joinLanes.length;
  const formActions = automations.filter(a => a.trigger.type === "form_submitted" && a.action.type !== "move_member");
  const duplicateFormAction = new Set(formActions.map(a => a.trigger.type === "form_submitted" ? `${a.action.type}:${a.trigger.formKey}` : "")).size !== formActions.length;
  const canSave = name.trim().length > 0
    && (!automations.some(a => a.action.type === "evaluate_goal") || !!goal.trim())
    && isDirty
    && !hasConflict
    && automations.every((automation) => !workflowAutomationIssue(automation, props.channels, props.channelsUnavailable))
    && !duplicateRequirement && !duplicateFormAction && !duplicateJoinAction
    && automations.every(
      (automation) => automation.action.type !== "prompt_agent" || automation.action.prompt.trim().length > 0,
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || props.isSaving || confirmDiscard) return;
    void props.onSave({
      key: props.milestone!.key,
      name,
      instructions,
      goal,
      automations: workflowDraftAutomations(automations).map((automation) => ({
        ...automation,
        key: automation.key.startsWith("draft-") ? "" : automation.key,
        action: {
          ...automation.action,
          key: automation.action.key.startsWith("draft-") ? "" : automation.action.key,
        },
      })) as CommunityMemberWorkflowAutomation[],
    });
  };

  const keepEditing = () => {
    setConfirmDiscard(false);
    queueMicrotask(() => {
      const origin = closeOriginRef.current;
      if (origin?.isConnected) origin.focus();
      else dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
  };

  const requestClose = () => {
    if (props.isSaving) return;
    if (!isDirty) {
      props.onClose();
      return;
    }
    if (confirmDiscard) return;
    closeOriginRef.current = document.activeElement as HTMLElement | null;
    setConfirmDiscard(true);
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && !props.isSaving) {
      event.preventDefault();
      if (confirmDiscard) keepEditing();
      else requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
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

  return createPortal(
    <div className="modal-overlay workflow-milestone-modal-overlay" onMouseDown={requestClose}>
      <form ref={dialogRef} className="modal resource-modal workflow-milestone-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-milestone-modal-title" onSubmit={submit} onKeyDown={trapFocus} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" id="workflow-milestone-modal-title">
            {props.milestone.name.trim() ? props.milestone.name : "New milestone"}
          </div>
          <button className="modal-close" type="button" onClick={requestClose} disabled={props.isSaving} aria-label="Close milestone editor"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="modal-body">
          <div className="resource-form workflow-milestone-form">
            <label>
              <span className="resource-field-label" id="workflow-name-label">Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Milestone name" disabled={props.isSaving} aria-labelledby="workflow-name-label" />
            </label>

            {props.formsStatus === "loading" ? <p role="status">Loading published forms…</p> : props.formsStatus === "error" ? <p role="alert">Could not load published forms. <button type="button" className="workflow-secondary-button" onClick={props.onRetryForms}>Retry forms</button></p> : null}
            <label><span className="resource-field-label">Instructions</span>
              <textarea rows={2} maxLength={4000} value={instructions} disabled={props.isSaving} onChange={event => setInstructions(event.target.value)} placeholder="How should the agent help members in this milestone?" />
            </label>
            <label><span className="resource-field-label">Goal</span>
              <textarea rows={2} maxLength={4000} value={goal} disabled={props.isSaving} onChange={event => setGoal(event.target.value)} placeholder="What does success look like for the member?" />
              <small className="workflow-field-hint">Guides the agent; evaluation alone does not move members.</small>
            </label>
            {!props.milestone.key ? <p className="workflow-field-hint">Save this milestone to configure actions and movement.</p> : null}
            {hasAssessmentMovementOverlap(automations) ? <p role="status" className="workflow-field-hint">The same form is used for goal evaluation and movement. If its submission completes all movement conditions, the member advances and the evaluation may be cancelled.</p> : null}
            {props.milestone.key ? [false, true].map(requirement => (
              <section key={String(requirement)} className="workflow-milestone-automations" aria-labelledby={requirement ? "milestone-requirements-title" : "milestone-automations-title"}>
                <div className="workflow-milestone-automations-header">
                  <div><span id={requirement ? "milestone-requirements-title" : "milestone-automations-title"}>{requirement ? "Move on when" : "Actions"}</span><small>{requirement ? "All conditions must be met, in any order." : "Each action runs when its trigger is met."}</small></div>
                  <div className="resource-modal-actions">
                    <button ref={addAutomationRef} type="button" className="secondary" onClick={() => {
                      const automation = newAutomation(requirement);
                      focusNewRuleRef.current = automation.key;
                      setExpandedAutomationKey(automation.key);
                      setAutomations((current) => [...current, automation]);
                    }} disabled={props.isSaving || automations.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE}>
                      <Plus size={16} aria-hidden="true" /> {requirement ? "Add condition" : "Add action"}
                    </button>
                  </div>
                </div>

                {automations.filter(a => (a.action.type === "move_member") === requirement).length === 0 ? (
                  <p className="workflow-milestone-automations-empty">{requirement ? "No automatic movement until you add a condition." : "No automatic actions."}</p>
                ) : (
                  <div className="workflow-milestone-automation-list">
                    {automations.filter(a => (a.action.type === "move_member") === requirement).map((automation, index) => (
                      <WebCommunityWorkflowAutomationEditor key={automation.key} automation={automation} index={index}
                        canAddJoin={props.milestoneNumber === 1}
                        forms={props.forms}
                        expanded={expandedAutomationKey === automation.key} channels={props.channels} channelsUnavailable={props.channelsUnavailable}
                        disabled={props.isSaving}
                        onToggle={() => setExpandedAutomationKey((key) => key === automation.key ? null : automation.key)}
                        onChange={(updated) => setAutomations((current) => current.map((item) => item.key === automation.key ? updated : item))}
                        onRemove={() => {
                          setAutomations((current) => current.filter((item) => item.key !== automation.key));
                          if (expandedAutomationKey === automation.key) setExpandedAutomationKey(null);
                          queueMicrotask(() => addAutomationRef.current?.focus());
                        }} />
                    ))}
                  </div>
                )}
                {requirement && requirements.length > 0 ? <p className="workflow-field-hint">{workflowMoveLabel(props.nextMilestoneName)}. Does not wait for agent actions to finish.</p> : null}
              </section>
            )) : null}

            {/* Our own write can arrive through realtime before the save promise settles.
                Keep the conflict guard, but wait for the save outcome before warning. */}
            {hasConflict && !props.isSaving ? <p className="workflow-error" role="alert">This milestone changed while you were editing. Your draft has not been saved. Close and reopen it to load the latest version.</p> : null}
            {duplicateRequirement ? <p className="workflow-error" role="alert">Each condition must be different.</p> : null}
            {duplicateJoinAction ? <p className="workflow-error" role="alert">Use one channel action and one request per selected form when a member joins.</p> : null}
            {duplicateFormAction ? <p className="workflow-error" role="alert">Use one agent action per submitted form. The same form can also be a completion condition.</p> : null}
            {props.channelsUnavailable ? <p role="status">Channel choices are unavailable while loading or reconnecting.</p> : null}
            {props.error ? <p className="workflow-error" role="alert">{props.error}</p> : null}
          </div>
        </div>

        <div className="modal-footer">
          {confirmDiscard ? (
            <div className="workflow-milestone-discard">
              <p role="alert">Discard unsaved changes?</p>
              <div className="resource-modal-actions workflow-milestone-modal-actions">
                <button ref={keepEditingRef} className="secondary" type="button" onClick={keepEditing}>Keep editing</button>
                <button className="secondary danger" type="button" onClick={props.onClose}>Discard changes</button>
              </div>
            </div>
          ) : (
            <div className="resource-modal-actions workflow-milestone-modal-actions">
              {props.canDelete ? <button className="secondary danger workflow-milestone-delete-button" type="button" onClick={() => void props.onDelete()} disabled={props.isSaving} title={props.deleteDisabledReason ?? "Delete milestone"}><Trash2 size={15} aria-hidden="true" /> Delete</button> : null}
              <div>
                <button className="secondary" type="button" onClick={requestClose} disabled={props.isSaving}>Cancel</button>
                <button className="platform-save-button" type="submit" disabled={!canSave || props.isSaving}>{props.isSaving ? "Saving…" : "Save milestone"}</button>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
