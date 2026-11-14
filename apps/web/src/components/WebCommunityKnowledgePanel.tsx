import { CommunityPageHeader, CommunityPageRail } from "./CommunityPageHeader";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { KitClassroom } from "../v1/KitClassroom";
import { saveCloudCommunityResource } from "../../../../shared/cloudCommunityAdminGateway";
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

// A source Polynet couldn't take, in plain words.
function sourceProblem(raw: string | undefined): string {
  const message = String(raw ?? "");
  if (message.includes("pdf_ingestion_not_supported")) return "Polynet can't read PDFs yet.";
  if (message.includes("content_type_not_supported")) return "Polynet can't read that kind of file yet.";
  if (message.includes("no_readable_content")) return "Polynet found nothing to read there.";
  return "Polynet couldn't read that. Check it and try again.";
}

function KnowledgeV1({ resources, context }: Props) {
  // The classroom is the page. A host's editing tools (lessons, sources,
  // reordering) are still the earlier editor, one click away and one click back.
  const [editing, setEditing] = useState(false);
  const canManage = resources.capabilities.canOperateResources;
  useEffect(() => { setEditing(false); }, [context.communityId]);
  useEffect(() => { if (!canManage) setEditing(false); }, [canManage]);
  const moduleId = resources.state.selectedModuleId;
  return (
    <section className="community-knowledge-page" aria-label="Knowledge">
      <CommunityPageHeader title={editing ? "Knowledge · Editing" : "Knowledge"}
        actions={editing ? <button type="button" className="community-page-back" onClick={() => setEditing(false)}>Done editing</button> : null}>
        <div className="community-knowledge-header"><h1>Knowledge</h1></div>
      </CommunityPageHeader>
      {editing && canManage ? <CommunityResourcesPanel {...resources} /> : (
        <KitClassroom communityId={context.communityId!} communityName={context.communityName ?? "This community"} session={context.session}
          modules={resources.state.modules} resources={resources.state.resources}
          loaded={resources.state.moduleRead.hasData && resources.state.resourceRead.hasData}
          // The app's own lens ("View as a member" turns it off); the server
          // still decides who may write.
          canManage={canManage}
          openCourseId={moduleId} onOpenCourse={resources.actions.handleSelectModule}
          onNewCourse={resources.actions.openNewModuleModal}
          onEditCourse={(id) => { resources.actions.handleSelectModule(id); setEditing(true); }}
          onSetCourseStatus={canManage ? async (id, status) => {
            const course = resources.state.modules.find((module) => module.id === id);
            if (course) await resources.actions.handleSetModuleStatus(course, status);
          } : undefined}
          onAddSources={canManage ? async ({ links, files }) => {
            const result = await resources.actions.handleAddCommunitySources({ links, files });
            if (!result) return { ok: false, message: "That couldn't be added. Try again." };
            if (result.saved === 0) return { ok: false, message: sourceProblem(result.errors[0] ?? result.ingestion?.failures[0]?.message) };
            return { ok: true };
          } : undefined}
          onEditCourseDetails={(id) => {
            const course = resources.state.modules.find((module) => module.id === id);
            if (course) resources.actions.handleEditModule(course);
          }}
          lessonEditing={canManage ? {
            save: async (resourceId, patch) => {
              await saveCloudCommunityResource({ session: context.session, resourceId, isPatch: true, payload: patch });
              await resources.actions.retryRead("resources");
            },
            addLesson: async (id) => {
              const created = await resources.actions.handleCreateBlankPageDraft(id);
              return created?.id ?? null;
            },
            reorder: async (id, ids) => { await resources.actions.handleReorderResources(id, ids); },
            remove: async (resourceId) => { await resources.actions.handleDeleteResource(resourceId); },
          } : null}
          renderRail={(rail) => <CommunityPageRail label="Knowledge">{rail}</CommunityPageRail>} />
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
