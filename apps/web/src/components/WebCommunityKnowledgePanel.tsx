import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { Maximize2, Minimize2, Pencil, Plus } from "lucide-react";
import { WebPlatformTabList, platformTabId, platformTabPanelId } from "./WebPlatformChoiceControls";
import { CommunityResourcesPanel } from "./CommunityResourcesPanel";
import { createServerCommunityEmbedStorage } from "../../../../shared/cloudCommunityEmbedValuesGateway";
import { createBrowserCommunityEmbedStorage } from "../../../../shared/communityEmbedUi";
import { CommunityMemoryGraph } from "./CommunityMemoryGraph";
import { WebCommunityLessonBoard, communityBoardLessons, type RoadmapEditing, type RoadmapTrackAbout } from "./WebCommunityLessonBoard";
import { updateCloudCommunityLessonBoard } from "../../../../shared/cloudCommunityAdminGateway";
import { resolveUsableSession } from "../../../../shared/ensureUsableSession";
import { useWebCommunityLessonProgress } from "../controllers/useWebCommunityLessonProgress";
import {
  WebCommunityTrackEditor,
  WebCommunityTrackHeader,
  WebCommunityTrackHome,
  WebCommunityTrackLocked,
  WebCommunityTrackOpens,
  communityTrackResources,
  communityTrackStagesAfterBoardSave,
  type CommunityTrackOfferAccess,
} from "./WebCommunityTracks";
import {
  communityOfferUpgradeErrorMessage,
  fetchCloudCommunityVisitorOffers,
  formatCommunityOfferPrice,
  startCloudCommunityOfferUpgrade,
  type CommunityVisitorOffers,
} from "../../../../shared/cloudCommunityOffersGateway";
import { COMMUNITY_MAIN_TRACK_KEY } from "../../../../shared/communityLessonTracks";
import { fetchCloudCommunityLessonTracks, saveCloudCommunityLessonTrack } from "../../../../shared/cloudCommunityLessonTracksGateway";
import { computeCommunityCourseProgress } from "../../../../shared/communityCourseProgress";
import type { WebLessonActivity } from "./WebCommunityResourceViewerContent";
import type { AuthSession } from "../auth";
import type { WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { WebCommunitySettingsSection } from "./WebCommunitySettingsSection";
import { useWebCommunityPolynetController } from "../controllers/useWebCommunityPolynetController";
import "./WebCommunityKnowledgePanel.css";

// Bars that keep Messages, Display and Settings: Channels' top bar,
// Classroom's identity row, and the phone's top bar.
const LESSON_FOCUS_KEEP_BARS = ".app-topbar, .community-top-nav-identity, .mobile-topbar";

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

type KnowledgeView = "resources" | "board" | "graph";

export function WebCommunityKnowledgePanel({ resources, context }: Props) {
  const [view, setView] = useState<KnowledgeView>("resources");
  useEffect(() => { setView((current) => (current === "graph" ? "resources" : current)); }, [resources.state.selectedModuleId]);
  const canManage = resources.capabilities.canOperateResources;
  // One progress read feeds the Roadmap, its skill tracks and the course cards.
  const progress = useWebCommunityLessonProgress({
    communityId: context.communityId,
    session: context.session ?? null,
  });
  const tracks = progress.tracks;
  // The Roadmap (view id "board") shows when the community has lesson pages with a
  // stage or skill tracks, and always to owners so they can start one.
  const hasBoard = useMemo(
    () => canManage || tracks.length > 0 || communityBoardLessons(resources.state.resources).length > 0,
    [canManage, tracks.length, resources.state.resources],
  );
  // With several tracks the Roadmap opens on the tracks home; with one, on its board.
  const [trackKey, setTrackKey] = useState<string | null>(null);
  const [trackEditor, setTrackEditor] = useState<{ key: string | null } | null>(null);
  // A lesson open on the Roadmap lays the page out for reading, like Resources.
  const [roadmapReading, setRoadmapReading] = useState(false);
  const [roadmapLessonOpen, setRoadmapLessonOpen] = useState(false);
  const activeTrack = tracks.length === 1 ? tracks[0] : tracks.find((track) => track.key === trackKey) ?? null;
  // A lesson to open on the board from outside it (the free preview, "Go to the next lesson").
  const [openRequest, setOpenRequest] = useState<{ ref: string; key: number } | null>(null);
  const openLesson = (key: string, resourceId: string) => {
    setTrackKey(key);
    setOpenRequest({ ref: `resource:${resourceId}`, key: Date.now() });
  };
  const trackLocks = useMemo(
    () => new Set(activeTrack?.stages.flatMap((stage) => stage.steps.filter((step) => step.locked).map((step) => step.ref)) ?? []),
    [activeTrack],
  );
  // Sold tracks: the offers' prices, and moving a member up to the one that includes the track.
  const offerAccess = useTrackOfferAccess(context.communityId, (context.session ?? null) as AuthSession | null, tracks.some((track) => track.paid), progress.reload);
  const boardResources = useMemo(
    () => (activeTrack ? communityTrackResources(resources.state.resources, activeTrack) : resources.state.resources),
    [activeTrack, resources.state.resources],
  );
  // "Edit lesson" on the Roadmap opens that lesson in the Resources editor.
  const [editRequest, setEditRequest] = useState<{ resourceId: string; key: number } | null>(null);
  const { session: rawSession, ensureSession, communityId } = context;
  const { retryRead, handleCreateBlankPageDraft } = resources.actions;
  const resourceList = resources.state.resources;
  const firstModuleId = resources.state.modules[0]?.id ?? null;
  const reloadProgress = progress.reload;
  const roadmapEditing = useMemo<RoadmapEditing | null>(() => {
    if (!canManage || !rawSession || !communityId) return null;
    // Every track but the main roadmap keeps its stages in the track itself, so
    // board edits there save the track (the same save as the track editor).
    if (activeTrack && activeTrack.key !== COMMUNITY_MAIN_TRACK_KEY) {
      const track = activeTrack;
      const saveStages = async (change: (stages: ReturnType<typeof communityTrackStagesAfterBoardSave>) => ReturnType<typeof communityTrackStagesAfterBoardSave>, updates: Parameters<typeof communityTrackStagesAfterBoardSave>[1]) => {
        const usable = await resolveUsableSession(rawSession as AuthSession, ensureSession);
        if (!usable) return false;
        try {
          const current = (await fetchCloudCommunityLessonTracks({ session: usable, communityId })).tracks.find((row) => row.key === track.key);
          if (!current) return false;
          await saveCloudCommunityLessonTrack({
            session: usable, communityId, key: track.key, expectedRevision: current.revision, title: current.title,
            opensWhen: current.opens_when, stages: change(communityTrackStagesAfterBoardSave(current.stages, updates)),
          });
        } catch {
          return false;
        }
        reloadProgress();
        return true;
      };
      return {
        save: (updates) => saveStages((stages) => stages, updates),
        // A new lesson starts in the course of a lesson near it, and joins only this track.
        addLesson: async ({ stage, order, nearResourceId }) => {
          const moduleId = resourceList.find((resource) => resource.id === nearResourceId)?.module_id ?? firstModuleId;
          if (!moduleId) return null;
          const created = await handleCreateBlankPageDraft(moduleId);
          if (!created) return null;
          await saveStages((stages) => stages, [{ resourceId: created.id, stage, order }]);
          return created;
        },
        editLesson: (resource) => {
          setView("resources");
          setEditRequest({ resourceId: resource.id, key: Date.now() });
        },
      };
    }
    return {
      save: async (updates) => {
        const usable = await resolveUsableSession(rawSession as AuthSession, ensureSession);
        if (!usable) return false;
        try {
          await updateCloudCommunityLessonBoard({ session: usable, communityId, updates });
        } catch {
          return false;
        }
        await retryRead("resources");
        return true;
      },
      // A new lesson joins the course of a lesson already in its stage.
      addLesson: async ({ stage, stageOrder, order, nearResourceId }) => {
        const moduleId = resourceList.find((resource) => resource.id === nearResourceId)?.module_id ?? firstModuleId;
        if (!moduleId) return null;
        return handleCreateBlankPageDraft(moduleId, { order, stage, stage_order: stageOrder });
      },
      editLesson: (resource) => {
        setView("resources");
        setEditRequest({ resourceId: resource.id, key: Date.now() });
      },
    };
  }, [canManage, rawSession, ensureSession, communityId, retryRead, handleCreateBlankPageDraft, resourceList, firstModuleId, activeTrack, reloadProgress]);
  // Graph is an owner's tool: to a member it's unlabelled dots.
  const showGraph = context.canViewGraph && canManage;
  const graphOpen = view === "graph" && showGraph;
  const boardOpen = view === "board" && hasBoard;
  const activeView: KnowledgeView = graphOpen ? "graph" : boardOpen ? "board" : "resources";
  const courseProgress = useMemo(
    () =>
      progress.loaded
        ? computeCommunityCourseProgress({
          lessons: resources.state.resources,
          statusByRef: progress.statusByRef,
          courseTitles: Object.fromEntries(resources.state.modules.map((module) => [module.id, module.name])),
        })
        : undefined,
    [progress.loaded, progress.statusByRef, resources.state.resources, resources.state.modules],
  );
  const session = context.session as AuthSession | null;
  const embedStorage = useMemo(
    () => session && context.communityId
      ? createServerCommunityEmbedStorage({
          communityId: context.communityId,
          ensureSession: () => context.ensureSession(session),
          // Per member: another account in this browser never sees these answers.
          fallback: createBrowserCommunityEmbedStorage(`${context.communityId}:user:${session.user.id}`),
        })
      : null,
    [session, context.communityId, context.ensureSession],
  );
  const lessonActivity = useMemo<WebLessonActivity>(() => ({
    progress,
    embedStorage,
    signedIn: Boolean(context.session),
    onRequireSignIn: context.requireSignIn,
    forms: context.session && context.communityId
      ? { communityId: context.communityId, session: context.session as AuthSession, ensureSession: context.ensureSession }
      : null,
  }), [progress, embedStorage, context.session, context.communityId, context.ensureSession, context.requireSignIn]);
  // The views are chips, like the channel chips in Classroom.
  const chip = "community-category-chip";
  const tabs: { id: KnowledgeView; label: string; buttonClassName: string }[] = [
    { id: "resources", label: "Resources", buttonClassName: chip },
    ...(hasBoard ? [{ id: "board" as const, label: "Roadmap", buttonClassName: chip }] : []),
    ...(showGraph ? [{ id: "graph" as const, label: "Graph", buttonClassName: chip }] : []),
  ];
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
  // Each course reads as an Article or a Video course; the owner picks in Edit course.
  const readingLessonStyle = activeView === "resources" && resources.state.selectedModuleId
    ? (resources.state.modules.find((module) => module.id === resources.state.selectedModuleId)?.lesson_style === "video" ? "video" : "article")
    : undefined;
  const reading = Boolean((activeView === "resources" && resources.state.selectedModuleId) || (boardOpen && roadmapReading));
  const trackAbout: RoadmapTrackAbout | undefined = activeTrack && (activeTrack.open || !activeTrack.paid) ? {
    eyebrow: activeTrack.key === COMMUNITY_MAIN_TRACK_KEY ? "Core track" : "Skill track",
    summary: activeTrack.summary,
    outcomes: activeTrack.outcomes,
    audience: activeTrack.audience,
    onAllTracks: tracks.length > 1 ? () => setTrackKey(null) : undefined,
    actions: canManage ? (
      <>
        <button type="button" className="lesson-journey-edit" onClick={() => setTrackEditor({ key: activeTrack.key })}><Pencil size={14} aria-hidden="true" /> Edit track</button>
        {tracks.length === 1 ? <button type="button" className="lesson-journey-edit" onClick={() => setTrackEditor({ key: null })}><Plus size={14} aria-hidden="true" /> New track</button> : null}
      </>
    ) : undefined,
    footer: <WebCommunityTrackOpens track={activeTrack} tracks={tracks} onOpenTrack={setTrackKey} />,
  } : undefined;
  // Focus mode is for reading a lesson, not a track's own page.
  const lessonOpen = Boolean((activeView === "resources" && resources.state.selectedModuleId) || (boardOpen && roadmapLessonOpen));
  // Resources · Roadmap · Graph belong to Knowledge's main view; inside a
  // course, lesson or track they step aside, and a lesson
  // offers Focus mode in their place.
  const insideKnowledge = reading || Boolean(boardOpen && activeTrack && tracks.length > 1);
  const [focus, setFocus] = useState(false);
  const focusOn = focus && lessonOpen;
  useEffect(() => {
    if (!lessonOpen) setFocus(false);
  }, [lessonOpen]);
  useEffect(() => {
    if (!focusOn) return;
    const root = document.documentElement;
    root.dataset.lessonFocus = "on";
    // The page lifts over the community's rails but stops under the bar that
    // holds Messages, Display and Settings, so those stay in reach
    //.
    const placeUnderBar = () => {
      let top = 0;
      for (const bar of document.querySelectorAll<HTMLElement>(LESSON_FOCUS_KEEP_BARS)) {
        if (getComputedStyle(bar).visibility === "hidden") continue;
        const rect = bar.getBoundingClientRect();
        if (rect.height > 0) top = Math.max(top, rect.bottom);
      }
      root.style.setProperty("--lesson-focus-top", `${Math.max(0, Math.round(top))}px`);
    };
    placeUnderBar();
    window.addEventListener("resize", placeUnderBar);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      delete root.dataset.lessonFocus;
      root.style.removeProperty("--lesson-focus-top");
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", placeUnderBar);
    };
  }, [focusOn]);
  return (
    <section
      className="community-knowledge-page"
      aria-label="Knowledge"
      data-reading={reading ? "" : undefined}
      data-focus={focusOn ? "" : undefined}
      data-lesson-style={readingLessonStyle}
    >
      <div className="community-knowledge-header">
        <h1>Knowledge</h1>
        {lessonOpen ? (
          <button
            type="button"
            className="community-knowledge-focus-button"
            aria-pressed={focusOn}
            onClick={() => setFocus(!focusOn)}
            title={focusOn ? "Bring back the course outline and menus (Esc)" : "Hide everything but the lesson"}
          >
            {focusOn ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            <span>{focusOn ? "Exit focus" : "Focus mode"}</span>
          </button>
        ) : null}
        {insideKnowledge ? null : (
          <WebPlatformTabList
            tabs={tabs}
            activeTab={activeView}
            onSelectTab={setView}
            ariaLabel="Knowledge view"
            idPrefix="community-knowledge"
            className="community-knowledge-views"
          />
        )}
      </div>
      <div hidden={activeView !== "resources"} role="tabpanel" id={platformTabPanelId("community-knowledge", "resources")} aria-labelledby={platformTabId("community-knowledge", "resources")}>
        <CommunityResourcesPanel {...resources} courseProgress={courseProgress} lessonActivity={lessonActivity} editRequest={editRequest}
          memberViewOffered={activeView === "resources"} />
      </div>
      {boardOpen ? (
        <div className="lesson-board-panel" role="tabpanel" id={platformTabPanelId("community-knowledge", "board")} aria-labelledby={platformTabId("community-knowledge", "board")}>
          {tracks.length > 1 && !activeTrack ? (
            <WebCommunityTrackHome
              tracks={tracks}
              offer={offerAccess}
              onOpenTrack={setTrackKey}
              canManage={canManage}
              onNewTrack={() => setTrackEditor({ key: null })}
              onEditTrack={(key) => setTrackEditor({ key })}
            />
          ) : activeTrack && !activeTrack.open && !activeTrack.paid ? (
            <>
              <WebCommunityTrackHeader
                tracks={tracks}
                track={activeTrack}
                onPick={setTrackKey}
                onHome={() => setTrackKey(null)}
                onEdit={canManage ? () => setTrackEditor({ key: activeTrack.key }) : undefined}
              />
              <WebCommunityTrackLocked
                track={activeTrack}
                onGoTo={(resourceId) => {
                  const home = tracks.find((track) => track.open && track.stages.some((stage) => stage.steps.some((step) => step.resource_id === resourceId)));
                  if (home) openLesson(home.key, resourceId);
                }}
              />
            </>
          ) : (
            <>
              <WebCommunityLessonBoard
                resources={boardResources}
                progress={progress}
                signedIn={Boolean(context.session)}
                onRequireSignIn={context.requireSignIn}
                lessonActivity={lessonActivity}
                editing={roadmapEditing}
                title={activeTrack?.title}
                onReadingChange={setRoadmapReading}
                onLessonOpenChange={setRoadmapLessonOpen}
                about={trackAbout}
                extraLocked={trackLocks}
                openRequest={openRequest}
                // A sold track keeps its sales page; every open track opens like a course.
                header={activeTrack && !trackAbout && (tracks.length > 1 || canManage || activeTrack.paid) ? (
                  <WebCommunityTrackHeader
                    tracks={tracks}
                    track={activeTrack}
                    onPick={setTrackKey}
                    onHome={() => setTrackKey(null)}
                    onEdit={canManage ? () => setTrackEditor({ key: activeTrack.key }) : undefined}
                    onNewTrack={canManage && tracks.length === 1 ? () => setTrackEditor({ key: null }) : undefined}
                    offer={offerAccess}
                    onPreview={activeTrack.paid?.preview ? () => openLesson(activeTrack.key, activeTrack.paid!.preview!.resource_id) : undefined}
                  />
                ) : undefined}
              />
              {activeTrack && !trackAbout && !roadmapReading ? <WebCommunityTrackOpens track={activeTrack} tracks={tracks} onOpenTrack={setTrackKey} /> : null}
            </>
          )}
          {trackEditor && context.session && context.communityId ? (
            <WebCommunityTrackEditor
              session={context.session}
              communityId={context.communityId}
              trackKey={trackEditor.key}
              onClose={() => setTrackEditor(null)}
              onSaved={progress.reload}
            />
          ) : null}
        </div>
      ) : null}
      {graphOpen ? <div className="community-knowledge-graph" role="tabpanel" id={platformTabPanelId("community-knowledge", "graph")} aria-labelledby={platformTabId("community-knowledge", "graph")}><CommunityMemoryGraph activeCommunityName={context.communityName} state={graph.state} onRefresh={graph.actions.refresh} /></div> : null}
    </section>
  );
}

function useTrackOfferAccess(
  communityId: string | null,
  session: AuthSession | null,
  needed: boolean,
  onUpgraded: () => void,
): CommunityTrackOfferAccess | null {
  const [offers, setOffers] = useState<CommunityVisitorOffers | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!needed || !communityId) return;
    let live = true;
    void fetchCloudCommunityVisitorOffers({ session, communityId })
      .then((next) => { if (live) setOffers(next); })
      .catch(() => { if (live) setOffers(null); });
    return () => { live = false; };
  }, [needed, communityId, session]);
  const upgrade = useCallback(async (offerKey: string) => {
    if (!session || !communityId) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await startCloudCommunityOfferUpgrade({ session, communityId, offerKey });
      if (result.status === "upgraded") {
        setNote("It's on your plan now. Everything in this track is open.");
        onUpgraded();
      } else if (result.status === "payment_needed") {
        if (result.invoice_url) window.location.assign(result.invoice_url);
        else setNote("Your card needs a quick check. Pay the invoice we just emailed you, and the track opens.");
      } else {
        // Not paying through Polynet yet: the sales page's offer picker checks them out.
        const slug = window.location.pathname.match(/^\/c\/([^/]+)/)?.[1];
        if (slug) window.location.assign(`/c/${slug}/preview#offers`);
      }
    } catch (error) {
      setNote(communityOfferUpgradeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [session, communityId, onUpgraded]);
  if (!needed) return null;
  return {
    priceFor: (offerKey) => {
      const offer = offers?.offers.find((candidate) => candidate.key === offerKey);
      return offer?.prices[0] ? formatCommunityOfferPrice(offer.prices[0]) : null;
    },
    upgrade: (offerKey) => { void upgrade(offerKey); },
    busy,
    note,
  };
}
