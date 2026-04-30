import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  DEFAULT_EMPTY_THREAD_LANDING,
  type CommunityAgentLanding,
} from "../../../../shared/communityAgentLanding";

type LandingPromptCard = {
  id: string;
  label: string;
  defaultLabel: string;
  prompt: string;
  defaultPrompt: string;
};

export type WebCommunityAiAgentLandingEditorProps = {
  communityAgentConfigDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityAgentConfig: () => Promise<boolean> | boolean;
  handleResetCommunityAgentConfig: () => void;
  isSavingCommunityAgentConfig: boolean;
  communityAgentConfigSaveError: string | null;
  communityAgentConfigLanding: CommunityAgentLanding;
  setCommunityAgentConfigLanding: Dispatch<SetStateAction<CommunityAgentLanding>>;
  markCommunityAgentConfigDirty: () => void;
  communityAgentConfigCommunitySystemPrompt: string;
  setCommunityAgentConfigCommunitySystemPrompt: Dispatch<SetStateAction<string>>;
  previewCommunityName: string;
  previewProjectName: string;
};

function buildPromptCards(landing: CommunityAgentLanding): LandingPromptCard[] {
  return DEFAULT_EMPTY_THREAD_LANDING.tabs.map((defaultTab) => {
    const currentTab = landing.tabs.find((tab) => tab.id === defaultTab.id) ?? null;
    const label = (currentTab?.label ?? defaultTab.label).trim() || defaultTab.label;
    const prompt = (currentTab?.prompts[0] ?? defaultTab.prompts[0]).trim() || defaultTab.prompts[0];
    return {
      id: defaultTab.id,
      label,
      defaultLabel: defaultTab.label,
      prompt,
      defaultPrompt: defaultTab.prompts[0],
    };
  });
}

export function WebCommunityAiAgentLandingEditor(props: WebCommunityAiAgentLandingEditorProps) {
  const {
    communityAgentConfigDirtyRef,
    handleSaveCommunityAgentConfig,
    handleResetCommunityAgentConfig,
    isSavingCommunityAgentConfig,
    communityAgentConfigSaveError,
    communityAgentConfigLanding,
    setCommunityAgentConfigLanding,
    markCommunityAgentConfigDirty,
    communityAgentConfigCommunitySystemPrompt,
    setCommunityAgentConfigCommunitySystemPrompt,
    previewCommunityName,
    previewProjectName,
  } = props;

  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [isSystemPromptActive, setIsSystemPromptActive] = useState(false);
  const isDirty = communityAgentConfigDirtyRef.current;
  const promptCards = buildPromptCards(communityAgentConfigLanding);

  const setCardForSlot = (slotId: string, next: { label?: string; prompt?: string }) => {
    setCommunityAgentConfigLanding((prev) => ({
      ...prev,
      tabs: DEFAULT_EMPTY_THREAD_LANDING.tabs.map((defaultTab) => {
        const existing = prev.tabs.find((tab) => tab.id === defaultTab.id) ?? null;
        const labelSource = defaultTab.id === slotId ? next.label : existing?.label;
        const promptSource = defaultTab.id === slotId ? next.prompt : existing?.prompts[0];
        return {
          id: defaultTab.id,
          label: (labelSource ?? defaultTab.label).trim() || defaultTab.label,
          prompts: [((promptSource ?? defaultTab.prompts[0]).trim() || defaultTab.prompts[0])],
        };
      }),
    }));
    markCommunityAgentConfigDirty();
  };

  return (
    <div className="settings-section">
      <div className="model-note agent-editor-intro">
        Configure the community-wide system prompt and the first-run landing surface directly. Click into Community System Prompt or any starter action and type in place.
      </div>

      <div className="agent-preview-actions">
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

      {communityAgentConfigSaveError ? <div className="auth-error">{communityAgentConfigSaveError}</div> : null}

      <div className="agent-editor-canvas agent-editor-canvas--full">
        <div className={`agent-canvas-target-card agent-canvas-target-card-editable ${isSystemPromptActive ? "is-active" : ""}`}>
          <div className="agent-canvas-target-kicker">Community System Prompt</div>
          <div className="agent-canvas-target-title">Community-wide instructions</div>
          <div className="model-note">
            This adds community-specific instructions on top of each member's agent soul.
          </div>
          <textarea
            className="system-prompt-input"
            placeholder="Optional. This applies to every chat in this community."
            value={communityAgentConfigCommunitySystemPrompt}
            onFocus={() => setIsSystemPromptActive(true)}
            onBlur={() => setIsSystemPromptActive(false)}
            onChange={(event) => {
              setCommunityAgentConfigCommunitySystemPrompt(event.target.value);
              markCommunityAgentConfigDirty();
            }}
            rows={6}
          />
        </div>

        <div className="agent-preview-shell" aria-label="Landing preview">
          <div className="web-empty-thread-title">
            Welcome to <span className="web-empty-thread-title-accent">{previewCommunityName}</span>
          </div>
          {previewProjectName.trim() ? (
            <div className="web-empty-thread-subtitle">
              You are in <span className="web-empty-thread-subtitle-accent">{previewProjectName}</span> workspace
            </div>
          ) : null}
          <div className="agent-preview-composer-shell" aria-hidden="true">
            <div className="agent-preview-composer-placeholder">Describe what you need help with...</div>
          </div>
          <div className="web-empty-thread-actions agent-editor-actions" role="list" aria-label="Starter prompts">
            {promptCards.map((card) => {
              const isActive = activeSlotId === card.id;
              const isCustom =
                card.label.trim() !== card.defaultLabel.trim() ||
                card.prompt.trim() !== card.defaultPrompt.trim();
              return (
                <div
                  key={card.id}
                  className={`web-empty-thread-action agent-editor-action-card${isActive ? " is-active" : ""}`}
                  role="listitem"
                  onClick={() => setActiveSlotId(card.id)}
                >
                  <div className="agent-editor-action-header">
                    <div className="agent-editor-action-kicker">{card.defaultLabel}</div>
                    <button
                      type="button"
                      className="agent-onboarding-reset"
                      disabled={!isCustom}
                      onClick={(event) => {
                        event.stopPropagation();
                        setCardForSlot(card.id, {
                          label: card.defaultLabel,
                          prompt: card.defaultPrompt,
                        });
                      }}
                    >
                      Use platform default
                    </button>
                  </div>
                  <input
                    className="agent-editor-inline-label-input"
                    value={card.label}
                    onFocus={() => setActiveSlotId(card.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setCardForSlot(card.id, { label: event.target.value })}
                    placeholder={card.defaultLabel}
                  />
                  <textarea
                    className="agent-editor-inline-prompt-input"
                    value={card.prompt}
                    onFocus={() => setActiveSlotId(card.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setCardForSlot(card.id, { prompt: event.target.value })}
                    placeholder={card.defaultPrompt}
                    rows={4}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
