import { CommunityPageHeader, CommunityPageRail } from "./CommunityPageHeader";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { KitKnowledgePage } from "../v1/KitKnowledgePage";
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

export function WebCommunityKnowledgePanel(props: Props) {
  // Design system v1: what the community has learned is the page; courses and
  // documents are one click away (Resources), still in their own layout.
  if (isDesignV1Active() && props.context.communityId && props.context.canViewGraph) return <KnowledgeV1 {...props} />;
  return <KnowledgeClassic {...props} />;
}

function KnowledgeV1({ resources, context }: Props) {
  const [view, setView] = useState<"notes" | "resources">("notes");
  useEffect(() => { setView("notes"); }, [context.communityId]);
  return (
    <section className="community-knowledge-page" aria-label="Knowledge">
      <CommunityPageHeader title={view === "resources" ? "Knowledge · Resources" : "Knowledge"}
        actions={view === "resources" ? <button type="button" className="community-page-back" onClick={() => setView("notes")}>Back to notes</button> : null}>
        <div className="community-knowledge-header"><h1>Knowledge</h1></div>
      </CommunityPageHeader>
      {view === "resources" ? <CommunityResourcesPanel {...resources} /> : (
        <KitKnowledgePage communityId={context.communityId!} communityName={context.communityName ?? "This community"} session={context.session}
          // The app's own lens ("View as a member" turns it off); the server
          // still decides who may write.
          allowManage={resources.capabilities.canOperateResources}
          onOpenResources={() => setView("resources")}
          renderRail={(rail) => <CommunityPageRail label="Open note">{rail}</CommunityPageRail>} />
      )}
    </section>
  );
}

function KnowledgeClassic({ resources, context }: Props) {
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
