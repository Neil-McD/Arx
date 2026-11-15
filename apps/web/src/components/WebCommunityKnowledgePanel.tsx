import { CommunityPageHeader, CommunityPageRail } from "./CommunityPageHeader";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { KitClassroom } from "../v1/KitClassroom";
import { deleteCloudCommunityResourceModule, prepareCloudCommunityBrandingField, saveCloudCommunityResource, saveCloudCommunityResourceModule } from "../../../../shared/cloudCommunityAdminGateway";
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

// The source intake takes at most this many at a time.
const GUIDE_INTAKE_BATCH = 10;

function KnowledgeV1({ resources, context }: Props) {
  // The classroom is the page, for reading and for a host's tools. The earlier
  // editor and its pop-ups are not reachable from here (Nov 14); they stay in
  // the code for the old design until it leaves production.
  const canManage = resources.capabilities.canOperateResources;
  const moduleId = resources.state.selectedModuleId;
  const openCourse = moduleId ? resources.state.modules.find((module) => module.id === moduleId && !module.is_virtual) ?? null : null;
  // Hands links to the guide in the intake's own batch size, and waits its
  // turn when another intake is running (it answers null while busy).
  const handLinksToGuide = async (urls: string[]) => {
    const known = new Set(resources.state.resources.filter((resource) => resource.resource_role === "source").map((resource) => resource.url));
    const missing = urls.filter((url) => !known.has(url));
    for (let start = 0; start < missing.length; start += GUIDE_INTAKE_BATCH) {
      const batch = missing.slice(start, start + GUIDE_INTAKE_BATCH);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await resources.actions.handleAddCommunitySources({ links: batch, files: [] }).catch(() => undefined);
        if (result !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  };
  // "What your guide knows": the builders' list, one level in from Knowledge.
  const [guideMemoryOpen, setGuideMemoryOpen] = useState(false);
  useEffect(() => { setGuideMemoryOpen(false); }, [context.communityId, canManage]);
  const inGuideMemory = guideMemoryOpen && canManage && !openCourse;
  return (
    <section className="community-knowledge-page" aria-label="Knowledge">
      <CommunityPageHeader title={openCourse ? openCourse.name : inGuideMemory ? "What your guide knows" : "Knowledge"}
        back={openCourse ? { label: "Back to Knowledge", onBack: () => resources.actions.handleSelectModule(null) }
          : inGuideMemory ? { label: "Back to Knowledge", onBack: () => setGuideMemoryOpen(false) } : null}>
        <div className="community-knowledge-header"><h1>Knowledge</h1></div>
      </CommunityPageHeader>
        <KitClassroom communityId={context.communityId!} communityName={context.communityName ?? "This community"} session={context.session}
          modules={resources.state.modules} resources={resources.state.resources}
          loaded={resources.state.moduleRead.hasData && resources.state.resourceRead.hasData}
          // The app's own lens ("View as a member" turns it off); the server
          // still decides who may write.
          canManage={canManage}
          openCourseId={moduleId} onOpenCourse={resources.actions.handleSelectModule}
          guideMemoryOpen={inGuideMemory} onOpenGuideMemory={canManage ? setGuideMemoryOpen : undefined}
          onCreateCourse={canManage ? async (name, lessons) => {
            // The course first (a draft only hosts see), then its lessons in
            // order. If a lesson fails, what was made stays and the page says so.
            let courseId: string | null = null;
            try {
              const saved = await saveCloudCommunityResourceModule({ session: context.session, moduleId: null, isPatch: false,
                payload: { community_id: context.communityId, name } });
              courseId = saved?.id ?? null;
            } catch (error) {
              return { ok: false, message: error instanceof Error && error.message && !error.message.includes("_") ? error.message : "The course couldn't be made. Try again." };
            }
            await resources.actions.retryRead("modules");
            if (!courseId) return { ok: false, message: "The course was made, but it didn't open. Find it on the shelf." };
            let made = 0;
            for (const title of lessons) {
              const lesson = await resources.actions.handleCreateBlankPageDraft(courseId, title);
              if (!lesson) break;
              made += 1;
            }
            if (made < lessons.length) {
              return { ok: false, message: `"${name}" was made with ${made} of ${lessons.length} lessons. Open it from the shelf to add the rest.` };
            }
            resources.actions.handleSelectModule(courseId);
            return { ok: true };
          } : undefined}
          onReorderCourses={canManage ? resources.actions.handleReorderModules : undefined}
          onRetrySources={canManage ? async () => {
            const result = await resources.actions.handleAddCommunitySources({ links: [], files: [], retryExisting: true });
            const failed = result?.ingestion?.failures.length ?? 0;
            if (!result || result.errors.length || failed) return { ok: false, message: failed ? `${failed === 1 ? "One still" : `${failed} still`} couldn't be read. ${sourceProblem(result?.ingestion?.failures[0]?.message)}` : sourceProblem(result?.errors[0]) };
            return { ok: true };
          } : undefined}
          onRemoveSource={canManage ? async (resourceId) => { await resources.actions.handleDeleteResource(resourceId); } : undefined}
          onSetCourseStatus={canManage ? async (id, status) => {
            const course = resources.state.modules.find((module) => module.id === id);
            if (course) await resources.actions.handleSetModuleStatus(course, status);
          } : undefined}
          onAddSources={canManage ? async ({ links, files }) => {
            const result = await resources.actions.handleAddCommunitySources({ links, files });
            if (!result) return { ok: false, message: "That couldn't be added. Try again." };
            // Anything refused or unreadable is said, even when the rest went in.
            const problem = result.errors[0] ?? result.ingestion?.failures[0]?.message;
            if (result.saved === 0 || result.rejected > 0 || problem) {
              const added = result.saved > 0 ? `${result.saved} added. ` : "";
              return { ok: false, message: `${added}${sourceProblem(problem)}` };
            }
            return { ok: true };
          } : undefined}
          onSaveCourse={canManage ? async (id, patch) => {
            try {
              // The cover is sent only when it changed; a new one is centred.
              const cover = patch.cover.kind === "keep" ? {}
                : patch.cover.kind === "remove" ? { banner_storage_id: null, banner_url: null }
                  : { banner_storage_id: (await prepareCloudCommunityBrandingField({ session: context.session, kind: "banner", nextValue: patch.cover.dataUrl })).storageId ?? null,
                    banner_url: null, banner_focus_x: 0.5, banner_focus_y: 0.5, banner_zoom: 1 };
              await saveCloudCommunityResourceModule({ session: context.session, moduleId: id, isPatch: true,
                payload: { name: patch.name, description_md: patch.description || null, ...cover } });
              await resources.actions.retryRead("modules");
              return { ok: true };
            } catch (error) {
              return { ok: false, message: error instanceof Error && error.message && !error.message.includes("_") ? error.message : "That couldn't be saved. Try again." };
            }
          } : undefined}
          onDeleteCourse={canManage ? async (id) => {
            // Only a draft: the new page's rule until the old design leaves prod.
            const course = resources.state.modules.find((module) => module.id === id);
            if (!course || course.module_status !== "draft") return { ok: false, message: "Unpublish this course before deleting it." };
            try {
              await deleteCloudCommunityResourceModule({ session: context.session, moduleId: id });
              await Promise.all([resources.actions.retryRead("modules"), resources.actions.retryRead("resources")]);
              return { ok: true };
            } catch {
              return { ok: false, message: "The course couldn't be deleted. Try again." };
            }
          } : undefined}
          lessonEditing={canManage ? {
            save: async (resourceId, patch) => {
              await saveCloudCommunityResource({ session: context.session, resourceId, isPatch: true, payload: patch });
              await resources.actions.retryRead("resources");
              // A lesson's links are also handed to the guide to read, as any
              // link is. Every link the guide doesn't have yet goes, not only
              // the ones just added, so a hand-off that was missed is made up
              // on the next save. A page it can't read still opens for
              // members; that failure shows in What your guide knows.
              if (patch.lesson_links?.length) void handLinksToGuide(patch.lesson_links.map((link) => link.url));
            },
            addLesson: async (id) => {
              const created = await resources.actions.handleCreateBlankPageDraft(id);
              return created?.id ?? null;
            },
            reorder: async (id, ids) => { await resources.actions.handleReorderResources(id, ids); },
            remove: async (resourceId) => { await resources.actions.handleDeleteResource(resourceId); },
            move: async (resourceId, courseId) => {
              if (!(await resources.actions.handleMoveResourceToModule(resourceId, courseId, null))) throw new Error("move_failed");
            },
          } : null}
          renderRail={(rail) => <CommunityPageRail label="Knowledge">{rail}</CommunityPageRail>} />
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
