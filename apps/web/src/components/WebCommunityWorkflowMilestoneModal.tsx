import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";

import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE,
  COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH,
  type CommunityMemberWorkflowAction,
  type CommunityMemberWorkflowAutomation,
  type CommunityMemberWorkflowMilestone,
} from "../../../../shared/communityMemberWorkflow";

type Props = {
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

function newAutomation(): CommunityMemberWorkflowAutomation {
  return {
    key: draftKey("rule"),
    trigger: { type: "member_contributed" },
    action: { key: draftKey("action"), type: "prompt_agent", prompt: "" },
  };
}

function replaceAction(automation: CommunityMemberWorkflowAutomation, type: CommunityMemberWorkflowAction["type"]): CommunityMemberWorkflowAutomation {
  return {
    ...automation,
    action: type === "prompt_agent"
      ? { key: automation.action.key, type, prompt: "" }
      : { key: automation.action.key, type, destination: "next_or_complete" },
  };
}

export function WebCommunityWorkflowMilestoneModal(props: Props) {
  const [name, setName] = useState("");
  const [automations, setAutomations] = useState<CommunityMemberWorkflowAutomation[]>([]);
  const dialogRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!props.isOpen || !props.milestone) return;
    setName(props.milestone.name);
    setAutomations(props.milestone.automations);
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
  const canSave = name.trim().length > 0 && automations.every(
    (automation) => automation.action.type !== "prompt_agent" || automation.action.prompt.trim().length > 0,
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || props.isSaving) return;
    void props.onSave({
      key: props.milestone!.key,
      name,
      automations: automations.map((automation) => ({
        ...automation,
        key: automation.key.startsWith("draft-") ? "" : automation.key,
        action: {
          ...automation.action,
          key: automation.action.key.startsWith("draft-") ? "" : automation.action.key,
        },
      })) as CommunityMemberWorkflowAutomation[],
    });
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape" && !props.isSaving) {
      event.preventDefault();
      props.onClose();
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
    <div className="modal-overlay workflow-milestone-modal-overlay" onMouseDown={props.isSaving ? undefined : props.onClose}>
      <form ref={dialogRef} className="modal resource-modal workflow-milestone-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-milestone-modal-title" onSubmit={submit} onKeyDown={trapFocus} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" id="workflow-milestone-modal-title">
            {props.milestone.name.trim() ? props.milestone.name : `Set up milestone ${props.milestoneNumber}`}
          </div>
          <button className="modal-close" type="button" onClick={props.onClose} disabled={props.isSaving} aria-label="Close milestone editor"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="modal-body">
          <div className="workflow-milestone-form">
            <label>
              <span>Milestone name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Activated" disabled={props.isSaving} />
            </label>

            {props.milestone.key ? (
              <section className="workflow-milestone-automations" aria-labelledby="milestone-automations-title">
                <div className="workflow-milestone-automations-header">
                  <div><span id="milestone-automations-title">Automations</span><small>When a member contributes, do one thing.</small></div>
                  <button type="button" className="secondary" onClick={() => setAutomations((current) => [...current, newAutomation()])} disabled={props.isSaving || automations.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE}>
                    <Plus size={14} aria-hidden="true" /> Add automation
                  </button>
                </div>

                {automations.length === 0 ? (
                  <p className="workflow-milestone-automations-empty">Nothing happens automatically in this milestone.</p>
                ) : (
                  <div className="workflow-milestone-automation-list">
                    {automations.map((automation, index) => (
                      <div className="workflow-milestone-automation-row" key={automation.key}>
                        <div className="workflow-milestone-automation-fields">
                          <label><span>When</span><select value="member_contributed" disabled><option value="member_contributed">Member contributes</option></select></label>
                          <label>
                            <span>Then</span>
                            <select value={automation.action.type} disabled={props.isSaving} onChange={(event) => setAutomations((current) => current.map((item, itemIndex) => itemIndex === index ? replaceAction(item, event.target.value as CommunityMemberWorkflowAction["type"]) : item))}>
                              <option value="prompt_agent">Prompt community agent</option>
                              <option value="move_member">Move to next milestone</option>
                            </select>
                          </label>
                          {automation.action.type === "prompt_agent" ? (
                            <label>
                              <span>Prompt</span>
                              <textarea rows={4} maxLength={COMMUNITY_MEMBER_WORKFLOW_PROMPT_MAX_LENGTH} value={automation.action.prompt} disabled={props.isSaving} placeholder="Help this member take the next useful step." onChange={(event) => setAutomations((current) => current.map((item, itemIndex) => itemIndex === index && item.action.type === "prompt_agent" ? { ...item, action: { ...item.action, prompt: event.target.value } } : item))} />
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

            {props.error ? <p className="workflow-error" role="alert">{props.error}</p> : null}
          </div>
        </div>

        <div className="modal-footer">
          <div className="workflow-milestone-modal-actions">
            <button className="secondary danger workflow-milestone-delete-button" type="button" onClick={() => void props.onDelete()} disabled={!props.canDelete || props.isSaving} title={props.deleteDisabledReason ?? "Delete milestone"}><Trash2 size={15} aria-hidden="true" /> Delete</button>
            <div>
              <button className="secondary" type="button" onClick={props.onClose} disabled={props.isSaving}>Cancel</button>
              <button className="platform-save-button" type="submit" disabled={!canSave || props.isSaving}>{props.isSaving ? "Saving…" : "Save milestone"}</button>
            </div>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
