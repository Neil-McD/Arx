import { workflowSequenceIssue } from "../../../../shared/communityMemberWorkflow";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useCommunityThemeScope } from "./useCommunityThemeScope";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { WebCommunityWorkflowAutomationEditor, type WorkflowCatalog } from "./WebCommunityWorkflowAutomationEditor";
import { WebPlatformTabList, platformTabId, platformTabPanelId } from "./WebPlatformChoiceControls";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import {
  isWorkflowMilestoneDraftDirty,
  toWorkflowAutomationDraft,
  workflowDraftAutomations,
  workflowAutomationIssue,
  type WorkflowAutomationDraft,
} from "./workflowMilestoneDraft";

import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE,
  COMMUNITY_MEMBER_WORKFLOW_STAGE_COLORS,
  type CommunityMemberWorkflowStageColor,
  type CommunityMemberWorkflowAutomation,
  type CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";

type Props = {
  catalog?: WorkflowCatalog;
  formsStatus?: "loading" | "ready" | "error";
  onRetryForms?: () => void;
  forms?: Array<{ key: string; name: string }>;
  channels: CloudCommunityChannel[];
  channelsUnavailable: boolean;
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
  /** Where the editor opens: a step's sentence opens that step, "Add a step" opens a new one. */
  openTo?: { automationKey?: string; addStep?: boolean } | null;
};

function draftKey(prefix: string): string {
  return `draft-${prefix}-${crypto.randomUUID()}`;
}

function newAutomation(): WorkflowAutomationDraft {
  return toWorkflowAutomationDraft({
    key: draftKey("rule"),
    trigger: { type: "member_contributed" },
    action: { key: draftKey("action"), type: "prompt_agent", prompt: "" },
  });
}

