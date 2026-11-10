import { CommunityPageHeader } from "./CommunityPageHeader";
import { useEffect, useState, type ComponentProps } from "react";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import { WebPlatformTabList, platformTabId, platformTabPanelId } from "./WebPlatformChoiceControls";
import { CommunityResourcesPanel } from "./CommunityResourcesPanel";
import { WebCommunityNotes } from "./WebCommunityNotes";
import type { WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { WebCommunitySettingsSection } from "./WebCommunitySettingsSection";
import "./WebCommunityKnowledgePanel.css";

type Props = {
  resources: ComponentProps<typeof CommunityResourcesPanel>;
  context: {
    communityId: string | null;
    communityName: string | null;
    session: WebCommunityChatPanelProps["session"];
    ensureSession: ComponentProps<typeof WebCommunitySettingsSection>["ensureSession"];
    requireSignIn: () => void;
    canViewGraph: boolean;
  };
};

export function WebCommunityKnowledgePanel({ resources, context }: Props) {
  const [view, setView] = useState<"resources" | "notes">("resources");
  useEffect(() => { setView("resources"); }, [resources.state.selectedModuleId]);
  const notesOpen = view === "notes" && context.canViewGraph;
  const tabs: { id: "resources" | "notes"; label: string }[] = [
    { id: "resources", label: "Resources" },
    ...(context.canViewGraph ? [{ id: "notes" as const, label: "Notes" }] : []),
  ];
  const tabList = (
    <WebPlatformTabList
      tabs={tabs}
      activeTab={notesOpen ? "notes" : "resources"}
      onSelectTab={setView}
      ariaLabel="Knowledge view"
      idPrefix="community-knowledge"
      style={buildPlatformSwitcherStyle(tabs.length, notesOpen ? 1 : 0)}
    />
  );
  return (
    <section className="community-knowledge-page" aria-label="Knowledge">
      <CommunityPageHeader title="Knowledge" actions={tabs.length > 1 ? tabList : null}>
        <div className="community-knowledge-header">
          <h1>Knowledge</h1>
          {tabList}
        </div>
      </CommunityPageHeader>
      <div hidden={notesOpen} role="tabpanel" id={platformTabPanelId("community-knowledge", "resources")} aria-labelledby={platformTabId("community-knowledge", "resources")}>
        <CommunityResourcesPanel {...resources} />
      </div>
      {notesOpen ? <div className="community-knowledge-notes" role="tabpanel" id={platformTabPanelId("community-knowledge", "notes")} aria-labelledby={platformTabId("community-knowledge", "notes")}>
        <WebCommunityNotes communityId={context.communityId} session={context.session} ensureSession={context.ensureSession} />
      </div> : null}
    </section>
  );
}
