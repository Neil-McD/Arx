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

type AiLandingEditTarget = "system_prompt" | `tab:${string}`;

export type WebCommunityAiAgentLandingEditorProps = {
  communityAgentDraftDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityAgentDraft: () => Promise<boolean> | boolean;
  handleResetCommunityAgentDraft: () => void;
  isSavingCommunityAgentDraft: boolean;
  communityAgentDraftSaveError: string | null;
  communityAgentDraftLanding: CommunityAgentLanding;
  setCommunityAgentDraftLanding: Dispatch<SetStateAction<CommunityAgentLanding>>;
  markCommunityAgentDraftDirty: () => void;
  communityAgentDraftSystemPrompt: string;
  setCommunityAgentDraftSystemPrompt: Dispatch<SetStateAction<string>>;
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

function summarizeSystemPrompt(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Set the community-wide behavior that applies after the onboarding prompt is injected.";
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

export function WebCommunityAiAgentLandingEditor(props: WebCommunityAiAgentLandingEditorProps) {
  const {
    communityAgentDraftDirtyRef,
    handleSaveCommunityAgentDraft,
    handleResetCommunityAgentDraft,
    isSavingCommunityAgentDraft,
    communityAgentDraftSaveError,
    communityAgentDraftLanding,
    setCommunityAgentDraftLanding,
    markCommunityAgentDraftDirty,
    communityAgentDraftSystemPrompt,
    setCommunityAgentDraftSystemPrompt,
    previewCommunityName,
    previewProjectName,
  } = props;

  const [activeEditTarget, setActiveEditTarget] = useState<AiLandingEditTarget | null>(null);
  const isDirty = communityAgentDraftDirtyRef.current;
  const promptCards = buildPromptCards(communityAgentDraftLanding);

  const setCardForSlot = (slotId: string, next: { label?: string; prompt?: string }) => {
    setCommunityAgentDraftLanding((prev) => ({
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
    markCommunityAgentDraftDirty();
  };

  const activeCard =
    activeEditTarget?.startsWith("tab:")
      ? promptCards.find((card) => card.id === activeEditTarget.slice(4)) ?? null
      : null;

  const renderInspector = () => {
    if (!activeEditTarget) {
      return (
        <div className="agent-editor-empty">
          Click <strong>Agent Soul</strong> or one of the starter prompts in the preview to edit the exact surface.
        </div>
      );
    }

    if (activeEditTarget === "system_prompt") {
      return (
        <>
          <div className="funnel-editor-section-title">Agent Soul</div>
          <div className="model-note">
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
            rows={8}
          />
        </>
      );
    }

    if (!activeCard) {
      return (
        <div className="agent-editor-empty">
          Select a starter prompt in the preview to edit its label and injected prompt.
        </div>
      );
    }

    const isCustom =
      activeCard.label.trim() !== activeCard.defaultLabel.trim() ||
      activeCard.prompt.trim() !== activeCard.defaultPrompt.trim();

    return (
      <>
        <div className="funnel-editor-section-title">{activeCard.defaultLabel}</div>
        <div className="model-note">
          Set the visible button label and the first prompt a member sends when they choose this action.
        </div>
        <div className="agent-editor-inspector-actions">
          <button
            type="button"
            className="agent-onboarding-reset"
            disabled={!isCustom}
            onClick={() =>
              setCardForSlot(activeCard.id, {
                label: activeCard.defaultLabel,
                prompt: activeCard.defaultPrompt,
              })
            }
          >
            Use platform default
          </button>
        </div>
        <label className="agent-landing-field">
          <span className="agent-landing-field-label">Button label</span>
          <input
            className="agent-landing-label-input"
            value={activeCard.label}
            onChange={(event) => setCardForSlot(activeCard.id, { label: event.target.value })}
            placeholder={activeCard.defaultLabel}
          />
        </label>
        <label className="agent-landing-field">
          <span className="agent-landing-field-label">Injected prompt</span>
          <textarea
            className="agent-landing-prompt-input"
            value={activeCard.prompt}
            onChange={(event) => setCardForSlot(activeCard.id, { prompt: event.target.value })}
            placeholder={activeCard.defaultPrompt}
          />
        </label>
      </>
    );
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">AI Agent</div>
      <div className="model-note agent-editor-intro">
        Click Agent Soul or any starter prompt to edit the actual onboarding surface members will see.
      </div>

      <div className="agent-preview-actions">
        {isDirty ? (
          <button
            type="button"
            onClick={handleResetCommunityAgentDraft}
            disabled={isSavingCommunityAgentDraft}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className={`platform-save-button ${isDirty ? "is-dirty" : "is-saved"}`}
          onClick={() => void handleSaveCommunityAgentDraft()}
          disabled={isSavingCommunityAgentDraft || !isDirty}
        >
          {isSavingCommunityAgentDraft ? "Saving…" : isDirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {communityAgentDraftSaveError ? <div className="auth-error">{communityAgentDraftSaveError}</div> : null}

      <div className="agent-editor-grid agent-editor-grid--canvas">
        <div className="agent-editor-canvas">
          <button
            type="button"
            className={`agent-canvas-target-card ${activeEditTarget === "system_prompt" ? "is-active" : ""}`}
            onClick={() => setActiveEditTarget("system_prompt")}
          >
            <div className="agent-canvas-target-kicker">Agent Soul</div>
            <div className="agent-canvas-target-title">Community-wide behavior</div>
            <div className="agent-canvas-target-body">{summarizeSystemPrompt(communityAgentDraftSystemPrompt)}</div>
          </button>

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
            <div className="agent-landing-preview-row">
              {promptCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`agent-landing-preview-pill ${activeEditTarget === `tab:${card.id}` ? "is-active" : ""}`}
                  onClick={() => setActiveEditTarget(`tab:${card.id}`)}
                >
                  {card.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="agent-editor-inspector">
          <div className="agent-editor-inspector-card">{renderInspector()}</div>
        </div>
      </div>
    </div>
  );
}
