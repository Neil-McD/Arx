import { useEffect, useState, type ComponentProps } from "react";
import { CommunityResourcesPanel } from "./CommunityResourcesPanel";
import { CommunityMemoryGraph } from "./CommunityMemoryGraph";
import type { WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { WebCommunitySettingsSection } from "./WebCommunitySettingsSection";
import { useWebCommunityPolynetController } from "../controllers/useWebCommunityPolynetController";
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
  const [view, setView] = useState<"resources" | "graph">("resources");
  useEffect(() => { setView("resources"); }, [resources.state.selectedModuleId]);
  const graphOpen = view === "graph" && context.canViewGraph;
  const graph = useWebCommunityPolynetController({
    activePage: "community",
    communityTab: "resources",
    isGraphOpen: graphOpen,
    activeCommunityId: context.communityId,
    session: context.session,
    ensureSession: context.ensureSession,
    requireSignIn: context.requireSignIn,
    canViewPolynet: context.canViewGraph,
  });
  return (
    <section className="community-knowledge-page" aria-label="Knowledge">
      <div className="community-knowledge-header">
        <h1>Knowledge</h1>
        <div className="community-knowledge-switcher" role="group" aria-label="Knowledge view">
          <button type="button" aria-pressed={!graphOpen} onClick={() => setView("resources")}>Resources</button>
          {context.canViewGraph ? <button type="button" aria-pressed={graphOpen} onClick={() => setView("graph")}>Graph</button> : null}
        </div>
      </div>
      <div hidden={graphOpen}>
        <CommunityResourcesPanel {...resources} />
      </div>
      {graphOpen ? <CommunityMemoryGraph activeCommunityName={context.communityName} state={graph.state} onRefresh={graph.actions.refresh} /> : null}
    </section>
  );
}
