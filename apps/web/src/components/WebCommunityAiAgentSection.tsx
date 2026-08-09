import { useEffect, useState, type ReactNode } from "react";

import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import {
  WebCommunityAiAgentInstructionsEditor,
  type WebCommunityAiAgentInstructionsEditorProps,
} from "./WebCommunityAiAgentInstructionsEditor";
import {
  WebCommunityAiAgentSkillsEditor,
  type WebCommunityAiAgentSkillsEditorProps,
} from "./WebCommunityAiAgentSkillsEditor";
import {
  platformTabId,
  platformTabPanelId,
  WebPlatformTabList,
} from "./WebPlatformChoiceControls";

type CommunityAiAgentTab = "instructions" | "skills";

type WebCommunityAiAgentSectionProps = {
  activeCommunity: unknown | null;
  hasSession: boolean;
  canManageMembersActiveCommunity: boolean;
  preferredTab?: CommunityAiAgentTab;
  isLoadingCommunityAgentConfig: boolean;
  communityAgentConfigError: string | null;
  onRequireSignIn: () => void;
  instructionsEditorProps: WebCommunityAiAgentInstructionsEditorProps;
  skillsEditorProps: WebCommunityAiAgentSkillsEditorProps;
  embedded?: boolean;
};

const COMMUNITY_AI_AGENT_TABS: Array<{
  id: CommunityAiAgentTab;
  label: string;
}> = [
  { id: "instructions", label: "Instructions" },
  { id: "skills", label: "Skills" },
];

export function WebCommunityAiAgentSection(props: WebCommunityAiAgentSectionProps) {
  const {
    activeCommunity,
    hasSession,
    canManageMembersActiveCommunity,
    preferredTab,
    isLoadingCommunityAgentConfig,
    communityAgentConfigError,
    onRequireSignIn,
    instructionsEditorProps,
    skillsEditorProps,
    embedded = false,
  } = props;
  const [activeTab, setActiveTab] = useState<CommunityAiAgentTab>("instructions");
  useEffect(() => {
    if (!preferredTab) return;
    setActiveTab(preferredTab);
  }, [preferredTab]);
  const activeTabIndex = COMMUNITY_AI_AGENT_TABS.findIndex((tab) => tab.id === activeTab);
  const tabSwitcherStyle = buildPlatformSwitcherStyle(COMMUNITY_AI_AGENT_TABS.length, activeTabIndex);
  const canRenderTabbedEditor =
    Boolean(activeCommunity) &&
    hasSession &&
    canManageMembersActiveCommunity;

  let content: ReactNode = null;
  if (!activeCommunity) {
    content = <div className="chat-empty">Select a community to configure the AI agent.</div>;
  } else if (!hasSession) {
    content = (
      <div className="chat-empty">
        <div>Sign in to configure the AI agent.</div>
        <button
          className="secondary"
          type="button"
          onClick={onRequireSignIn}
          style={{ marginTop: 12 }}
        >
          Sign in
        </button>
      </div>
    );
  } else if (!canManageMembersActiveCommunity) {
    content = <div className="chat-empty">Only owners and admins can configure the AI agent.</div>;
  } else if (activeTab === "instructions") {
    if (isLoadingCommunityAgentConfig) {
      content = <div className="chat-empty">Loading…</div>;
    } else if (communityAgentConfigError) {
      content = <div className="auth-error">{communityAgentConfigError}</div>;
    } else {
      content = <WebCommunityAiAgentInstructionsEditor {...instructionsEditorProps} />;
    }
  } else if (activeTab === "skills") {
    content = <WebCommunityAiAgentSkillsEditor {...skillsEditorProps} />;
  }

  return (
    <div className={embedded ? "community-settings-embedded-pane" : "settings-panel community-settings-panel"}>
      <div className="settings-section-title">AI Agent</div>
      {canRenderTabbedEditor ? (
        <WebPlatformTabList
          tabs={COMMUNITY_AI_AGENT_TABS.map((tab) => ({
            ...tab,
            buttonClassName: "community-ai-agent-tab",
          }))}
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          idPrefix="community-ai-agent"
          ariaLabel="AI agent configuration sections"
          className="platform-switcher platform-switcher-compact community-ai-agent-tablist"
          style={tabSwitcherStyle}
        />
      ) : null}
      {canRenderTabbedEditor ? (
        <div
          id={platformTabPanelId("community-ai-agent", activeTab)}
          role="tabpanel"
          aria-labelledby={platformTabId("community-ai-agent", activeTab)}
          tabIndex={0}
        >
          {content}
        </div>
      ) : content}
    </div>
  );
}
