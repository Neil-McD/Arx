import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import {
  isWorkflowMilestoneDraftDirty,
  replaceWorkflowDraftAction,
  toWorkflowAutomationDraft,
  workflowDraftAutomations,
  type WorkflowAutomationDraft,
} from "./workflowMilestoneDraft";

import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE,
  COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH,
  type CommunityMemberWorkflowAction,
  type CommunityMemberWorkflowAutomation,
  type CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";

type Props = {
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
  const [name, setName] = useState("");
  const [automations, setAutomations] = useState<WorkflowAutomationDraft[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dialogRef = useRef<HTMLFormElement | null>(null);
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
    setName(props.milestone.name);
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
    row.querySelector<HTMLSelectElement>("select")?.focus({ preventScroll: true });
  }, [automations]);

  if (!props.isOpen || !props.milestone) return null;
  const hasConflict = editingSnapshot.current !== null
    && JSON.stringify(editingSnapshot.current) !== JSON.stringify(props.milestone);
  const isDirty = isWorkflowMilestoneDraftDirty(editingSnapshot.current, name, automations);
  const moveAutomationCount = automations.filter(
    (automation) => automation.action.type === "move_member",
  ).length;
  const canSave = name.trim().length > 0
    && isDirty
    && !hasConflict
    && automations.every((automation) => automation.trigger.channelId === undefined
      || (!props.channelsUnavailable && props.channels.some((channel) => channel.id === automation.trigger.channelId)))
    && moveAutomationCount <= 1
    && automations.every(
      (automation) => automation.action.type !== "prompt_agent" || automation.action.prompt.trim().length > 0,
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || props.isSaving || confirmDiscard) return;
    void props.onSave({
      key: props.milestone!.key,
      name,
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
      // Native selects own Escape, including when their popup is not exposed
      // in the DOM. Never let that key discard the surrounding editor.
      if (event.target instanceof HTMLSelectElement) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      if (confirmDiscard) keepEditing();
      else requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
            {props.milestone.name.trim() ? props.milestone.name : `Set up milestone ${props.milestoneNumber}`}
          </div>
          <button className="modal-close" type="button" onClick={requestClose} disabled={props.isSaving} aria-label="Close milestone editor"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="modal-body">
          <div className="workflow-milestone-form">
            <label>
              <span id="workflow-name-label">Milestone name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Milestone name" disabled={props.isSaving} aria-labelledby="workflow-name-label" aria-describedby={!name.trim() ? "workflow-name-hint" : undefined} />
              {!name.trim() ? <small id="workflow-name-hint" className="workflow-field-hint">Give this milestone a name to save it.</small> : null}
            </label>

            {props.milestone.key ? (
              <section className="workflow-milestone-automations" aria-labelledby="milestone-automations-title">
                <div className="workflow-milestone-automations-header">
                  <div><span id="milestone-automations-title">Automations</span><small>When a member posts or replies, do one thing.</small></div>
                  <div className="resource-modal-actions">
                    <button type="button" className="secondary" onClick={() => {
                      const automation = newAutomation();
                      focusNewRuleRef.current = automation.key;
                      setAutomations((current) => [...current, automation]);
                    }} disabled={props.isSaving || automations.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE}>
                      <Plus size={16} aria-hidden="true" /> Add automation
                    </button>
                  </div>
                </div>

                {automations.length === 0 ? (
                  <p className="workflow-milestone-automations-empty">Nothing happens automatically in this milestone.</p>
                ) : (
                  <div className="workflow-milestone-automation-list">
                    {automations.map((automation, index) => (
                      <div className="workflow-milestone-automation-row" key={automation.key} data-automation-key={automation.key}>
                        <div className="workflow-milestone-automation-fields">
                          <label>
                            <span>When a member posts or replies in</span>
                            <select aria-label={`Channel for automation ${index + 1}`} value={automation.trigger.channelId ?? ""} disabled={props.isSaving || props.channelsUnavailable} onChange={(event) => {
                              const channelId = event.target.value;
                              setAutomations((current) => current.map((item, itemIndex) => itemIndex === index
                                ? { ...item, trigger: { type: "member_contributed", ...(channelId ? { channelId } : {}) } } : item));
                            }}>
                              <option value="">Any channel</option>
                              {automation.trigger.channelId && !props.channels.some((channel) => channel.id === automation.trigger.channelId) ? (
                                <option value={automation.trigger.channelId} disabled>{props.channelsUnavailable ? "Loading selected channel…" : "Unavailable channel — choose another"}</option>
                              ) : null}
                              {props.channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}{channel.access_mode === "restricted" ? " (private)" : ""}</option>)}
                            </select>
                          </label>
                          {automation.action.type === "prompt_agent" && props.channels.some((channel) => channel.id === automation.trigger.channelId && channel.access_mode === "restricted") ? (
                            <small>The community agent must be invited to this private channel. Replies stay in the triggering thread.</small>
                          ) : null}
                          <label>
                            <span>Then</span>
                            <select value={automation.action.type} disabled={props.isSaving} onChange={(event) => setAutomations((current) => current.map((item, itemIndex) => itemIndex === index ? replaceWorkflowDraftAction(item, event.target.value as CommunityMemberWorkflowAction["type"]) : item))}>
                              <option value="prompt_agent">Prompt community agent</option>
                              <option
                                value="move_member"
                                disabled={automations.some(
                                  (item, itemIndex) => itemIndex !== index && item.action.type === "move_member",
                                )}
                              >
                                Move to next milestone
                              </option>
                            </select>
                          </label>
                          {automation.action.type === "prompt_agent" ? (
                            <label>
                              <span id={`workflow-prompt-label-${index}`}>Prompt</span>
                              <textarea rows={4} maxLength={COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH} value={automation.action.prompt} disabled={props.isSaving} aria-labelledby={`workflow-prompt-label-${index}`} aria-describedby={!automation.action.prompt.trim() ? `workflow-prompt-hint-${index}` : undefined} placeholder="Help this member take the next useful step." onChange={(event) => setAutomations((current) => current.map((item, itemIndex) => itemIndex === index && item.action.type === "prompt_agent" ? { ...item, action: { ...item.action, prompt: event.target.value } } : item))} />
                              {!automation.action.prompt.trim() ? <small id={`workflow-prompt-hint-${index}`} className="workflow-field-hint">Add instructions for the agent to save this automation.</small> : null}
                            </label>
                          ) : null}
                        </div>
                        <button type="button" className="workflow-milestone-remove-automation" aria-label={`Remove automation ${index + 1}`} disabled={props.isSaving} onClick={() => setAutomations((current) => current.filter((_item, itemIndex) => itemIndex !== index))}><X size={15} aria-hidden="true" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {hasConflict ? <p className="workflow-error" role="alert">This milestone changed while you were editing. Your draft has not been saved. Close and reopen it to load the latest version.</p> : null}
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