export function WebCommunityWorkflowMilestoneModal(props: Props) {
  const themeScope = useCommunityThemeScope();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [goal, setGoal] = useState("");
  const [fullyAuto, setFullyAuto] = useState(true);
  const [color, setColor] = useState<CommunityMemberWorkflowStageColor | undefined>(undefined);
  const [automations, setAutomations] = useState<WorkflowAutomationDraft[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [expandedAutomationKey, setExpandedAutomationKey] = useState<string | null>(null);
  const [view, setView] = useState<"overview" | "automations">("overview");
  const [pendingAutomation, setPendingAutomation] = useState<WorkflowAutomationDraft | null>(null);
  const [selection, setSelection] = useState({ triggerSelected: false, actionSelected: false });
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const pageStartRef = useRef<HTMLButtonElement | null>(null);
  const addAutomationRef = useRef<HTMLButtonElement | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement | null>(null);
  const closeOriginRef = useRef<HTMLElement | null>(null);
  const editingSnapshot = useRef<CommunityMemberWorkflowMilestone | null>(null);

  useEffect(() => {
    if (!props.isOpen || !props.milestone) {
      editingSnapshot.current = null;
      return;
    }
    // Live member activity replaces board objects; it must not erase a draft.
    if (editingSnapshot.current?.key === props.milestone.key) return;
    editingSnapshot.current = props.milestone;
    setConfirmDiscard(false);
    const openTo = props.openTo ?? null;
    const opensStep = !!openTo?.automationKey && props.milestone.automations.some((automation) => automation.key === openTo.automationKey);
    setExpandedAutomationKey(opensStep ? openTo!.automationKey! : null);
    setView(opensStep || openTo?.addStep ? "automations" : "overview");
    setPendingAutomation(openTo?.addStep && props.milestone.key ? newAutomation() : null);
    setSelection({ triggerSelected: false, actionSelected: false });
    setName(props.milestone.name);
    setInstructions(props.milestone.instructions ?? "");
    setGoal(props.milestone.goal ?? "");
    setFullyAuto(!(props.milestone.requireHumanApproval ?? false));
    setColor(props.milestone.color);
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
    if (pendingAutomation || expandedAutomationKey) pageStartRef.current?.focus();
  }, [pendingAutomation?.key, expandedAutomationKey]);

  if (!props.isOpen || !props.milestone) return themeScope.marker;
  const hasConflict = editingSnapshot.current !== null
    && JSON.stringify(editingSnapshot.current) !== JSON.stringify(props.milestone);
  const isDirty = !!pendingAutomation || isWorkflowMilestoneDraftDirty(editingSnapshot.current, name, automations, instructions, goal, !fullyAuto, color);
  const editingAutomation = !!pendingAutomation || !!expandedAutomationKey;
  const joinLanes = automations.filter(a => a.trigger.type === "member_joined").map(a => a.action.type === "request_form" ? `form:${a.action.formKey}` : a.action.type);
  const duplicateJoinAction = new Set(joinLanes).size !== joinLanes.length;
  const formActions = automations.filter(a => a.trigger.type === "form_submitted");
  const duplicateFormAction = new Set(formActions.map(a => a.trigger.type === "form_submitted" ? `${a.action.type}:${a.trigger.formKey}` : "")).size !== formActions.length;
  const sequenceIssue = workflowSequenceIssue(automations);
  const canSave = name.trim().length > 0
    && !sequenceIssue
    && !pendingAutomation
    && isDirty
    && !hasConflict
    && automations.every((automation) => !workflowAutomationIssue(automation, props.channels, props.channelsUnavailable))
    && !duplicateFormAction && !duplicateJoinAction
    && automations.every(
      (automation) => automation.action.type !== "prompt_agent" || automation.action.prompt.trim().length > 0,
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || props.isSaving || confirmDiscard || editingAutomation) return;
    void props.onSave({
      key: props.milestone!.key,
      name,
      instructions,
      goal,
      requireHumanApproval: !fullyAuto,
      ...(color ? { color } : {}),
      automations: workflowDraftAutomations(automations).map((automation) => ({
        ...automation,
        key: automation.key.startsWith("draft-") ? "" : automation.key,
        action: {
          ...automation.action,
          key: automation.action.key,
        },
      })) as CommunityMemberWorkflowAutomation[],
    });
  };

  const canAddPending = !!pendingAutomation && selection.actionSelected
    && !workflowAutomationIssue(pendingAutomation, props.channels, props.channelsUnavailable);

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

  return <>{themeScope.marker}{createPortal(themeScope.scope(
    <div className="modal-overlay workflow-milestone-modal-overlay" onMouseDown={requestClose}>
      <form ref={dialogRef} className="modal resource-modal workflow-milestone-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-milestone-modal-title" onSubmit={submit} onKeyDown={trapFocus} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" id="workflow-milestone-modal-title">
            {props.milestone.name.trim() ? props.milestone.name : "New stage"}
          </div>
          <button className="modal-close" type="button" onClick={requestClose} disabled={props.isSaving} aria-label="Close stage editor"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="modal-body">
            {editingAutomation ? <button ref={pageStartRef} type="button" className="workflow-editor-back" disabled={props.isSaving} onClick={() => {
              setPendingAutomation(null);
              setExpandedAutomationKey(null);
              queueMicrotask(() => addAutomationRef.current?.focus());
            }}>← Automations</button> : <WebPlatformTabList
              tabs={[{ id: "overview", label: "Overview", disabled: props.isSaving }, { id: "automations", label: "Automations", disabled: props.isSaving }]}
              activeTab={view} onSelectTab={next => setView(next as "overview" | "automations")}
              ariaLabel="Stage settings" idPrefix="milestone-settings"
              className="platform-switcher platform-switcher-compact"
              style={buildPlatformSwitcherStyle(2, view === "overview" ? 0 : 1)} />}
          <div className="resource-form workflow-milestone-form">
            <div className="workflow-editor-page" role={editingAutomation ? undefined : "tabpanel"}
              id={platformTabPanelId("milestone-settings", view)} aria-labelledby={editingAutomation ? undefined : platformTabId("milestone-settings", view)}>
            {view === "overview" ? <>
            <label>
              <span className="resource-field-label" id="workflow-name-label">Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Stage name" disabled={props.isSaving} aria-labelledby="workflow-name-label" />
            </label>
            <div className="workflow-stage-colors" role="radiogroup" aria-labelledby="workflow-color-label">
              <span className="resource-field-label" id="workflow-color-label">Colour</span>
              <div>
                <button type="button" role="radio" aria-checked={!color} aria-label="No colour" title="No colour"
                  className="workflow-stage-swatch is-none" disabled={props.isSaving} onClick={() => setColor(undefined)} />
                {COMMUNITY_MEMBER_WORKFLOW_STAGE_COLORS.map((option) => <button key={option} type="button" role="radio" aria-checked={color === option}
                  aria-label={option[0].toUpperCase() + option.slice(1)} title={option[0].toUpperCase() + option.slice(1)}
                  className={`workflow-stage-swatch pn-stage-color-${option}`} disabled={props.isSaving} onClick={() => setColor(option)} />)}
              </div>
              <small className="workflow-field-hint">Shows on the stage and its automations, so you can tell stages apart at a glance.</small>
            </div>

            <label><span className="resource-field-label">Instructions</span>
              <textarea rows={2} maxLength={4000} value={instructions} disabled={props.isSaving} onChange={event => setInstructions(event.target.value)} placeholder="How should the agent help members in this stage?" />
            </label>
            <label><span className="resource-field-label">Goal</span>
              <textarea rows={2} maxLength={4000} value={goal} disabled={props.isSaving} onChange={event => setGoal(event.target.value)} placeholder="What does success look like for the member?" />
              <small className="workflow-field-hint">{goal.trim()
                ? fullyAuto
                  ? "After all actions finish, the agent checks this goal against verified results. If it is not met, the member stays here; the agent does not start more work."
                  : "After all actions finish, the agent reviews this goal to inform the owner's decision."
                : "Optional. Add a goal when advancement needs an agent assessment."}</small>
            </label>
            <button type="button" role="switch" aria-checked={fullyAuto} aria-describedby="workflow-fully-auto-hint"
              className={`workflow-fully-auto-toggle${fullyAuto ? " is-on" : ""}`}
              disabled={props.isSaving} onClick={() => setFullyAuto((current) => !current)}>
              <span>Fully Auto</span>
              <span className="workflow-fully-auto-state" aria-hidden="true">{fullyAuto ? "On" : "Off"}</span>
              <span className="workflow-fully-auto-track" aria-hidden="true"><span className="workflow-fully-auto-thumb" /></span>
            </button>
            <p id="workflow-fully-auto-hint" className="workflow-field-hint">{automations.length === 0
              ? fullyAuto
                ? "No actions configured. This stage will not advance automatically until you add an action."
                : "No actions configured. An owner or admin can approve this stage manually."
              : fullyAuto
                ? "Automatically advances after every action is verified complete and any written goal is met. Fully Auto does not start follow-up work."
                : "An owner or admin approves advancement after the actions finish; the goal review is advisory."}</p>
            {editingSnapshot.current?.key && fullyAuto !== !(editingSnapshot.current.requireHumanApproval ?? false)
              ? <p className="workflow-field-hint">Changing this setting will not recheck or move members whose actions were already complete.</p>
              : null}
            {!props.milestone.key ? <p className="workflow-field-hint">Save this stage to configure actions.</p> : null}
            </> : <>
            {props.formsStatus === "loading" ? <p role="status">Loading published forms…</p> : props.formsStatus === "error" ? <p role="alert">Could not load published forms. <button type="button" className="workflow-secondary-button" onClick={props.onRetryForms}>Retry forms</button></p> : null}
            {!props.milestone.key ? <p className="workflow-field-hint">Save this stage first, then add automations.</p> : null}
            {sequenceIssue ? <p role="alert">{sequenceIssue}</p> : null}
            {pendingAutomation ? <>
              <WebCommunityWorkflowAutomationEditor automation={pendingAutomation} index={automations.length}
                earlierSteps={automations} canAddJoin={props.milestoneNumber === 1} catalog={props.catalog} forms={props.forms} expanded hideHeading
                channels={props.channels} channelsUnavailable={props.channelsUnavailable} disabled={props.isSaving}
                onToggle={() => {}} onRemove={() => setPendingAutomation(null)} onChange={setPendingAutomation}
                creation={{ ...selection,
                  onTriggerSelected: () => setSelection({ triggerSelected: true, actionSelected: false }),
                  onActionSelected: () => setSelection(current => ({ ...current, actionSelected: true })),
                }} />
            </> : <>
            {props.milestone.key ? <section className="workflow-milestone-automations" aria-label="Automations">
                {!editingAutomation ? <div className="workflow-milestone-automations-header">
                  <div><span id="milestone-automations-title">Automations</span><small>Actions run when their trigger occurs; dependent actions wait for the preceding action to complete.</small></div>
                  <div className="resource-modal-actions">
                    <button ref={addAutomationRef} type="button" className="secondary" aria-label="Add automation" onClick={() => {
                      setPendingAutomation(newAutomation());
                      setSelection({ triggerSelected: false, actionSelected: false });
                    }} disabled={props.isSaving || automations.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE}>
                      <Plus size={16} aria-hidden="true" /> Add new
                    </button>
                  </div>
                </div> : null}

                {automations.length === 0 ? (
                  <p className="workflow-milestone-automations-empty">No automatic actions.</p>
                ) : (
                  <div className="workflow-milestone-automation-list">
                    {automations.filter(a => !expandedAutomationKey || a.key === expandedAutomationKey).map((automation, index) => (
                      <WebCommunityWorkflowAutomationEditor key={automation.key} automation={automation} index={index}
                        earlierSteps={automations.slice(0, automations.indexOf(automation))}
                        canAddJoin={props.milestoneNumber === 1} catalog={props.catalog}
                        forms={props.forms}
                        hideHeading={editingAutomation}
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
              </section>
            : null}
            </>}
            </>}
            </div>

            {/* Our own write can arrive through realtime before the save promise settles.
                Keep the conflict guard, but wait for the save outcome before warning. */}
            {hasConflict && !props.isSaving ? <p className="workflow-error" role="alert">This stage changed while you were editing. Your draft has not been saved. Close and reopen it to load the latest version.</p> : null}
            {duplicateJoinAction ? <p className="workflow-error" role="alert">Use one channel action and one request per selected form when a member joins.</p> : null}
            {duplicateFormAction ? <p className="workflow-error" role="alert">Use one agent action per submitted form.</p> : null}
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
          ) : pendingAutomation ? (
            <div className="resource-modal-actions workflow-milestone-modal-actions">
              <button type="button" className="secondary" disabled={props.isSaving} onClick={() => setPendingAutomation(null)}>Cancel addition</button>
              <button type="button" className="platform-save-button" disabled={props.isSaving || !canAddPending}
                onClick={() => {
                  setAutomations(current => [...current, pendingAutomation]);
                  setPendingAutomation(null);
                  queueMicrotask(() => addAutomationRef.current?.focus());
                }}>Add automation</button>
            </div>
          ) : editingAutomation ? (
            <div className="resource-modal-actions workflow-milestone-modal-actions">
              <div>
              <button type="button" className="platform-save-button" disabled={props.isSaving} onClick={() => {
                setExpandedAutomationKey(null);
                queueMicrotask(() => addAutomationRef.current?.focus());
              }}>Done</button>
              </div>
            </div>
          ) : (
            <div className="resource-modal-actions workflow-milestone-modal-actions">
              {props.canDelete ? <button className="secondary danger workflow-milestone-delete-button" type="button" onClick={() => void props.onDelete()} disabled={props.isSaving} title={props.deleteDisabledReason ?? "Delete stage"}><Trash2 size={15} aria-hidden="true" /> Delete</button> : null}
              <div>
                <button className="secondary" type="button" onClick={requestClose} disabled={props.isSaving}>Cancel</button>
                <button className="platform-save-button" type="submit" disabled={!canSave || props.isSaving}>{props.isSaving ? "Saving…" : "Save stage"}</button>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>,
    ), document.body)}</>;
}
