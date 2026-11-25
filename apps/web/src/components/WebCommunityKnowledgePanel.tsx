import { CommunityPageHeader, CommunityPageRail } from "./CommunityPageHeader";
import { askInApp } from "../../../../shared/inAppConfirm";
import { KitClassroom } from "../v1/KitClassroom";
import { KitBrainPage, takeOpenBrain } from "../v1/KitBrainPage";
import { deleteCloudCommunityResourceModule, prepareCloudCommunityBrandingField, saveCloudCommunityResource, saveCloudCommunityResourceModule } from "../../../../shared/cloudCommunityAdminGateway";
import { useEffect, useRef, type ComponentProps } from "react";
import { useRouteDetail, writeRouteDetail } from "../../../../shared/routeDetails";
import type { CommunityResourcesPanel } from "./CommunityResourcesPanel";
import type { WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { WebCommunitySettingsSection } from "./WebCommunitySettingsSection";
import "./WebCommunityKnowledgePanel.css";

type Props = {
  resources: ComponentProps<typeof CommunityResourcesPanel>;
  context: {
    communityId: string | null;
    communityName: string | null;
    communityOneLiner?: string | null;
    communityAbout?: string | null;
    session: WebCommunityChatPanelProps["session"];
    ensureSession: ComponentProps<typeof WebCommunitySettingsSection>["ensureSession"];
    requireSignIn: () => void;
    canViewGraph: boolean;
  };
};

export function WebCommunityKnowledgePanel(props: Props) {
  if (props.context.communityId && props.context.canViewGraph) return <KnowledgeV1 {...props} />;
  return (
    <section className="community-knowledge-page" aria-label="Knowledge">
      <CommunityPageHeader title="Knowledge">
        <div className="community-knowledge-header">
          <h1>Knowledge</h1>
        </div>
      </CommunityPageHeader>
      <div className="chat-empty">
        {!props.context.communityId
          ? "Select a community to view its knowledge."
          : "Knowledge is available to members of this community."}
      </div>
    </section>
  );
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
  // One level in from Knowledge, in the address (/resources/guide,
  // /resources/brain): "What your guide knows" (builders' list) and the
  // community brain. Opening one is a step the back button returns from.
  const routeView = useRouteDetail("view");
  // Whether the open lesson has unsaved words (a host edits it in the page).
  const lessonDirtyRef = useRef(false);
  const guideMemoryOpen = routeView === "guide";
  const brainOpen = routeView === "brain";
  const setGuideMemoryOpen = (open: boolean) => writeRouteDetail("view", open ? "guide" : null);
  const setBrainOpen = (open: boolean) => writeRouteDetail("view", open ? "brain" : null);
  // Home's panel asks for the brain on its way here.
  useEffect(() => { if (takeOpenBrain()) writeRouteDetail("view", "brain", { replace: true }); }, [context.communityId]);
  const inGuideMemory = guideMemoryOpen && canManage && !openCourse;
  const inBrain = brainOpen && !openCourse && !inGuideMemory;
  return (
    <section className="community-knowledge-page" aria-label="Knowledge">
      <CommunityPageHeader title={openCourse ? openCourse.name : inGuideMemory ? "What your guide knows" : inBrain ? "The community brain" : "Knowledge"}
        back={openCourse ? { label: "Back to Knowledge", onBack: () => {
          // A host's lesson is edited in the page: leaving asks before dropping unsaved words.
          void (async () => {
            if (lessonDirtyRef.current && !(await askInApp({ message: "Leave this lesson without saving your changes?", yes: "Discard changes", no: "Keep editing", danger: true }))) return;
            resources.actions.handleSelectModule(null);
          })();
        } }
          : inGuideMemory ? { label: "Back to Knowledge", onBack: () => setGuideMemoryOpen(false) }
            : inBrain ? { label: "Back to Knowledge", onBack: () => setBrainOpen(false) } : null}>
        <div className="community-knowledge-header"><h1>Knowledge</h1></div>
      </CommunityPageHeader>
        {inBrain ? (
          <KitBrainPage session={context.session} communityId={context.communityId!} canManage={canManage}
            content={{ courses: resources.state.modules, lessons: resources.state.resources,
              community: { oneLiner: context.communityOneLiner ?? null, about: context.communityAbout ?? null } }}
            onOpenCourse={(courseId) => { resources.actions.handleSelectModule(courseId); }} />
        ) : null}
        {inBrain ? null : <KitClassroom communityId={context.communityId!}
          onOpenBrain={() => setBrainOpen(true)} communityName={context.communityName ?? "This community"} session={context.session}
          modules={resources.state.modules} resources={resources.state.resources}
          loaded={resources.state.moduleRead.hasData && resources.state.resourceRead.hasData}
          // The app's own lens ("View as a member" turns it off); the server
          // still decides who may write.
          canManage={canManage}
          onLessonDirtyChange={(dirty) => { lessonDirtyRef.current = dirty; }}
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
              // The cover is sent only when it changed; framing-only edits skip re-uploading.
              const cover = patch.cover.kind === "keep" ? {}
                : patch.cover.kind === "remove" ? { banner_storage_id: null, banner_url: null }
                  : patch.cover.kind === "frame" ? {
                    banner_focus_x: patch.cover.focusX,
                    banner_focus_y: patch.cover.focusY,
                    banner_zoom: patch.cover.zoom,
                  }
                    : { banner_storage_id: (await prepareCloudCommunityBrandingField({ session: context.session, kind: "banner", nextValue: patch.cover.dataUrl })).storageId ?? null,
                      banner_url: null, banner_focus_x: patch.cover.focusX ?? 0.5, banner_focus_y: patch.cover.focusY ?? 0.5, banner_zoom: patch.cover.zoom ?? 1 };
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
          renderRail={(rail) => <CommunityPageRail label="Knowledge">{rail}</CommunityPageRail>} />}
    </section>
  );
}
