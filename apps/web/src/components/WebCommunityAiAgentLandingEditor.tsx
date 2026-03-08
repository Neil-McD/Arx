import type { Dispatch, MutableRefObject, SetStateAction } from "react";

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
  communityAgentDraftDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityAgentDraft: () => Promise<boolean> | boolean;
  isSavingCommunityAgentDraft: boolean;
  communityAgentDraftSaveError: string | null;
  communityAgentDraftLanding: CommunityAgentLanding;
  setCommunityAgentDraftLanding: Dispatch<SetStateAction<CommunityAgentLanding>>;
  markCommunityAgentDraftDirty: () => void;
  communityAgentDraftSystemPrompt: string;
  setCommunityAgentDraftSystemPrompt: Dispatch<SetStateAction<string>>;
  previewCommunityName: string;
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
    communityAgentDraftDirtyRef,
    handleSaveCommunityAgentDraft,
    isSavingCommunityAgentDraft,
    communityAgentDraftSaveError,
    communityAgentDraftLanding,
    setCommunityAgentDraftLanding,
    markCommunityAgentDraftDirty,
    communityAgentDraftSystemPrompt,
    setCommunityAgentDraftSystemPrompt,
    previewCommunityName,
  } = props;

  const isDirty = communityAgentDraftDirtyRef.current;
  const promptCards = buildPromptCards(communityAgentDraftLanding);

  const setCardForSlot = (slotId: string, next: { label?: string; prompt?: string }) => {
    setCommunityAgentDraftLanding((prev) => ({
      ...prev,
      tabs: DEFAULT_EMPTY_THREAD_LANDING.tabs.map((defaultTab) => {
        const existing = prev.tabs.find((tab) => tab.id === defaultTab.id) ?? null;
        const labelSource =
          defaultTab.id === slotId ? next.label : existing?.label;
        const promptSource =
          defaultTab.id === slotId ? next.prompt : existing?.prompts[0];
        return {
          id: defaultTab.id,
          label: (labelSource ?? defaultTab.label).trim() || defaultTab.label,
          prompts: [((promptSource ?? defaultTab.prompts[0]).trim() || defaultTab.prompts[0])],
        };
      }),
    }));
    markCommunityAgentDraftDirty();
  };

  return (
    <>
      <div className="settings-section agent-system-prompt">
        <div className="settings-section-title">System prompt (community-wide)</div>
        <div className="model-note agent-editor-intro">
          This applies to every chat in the community after the onboarding prompt is injected.
        </div>
        <textarea
          className="system-prompt-input"
          placeholder="Optional. This applies to every chat in this community."
          value={communityAgentDraftSystemPrompt}
          onChange={(event) => {
            setCommunityAgentDraftSystemPrompt(event.target.value);
            markCommunityAgentDraftDirty();
          }}
          rows={6}
        />
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Onboarding prompts</div>
        <div className="agent-preview-editor">
          <div className="agent-preview-actions">
            <button
              type="button"
              className={`agent-save-button ${isDirty ? "is-dirty" : "is-saved"}`}
              onClick={() => void handleSaveCommunityAgentDraft()}
              disabled={isSavingCommunityAgentDraft || !isDirty}
            >
              {isSavingCommunityAgentDraft ? "Saving…" : isDirty ? "Save changes" : "Saved"}
            </button>
          </div>

          <div className="model-note agent-editor-intro">
            These prompts appear as the member’s first visible message when they start a new thread.
            Keep them natural, specific, and aligned with how you want the AI agent to onboard someone.
          </div>
          {communityAgentDraftSaveError ? <div className="auth-error">{communityAgentDraftSaveError}</div> : null}

          <div className="agent-editor-grid">
            <div className="agent-preview-shell" aria-label="Landing preview">
              <div className="web-empty-thread-title">
                Welcome to <span className="web-empty-thread-title-accent">{previewCommunityName}</span>
              </div>
              <div className="agent-preview-composer-shell" aria-hidden="true">
                <div className="agent-preview-composer-placeholder">Describe what you need help with...</div>
              </div>
              <div className="agent-landing-preview-row">
                {promptCards.map((card) => (
                  <div key={card.id} className="agent-landing-preview-pill">
                    {card.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="agent-onboarding-fields">
              {promptCards.map((card) => {
                const isCustom =
                  card.label.trim() !== card.defaultLabel.trim() ||
                  card.prompt.trim() !== card.defaultPrompt.trim();
                return (
                  <div key={card.id} className="agent-onboarding-card">
                    <div className="agent-onboarding-header">
                      <div className="agent-onboarding-copy">
                        <div className="agent-onboarding-kicker">{isCustom ? "Custom" : "Platform default"}</div>
                        <div className="agent-onboarding-title">{card.defaultLabel}</div>
                        <div className="agent-onboarding-text">
                          Set the button label and the injected prompt members will send when they choose this action.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="agent-onboarding-reset"
                        disabled={!isCustom}
                        onClick={() => setCardForSlot(card.id, {
                          label: card.defaultLabel,
                          prompt: card.defaultPrompt,
                        })}
                      >
                        Use platform default
                      </button>
                    </div>
                    <label className="agent-landing-field">
                      <span className="agent-landing-field-label">Button label</span>
                      <input
                        className="agent-landing-label-input"
                        value={card.label}
                        onChange={(event) => setCardForSlot(card.id, { label: event.target.value })}
                        placeholder={card.defaultLabel}
                      />
                    </label>
                    <label className="agent-landing-field">
                      <span className="agent-landing-field-label">Injected prompt</span>
                      <textarea
                        className="agent-landing-prompt-input"
                        value={card.prompt}
                        onChange={(event) => setCardForSlot(card.id, { prompt: event.target.value })}
                        placeholder={card.defaultPrompt}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
