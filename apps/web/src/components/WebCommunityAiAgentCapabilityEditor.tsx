import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { type CommunityAgentCapabilityEntry } from "../../../../shared/communityAgentCapabilities";

function createDraftCapabilityEntry(prefix: string): CommunityAgentCapabilityEntry {
  return {
    id: `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    description: "",
  };
}

export type WebCommunityAiAgentCapabilityEditorProps = {
  capabilityLabel: "skill" | "app";
  intro: string;
  emptyState: string;
  addButtonLabel: string;
  nameLabel: string;
  descriptionLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  communityAgentConfigDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityAgentConfig: () => Promise<boolean> | boolean;
  handleResetCommunityAgentConfig: () => void;
  isSavingCommunityAgentConfig: boolean;
  communityAgentConfigSaveError: string | null;
  entries: CommunityAgentCapabilityEntry[];
  setEntries: Dispatch<SetStateAction<CommunityAgentCapabilityEntry[]>>;
  markCommunityAgentConfigDirty: () => void;
};

export function WebCommunityAiAgentCapabilityEditor(
  props: WebCommunityAiAgentCapabilityEditorProps,
) {
  const {
    capabilityLabel,
    intro,
    emptyState,
    addButtonLabel,
    nameLabel,
    descriptionLabel,
    namePlaceholder,
    descriptionPlaceholder,
    communityAgentConfigDirtyRef,
    handleSaveCommunityAgentConfig,
    handleResetCommunityAgentConfig,
    isSavingCommunityAgentConfig,
    communityAgentConfigSaveError,
    entries,
    setEntries,
    markCommunityAgentConfigDirty,
  } = props;

  const isDirty = communityAgentConfigDirtyRef.current;
  const capabilityLabelTitle = capabilityLabel === "skill" ? "Skill" : "App";

  const addEntry = () => {
    setEntries((prev) => [...prev, createDraftCapabilityEntry(capabilityLabel)]);
    markCommunityAgentConfigDirty();
  };

  const updateEntry = (
    entryId: string,
    next: {
      name?: string;
      description?: string;
    },
  ) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              ...(typeof next.name === "string" ? { name: next.name } : null),
              ...(typeof next.description === "string"
                ? { description: next.description }
                : null),
            }
          : entry,
      ),
    );
    markCommunityAgentConfigDirty();
  };

  const removeEntry = (entryId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    markCommunityAgentConfigDirty();
  };

  return (
    <div className="settings-section">
      <div className="model-note agent-editor-intro">{intro}</div>

      <div className="agent-capability-toolbar">
        <button type="button" onClick={addEntry} disabled={isSavingCommunityAgentConfig}>
          {addButtonLabel}
        </button>
        <div className="agent-capability-toolbar-actions">
          {isDirty ? (
            <button
              type="button"
              onClick={handleResetCommunityAgentConfig}
              disabled={isSavingCommunityAgentConfig}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className={`platform-save-button ${isDirty ? "is-dirty" : "is-saved"}`}
            onClick={() => void handleSaveCommunityAgentConfig()}
            disabled={isSavingCommunityAgentConfig || !isDirty}
          >
            {isSavingCommunityAgentConfig ? "Saving…" : isDirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      {communityAgentConfigSaveError ? <div className="auth-error">{communityAgentConfigSaveError}</div> : null}

      {entries.length === 0 ? (
        <div className="agent-capability-empty">
          <div className="agent-capability-empty-title">No {capabilityLabel === "skill" ? "skills" : "apps"} yet</div>
          <div className="model-note">{emptyState}</div>
        </div>
      ) : (
        <div className="agent-capability-list" role="list" aria-label={`${capabilityLabelTitle} configuration`}>
          {entries.map((entry, index) => (
            <div key={entry.id} className="agent-capability-card" role="listitem">
              <div className="agent-capability-card-header">
                <div className="agent-canvas-target-kicker">
                  {capabilityLabelTitle} {index + 1}
                </div>
                <button
                  type="button"
                  className="agent-onboarding-reset"
                  onClick={() => removeEntry(entry.id)}
                >
                  Remove
                </button>
              </div>
              <label className="agent-capability-field">
                <span className="agent-capability-field-label">{nameLabel}</span>
                <input
                  className="agent-editor-inline-label-input"
                  value={entry.name}
                  onChange={(event) => updateEntry(entry.id, { name: event.target.value })}
                  placeholder={namePlaceholder}
                />
              </label>
              <label className="agent-capability-field">
                <span className="agent-capability-field-label">{descriptionLabel}</span>
                <textarea
                  className="agent-editor-inline-prompt-input"
                  value={entry.description}
                  onChange={(event) => updateEntry(entry.id, { description: event.target.value })}
                  placeholder={descriptionPlaceholder}
                  rows={5}
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
