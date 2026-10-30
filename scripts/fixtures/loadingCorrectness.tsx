import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { WebCommunityRail } from "../../apps/web/src/components/WebCommunityRail";
import { useWebCommunityNavigationActions } from "../../apps/web/src/controllers/useWebCommunityNavigationActions";
import { useWebCommunityRouteController } from "../../apps/web/src/controllers/useWebCommunityRouteController";
import { useWebProfileSettingsUiController } from "../../apps/web/src/controllers/useWebProfileSettingsUiController";
import { useWebFounderBillingController } from "../../apps/web/src/controllers/useWebFounderBillingController";
import { useCommunityEventsController } from "../../shared/useCommunityEventsController";
import { useWebCommunityContentController } from "../../apps/web/src/controllers/useWebCommunityContentController";
import { UserAvatar } from "../../shared/UserAvatar";
import { useCommunityAdminController } from "../../shared/useCommunityAdminController";
import { WebProfileSettingsSection } from "../../apps/web/src/components/WebProfileSettingsSection";
import { WebCommunityEventsSection } from "../../apps/web/src/components/WebCommunityEventsSection";
import type { CommunityEvent } from "../../apps/web/src/components/communityEventsContracts";
import { CommunityResourcesPanel } from "../../apps/web/src/components/CommunityResourcesPanel";
import { dispatchCommunityResourcesMutated } from "../../shared/communityResourceMutationEvents";
import { useCommunityEventClock } from "../../shared/useCommunityEventClock";
import "../../apps/web/src/index.css";

const root = createRoot(document.getElementById("root")!);
const tick = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const session = (id: string) => ({ user: { id } });
const profile = {
  display_name: "Ada",
  handle: "ada",
  bio: "Original bio",
  avatar_url: null,
  social_links: { youtube: "", x: "", instagram: "" },
};
let pending: Array<ReturnType<typeof deferred> & { kind: string; args: any }> =
  [];
(window as any).fixtureRequest = (kind: string, args: any) => {
  const request = { ...deferred(), kind, args };
  pending.push(request);
  return request.promise;
};

async function mountHook(
  useHook: (props: any) => any,
  initial: any,
  render?: (value: any) => React.ReactNode,
) {
  let value: any;
  const Component = (props: any) => {
    value = useHook(props);
    return render?.(value) ?? null;
  };
  const update = async (props: any) => {
    flushSync(() => root.render(<Component {...props} />));
    await tick();
  };
  await update(initial);
  return {
    get value() {
      return value;
    },
    update,
  };
}

const eventRange = {
  startIso: new Date(2026, 8, 1).toISOString(),
  endIso: new Date(2026, 9, 1).toISOString(),
};

const agendaNow = new Date(2026, 8, 20, 12).getTime();
const agendaEvent = (id: string, day: number, hour = 14): CommunityEvent => {
  const start = new Date(2026, 8, day, hour).toISOString();
  const end = new Date(2026, 8, day, hour + 1).toISOString();
  return {
    id, parent_event_id: id, community_id: "preview", title: id, status: "live", description_md: "Building and monetizing agents",
    starts_at: start, ends_at: end, starts_at_zoned: start, ends_at_zoned: end,
    series_starts_at: start, series_ends_at: end, created_at: start, updated_at: start,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, visibility: "members",
    recurrence_frequency: "none", recurrence_interval: 1, recurrence_until: null, is_recurring_instance: false,
    url: "https://example.test/call", location_type: "online", location_label: "Online community call",
  };
};
const agendaRows = [
  ...Array.from({ length: 12 }, (_, i) => agendaEvent(`Community call ${i + 1}`, i + 1)),
  agendaEvent("Morning workshop", 20, 9),
  agendaEvent("Builder Q&A", 20, 12),
  agendaEvent("Community showcase", 20, 16),
  agendaEvent("Weekly community call", 25),
];
function AgendaFixture(props: { rows?: CommunityEvent[]; loading?: boolean; error?: string | null }) {
  const [month, setMonth] = useState(new Date(2026, 8, 1).toISOString());
  return <div style={{ height: 620, width: 900, maxWidth: "100%", display: "flex", flexDirection: "column", margin: "0 auto", background: "var(--bg-panel)" }}>
    {/* Same scroll host as WebCommunitySecondaryPanels.renderCenteredPane. */}
    <div className="community-tab-scroll"><div className="web-community-centered-pane">
    <WebCommunityEventsSection {...{
        capabilities: { hasActiveCommunity: true, activeCommunityName: "Preview community", canManageEvents: true },
        state: { events: props.rows ?? agendaRows, visibleMonthIso: month, isLoadingEvents: props.loading ?? false, hasLoadedVisibleRange: !props.loading, eventsError: props.error ?? null },
        actions: { setVisibleMonthIso: setMonth, getVisibleRange: () => eventRange, reloadEvents: async () => {}, saveEvent: async () => false, cancelEvent: async () => false },
    }} />
    </div></div>
  </div>;
}
(window as any).showEventsAgendaVisual = () => {
  const busy = new URLSearchParams(window.location.search).get("events-preview") === "busy";
  Date.now = () => busy ? agendaNow : new Date(2026, 8, 5, 12).getTime();
  flushSync(() => root.render(<AgendaFixture rows={busy ? agendaRows : [4, 11, 18, 25].map((day) => agendaEvent("Weekly community call " + day, day))} />));
};
function useEventsHarness(props: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    rows,
    loaded,
    loading,
    error,
    ...useCommunityEventsController({
      ...props,
      setCommunityEvents: (next: any) => {
        setRows(next);
        setLoaded(true);
      },
      setIsLoadingCommunityEvents: setLoading,
      setCommunityEventsError: setError,
    }),
  };
}
function renderEvents(value: any) {
  return (
    <WebCommunityEventsSection
      capabilities={{
        hasActiveCommunity: true,
        activeCommunityName: "Test",
        canManageEvents: false,
      }}
      state={{
        events: value.rows,
        hasLoadedVisibleRange: value.loaded,
        isLoadingEvents: value.loading,
        eventsError: value.error,
        visibleMonthIso: value.eventsVisibleMonthIso ?? eventRange.startIso,
      }}
      actions={{
        setVisibleMonthIso: () => {},
        getVisibleRange: () => value.eventsVisibleRange ?? eventRange,
        reloadEvents: value.reloadActiveEvents ?? ((range) =>
          value.loadCommunityEvents("c", session("a"), range)),
        saveEvent: async () => false,
        cancelEvent: async () => false,
      }}
    />
  );
}

function useWebEventsHarness(props: any) {
  const content = useWebCommunityContentController({
    ...props,
    // Isolate explicit Retry from automatic tab-entry reads, retaining the real
    // production content controller, cache and rendered Events section.
    activePage: "community",
    communityTab: "chat",
    getSession: () => props.session,
  });
  return {
    ...content,
    rows: content.events,
    loaded: content.hasLoadedVisibleEventsRange,
    loading: content.isLoadingEvents,
    error: content.eventsError,
  };
}

const courseFixture = { id: "course", name: "Test course", module_status: "draft", description_md: "Course description", banner_url: null, banner_focus_x: 0.5, banner_focus_y: 0.5, banner_zoom: 1, sort_order: 0 };
const lessonFixture = { id: "lesson", module_id: "course", type: "post", resource_role: "page", resource_status: "published", title: "Test lesson", body_md: "Original lesson", body_chars: 15, url: null, pinned: false, sort_order: 0, created_at: new Date().toISOString() };
function useResourcesHarness(props: any) {
  const content = useWebCommunityContentController({ ...props, activePage: "community", communityTab: "resources", getSession: () => props.session });
  const [selected, setSelected] = useState<string | null>(null);
  return { ...content, selected, setSelected };
}
function renderResources(value: any) {
  return <CommunityResourcesPanel capabilities={{hasActiveCommunity:true,activeCommunityId:"c",activeCommunityName:"Test",canOperateResources:true}}
    state={{resources:value.resources,modules:value.modules,isLoadingResources:value.isLoadingResources,isLoadingResourceModules:value.isLoadingModules,
      resourceRead:value.resourceRead,moduleRead:value.moduleRead,selectedModuleId:value.selected}}
    actions={{...value,handleSelectModule:value.setSelected,retryRead:value.retryResourceRead}} />;
}

function renderProfile(value: any) {
  return (
    <main className="settings-panel" style={{ padding: 40 }}>
      <WebProfileSettingsSection
        {...value.ui}
        session={session("a")}
        cloudProfile={value.cloudProfile}
        handleProfileAvatarDrop={() => {}}
        handleProfileAvatarUpload={() => {}}
        getInitials={() => "AD"}
        onRemoveProfileAvatar={() => {}}
        saveProfileToCloud={value.admin.saveProfileToCloud}
      />
    </main>
  );
}

function useProfileHarness(props: any) {
  const [cloudProfile, setCloudProfile] = useState<any>({
    ...profile,
    user_id: "a",
  });
  const [profiles, setProfilesByUserId] = useState({});
  const ui = useWebProfileSettingsUiController({
    profileStorageUserId: props.session?.user.id ?? null,
    initialProfileDraft: { name: "", handle: "", bio: "" },
    session: props.session,
    cloudProfile,
  });
  const admin = useCommunityAdminController({
    ...ui,
    ...props,
    activeCommunityId: "c",
    setCloudProfile,
    setProfilesByUserId,
    getProfileSaveSession: () => props.session,
    profileSaveFailureMessage: "Save failed",
  } as any);
  return { ui, admin, cloudProfile, profiles };
}

(window as any).runLoadingProof = async (baseline = false) => {
  const results: Array<{ name: string; error?: string }> = [];
  async function test(name: string, run: () => Promise<void>) {
    pending = [];
    try {
      await run();
      results.push({ name });
    } catch (error) {
      results.push({ name, error: String(error) });
    } finally {
      flushSync(() => root.render(null));
      await tick();
    }
  }
  for (const kind of ["global_settings", "discover", "community_events"] as const) {
    for (const target of ["alpha", "beta"]) {
      await test(`desktop rail ${kind} to ${target} preserves canonical navigation`, async () => {
        const communities = ["alpha", "beta"].map(id => ({ id, slug: id, name: id, avatar_url: null }));
        const snapshots: any[] = [];
        const hook = await mountHook(() => {
          const [state, setState] = useState<any>({ activePage: kind === "global_settings" ? "settings" : kind === "discover" ? "discover" : "community", activeView: "home", communityTab: "events", activeCommunityId: "alpha", activeCommunitySlug: "alpha" });
          const route = useWebCommunityRouteController({
            ...state, communities, navigateTo: () => { throw new Error("unexpected public route"); },
            pushNavSnapshot: () => snapshots.push({ ...state }),
            setActivePage: (activePage: any) => setState((s: any) => ({ ...s, activePage })),
            setActiveView: (activeView: any) => setState((s: any) => ({ ...s, activeView })),
            applyCommunityShellState: (patch: any) => setState((s: any) => ({ ...s,
              ...(patch.communitySlug ? { activeCommunitySlug: patch.communitySlug, activeCommunityId: patch.communitySlug } : {}),
              ...(patch.communityTab ? { communityTab: patch.communityTab } : {}),
            })),
          });
          const actions = useWebCommunityNavigationActions({
            communities, selectedActiveCommunityId: state.activeCommunityId,
            communitySettingsDirtyRef: { current: false }, communityAgentConfigDirtyRef: { current: false },
            syncCommunitySelection: route.syncCommunitySelection,
          } as any);
          return { state, setState, shell: {
            showDesktopCommunityRail: true, destination: { kind }, railCommunities: communities,
            selectedActiveCommunitySlug: state.activeCommunitySlug, getCommunityRailItemBindings: () => ({}),
            communityRailAttentionById: {}, onSelectActiveCommunity: actions.handleSelectActiveCommunity,
            onOpenCommunityChat: route.openCommunityChat,
          } };
        }, {}, value => <WebCommunityRail presentation="desktop" communityShell={value.shell as any} />);
        (document.querySelector(`button[title="${target}"]`) as HTMLButtonElement).click();
        await tick();
        assert(hook.value.state.activeCommunityId === target, "selected requested community");
        if (kind === "community_events") {
          assert(hook.value.state.communityTab === "events" && snapshots.length === 0, "existing community tab remains unchanged");
        } else {
          assert(hook.value.state.activePage === "community" && hook.value.state.communityTab === "chat", "rail leaves global surface for chat");
          assert(snapshots.length === 1, "exactly one navigation snapshot");
          assert(snapshots[0].activeCommunityId === "alpha", "snapshot retains pre-click selection");
          flushSync(() => hook.value.setState(snapshots.pop()));
          await tick();
          assert(hook.value.state.activePage === (kind === "global_settings" ? "settings" : "discover"), "snapshot restores source page");
        }
      });
    }
  }
  await test("desktop rail rejected discard changes neither selection nor route", async () => {
    const originalConfirm = window.confirm;
    let selections = 0;
    let opens = 0;
    window.confirm = () => false;
    try {
      await mountHook(() => {
        const actions = useWebCommunityNavigationActions({
          selectedActiveCommunityId: "alpha", communitySettingsDirtyRef: { current: true },
          communityAgentConfigDirtyRef: { current: false }, syncCommunitySelection: () => selections++,
        } as any);
        return { showDesktopCommunityRail: true, destination: { kind: "global_settings" },
          railCommunities: [{ id: "beta", slug: "beta", name: "beta", avatar_url: null }],
          getCommunityRailItemBindings: () => ({}), communityRailAttentionById: {},
          onSelectActiveCommunity: actions.handleSelectActiveCommunity, onOpenCommunityChat: () => opens++,
        };
      }, {}, shell => <WebCommunityRail presentation="desktop" communityShell={shell as any} />);
      (document.querySelector('button[title="beta"]') as HTMLButtonElement).click();
      await tick();
      assert(selections === 0 && opens === 0, "discard rejection is inert");
    } finally { window.confirm = originalConfirm; }
  });
  await test("late billing result cannot repopulate a signed-out account", async () => {
    const props = {
      session: session("a"),
      ensureSession: async (s: any) => s,
      operatorComplimentaryAccess: false,
    };
    const hook = await mountHook(useWebFounderBillingController as any, props);
    assert(pending.length === 1, "one billing request");
    await hook.update({ ...props, session: null });
    pending[0].resolve({ communities: [{ community_id: "private-a" }] });
    await tick();
    assert(
      hook.value.overview.communities.length === 0,
      "old account result leaked after logout",
    );
    assert(!hook.value.isLoading, "stale request changed loading");
  });
  await test("event request order is intent order, not session resolution order", async () => {
    const ensures: Array<ReturnType<typeof deferred>> = [];
    const ensureSession = () => {
      const d = deferred();
      ensures.push(d);
      return d.promise;
    };
    const hook = await mountHook(
      (props) => {
        const [rows, setRows] = useState<any[]>([]);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);
        return {
          rows,
          loading,
          error,
          ...useCommunityEventsController({
            ...props,
            setCommunityEvents: setRows,
            setIsLoadingCommunityEvents: setLoading,
            setCommunityEventsError: setError,
          }),
        };
      },
      { activeCommunityId: "c", session: session("a"), ensureSession },
    );
    void hook.value.loadCommunityEvents("c", session("a"), {
      startIso: "old",
      endIso: "old-end",
    });
    void hook.value.loadCommunityEvents("c", session("a"), {
      startIso: "new",
      endIso: "new-end",
    });
    ensures[1].resolve(session("a"));
    await tick();
    ensures[0].resolve(session("a"));
    await tick();
    pending.find((r) => r.args.startIso === "new")!.resolve([{ id: "new" }]);
    await tick();
    pending.find((r) => r.args.startIso === "old")?.resolve([{ id: "old" }]);
    await tick();
    assert(
      hook.value.rows[0]?.id === "new",
      "older intent overwrote newer event range",
    );
    assert(!hook.value.loading, "event loading did not settle");
  });
  await test("profile hydration preserves intentionally cleared fields and crop edits", async () => {
    const hook = await mountHook(useWebProfileSettingsUiController as any, {
      profileStorageUserId: "a",
      initialProfileDraft: { name: "", handle: "", bio: "" },
      session: session("a"),
      cloudProfile: profile,
    });
    flushSync(() => hook.value.applyLoadedProfileToLocal(profile));
    flushSync(() => {
      hook.value.setProfileBio("");
      hook.value.setProfileAvatarFocusX(0.8);
    });
    flushSync(() =>
      hook.value.applyLoadedProfileToLocal({ ...profile, avatar_focus_x: 0.2 }),
    );
    assert(
      hook.value.profileBio === "",
      "late hydration refilled a cleared bio",
    );
    assert(
      hook.value.profileAvatarFocusX === 0.8,
      "late hydration reset edited crop",
    );
  });
  await test("profile draft cannot cross directly between signed-in accounts", async () => {
    const props = {
      profileStorageUserId: "a",
      initialProfileDraft: { name: "", handle: "", bio: "" },
      session: session("a"),
      cloudProfile: profile,
    };
    const hook = await mountHook(
      useWebProfileSettingsUiController as any,
      props,
    );
    flushSync(() => hook.value.setProfileBio("Private draft"));
    const oldAccountSetter = hook.value.setProfileBio;
    await hook.update({
      ...props,
      profileStorageUserId: "b",
      session: session("b"),
      cloudProfile: null,
    });
    flushSync(() => oldAccountSetter("Late result from account A"));
    assert(hook.value.profileBio === "", "draft from account A persisted in B");
  });
  await test("unresolved avatars do not show colored initials", async () => {
    flushSync(() =>
      root.render(
        <UserAvatar
          name="Ada"
          imageUrl={undefined}
          className="test-avatar"
          fallbackStyle={{ backgroundColor: "yellow" }}
        />,
      ),
    );
    await tick();
    assert(
      document.querySelector(".test-avatar")?.textContent === "",
      "unresolved identity shows initials",
    );
    assert(
      getComputedStyle(document.querySelector(".test-avatar")!)
        .backgroundColor !== "rgb(255, 255, 0)",
      "unresolved identity flashes yellow",
    );
  });
  if (baseline) return results;
  await test("Resources reads run in parallel and partial failure has a targeted Retry, not zero lessons", async () => {
    let ensures = 0;
    const hook = await mountHook(useResourcesHarness, {activeCommunityId:"c",session:session("a"),ensureSession:async (s:any)=>{ensures++;return s;}}, renderResources);
    assert(ensures === 1 && pending.length === 2, "initial read was duplicated or serial");
    pending.find((r)=>r.kind === "listCloudCommunityResourceModuleRows")!.resolve([courseFixture]);
    await tick();
    assert(document.body.textContent?.includes("Loading lessons…") && !document.body.textContent?.includes("0 lessons"), "pending lessons reported as zero");
    flushSync(()=>hook.value.setSelected("course"));
    pending.find((r)=>r.kind === "listCloudCommunityResourceRows")!.reject(new Error("Read unavailable"));
    await tick();
    assert(hook.value.selected === "course" && document.querySelector('[role="alert"]'), "failed read cleared selection or hid error");
    assert(!document.body.textContent?.includes("No lessons yet"), "failed read reported empty course");
    assert(document.querySelector('[aria-label="Lesson count not loaded"]'), "outline reported an unknown count as zero");
    await (window as any).captureLoadingProofState("resources-partial-error");
    (document.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await tick();
    assert(ensures === 2 && pending.length === 3 && pending[2].kind === "listCloudCommunityResourceRows", "Retry refetched healthy collection");
    pending[2].resolve([]);
    await tick();
    assert(document.body.textContent?.includes("No lessons yet") && !document.querySelector('[role="alert"]'), "confirmed empty retry did not settle");
  });
  await test("Resources scope starts before session resolution and old accounts cannot repopulate", async () => {
    const ensures: Array<ReturnType<typeof deferred>> = [];
    const props = {activeCommunityId:"c",session:session("a"),ensureSession:()=>{const d=deferred();ensures.push(d);return d.promise;}};
    const hook = await mountHook(useResourcesHarness,props);
    await hook.update({...props,session:session("b")});
    ensures[0].resolve(session("a"));
    await tick();
    assert(pending.length === 0 && hook.value.resourceRead.status === "pending", "stale auth issued reads or stopped current loading");
    ensures[1].resolve(session("b"));
    await tick();
    assert(pending.length === 2,"current account did not issue parallel reads");
    await hook.update({...props,session:session("a")});
    pending[0].resolve([courseFixture]); pending[1].resolve([lessonFixture]);
    await tick();
    assert(hook.value.resources.length === 0 && hook.value.modules.length === 0,"old account data leaked into the new scope");
    ensures[2].resolve(session("a")); await tick();
    pending[2].resolve([]);pending[3].resolve([]);await tick();
    assert(hook.value.resourceRead.status === "ready" && hook.value.moduleRead.status === "ready","current scope stranded");
  });
  await test("Resources mutation notification refreshes each collection once and preserves a draft on failure", async () => {
    let ensures=0;
    const hook=await mountHook(useResourcesHarness,{activeCommunityId:"c",session:session("a"),ensureSession:async(s:any)=>{ensures++;return s;}});
    pending[0].resolve([courseFixture]);pending[1].resolve([lessonFixture]);await tick();
    flushSync(()=>hook.value.resourceEditor.beginInlineEditResource(lessonFixture));
    flushSync(()=>hook.value.resourceEditor.onChangeBody("Unsaved lesson edit"));
    dispatchCommunityResourcesMutated({communityId:"c"});await tick();
    assert(ensures===2 && pending.length===4,"mutation event duplicated reads");
    pending[2].reject(new Error("Courses unavailable"));pending[3].reject(new Error("Lessons unavailable"));await tick();
    assert(hook.value.resources[0]?.id==="lesson" && hook.value.resourceEditor.bodyInput==="Unsaved lesson edit","refresh error erased data or draft");
  });
  await test("Resources successful publish is not rolled back when refresh fails", async () => {
    const hook=await mountHook(useResourcesHarness,{activeCommunityId:"c",session:session("a"),ensureSession:async(s:any)=>s});
    pending[0].resolve([courseFixture]);pending[1].resolve([lessonFixture]);await tick();
    const saved=hook.value.handleSetModuleStatus(courseFixture,"live");await tick();
    assert(pending[2].kind==="saveCloudCommunityResourceModule","wrong write");pending[2].resolve(null);await tick();
    assert(pending.length===5,"publish duplicated module refresh");
    pending[3].reject(new Error("refresh failed"));pending[4].reject(new Error("refresh failed"));
    assert(await saved,"saved publish reported as failure");await tick();
    assert(hook.value.modules[0].module_status==="live" && hook.value.moduleRead.status==="error","successful publish rolled back or refresh failure hidden");
  });
  await test("Resources failed publish rolls back without refreshing", async () => {
    const hook=await mountHook(useResourcesHarness,{activeCommunityId:"c",session:session("a"),ensureSession:async(s:any)=>s});
    pending[0].resolve([courseFixture]);pending[1].resolve([lessonFixture]);await tick();
    const saved=hook.value.handleSetModuleStatus(courseFixture,"live");await tick();
    pending[2].reject(new Error("Write refused"));
    assert(!(await saved),"failed write reported success");await tick();
    assert(pending.length===3 && hook.value.modules[0].module_status==="draft","failed write refreshed or did not roll back");
  });
  await test("Resources read intent wins over late session resolution within the same scope", async () => {
    const ensures: Array<ReturnType<typeof deferred>>=[];
    const hook=await mountHook(useResourcesHarness,{activeCommunityId:"c",session:session("a"),ensureSession:()=>{const d=deferred();ensures.push(d);return d.promise;}});
    const retry=hook.value.refreshCommunityResources("c",session("a"));await tick();
    ensures[1].resolve(session("a"));await tick();
    pending[0].resolve([courseFixture]);pending[1].resolve([lessonFixture]);await retry;await tick();
    ensures[0].resolve(session("a"));await tick();
    assert(pending.length===2 && hook.value.resources[0]?.id==="lesson" && hook.value.resourceRead.status==="ready","late session superseded newer read");
  });
  await test("Resources reorder refreshes lessons only", async () => {
    const hook=await mountHook(useResourcesHarness,{activeCommunityId:"c",session:session("a"),ensureSession:async(s:any)=>s});
    pending[0].resolve([courseFixture]);pending[1].resolve([lessonFixture]);await tick();
    const saved=hook.value.handleReorderResources("course",["lesson"]);await tick();
    assert(pending[2].kind==="reorderCloudCommunityResources","wrong reorder write");pending[2].resolve(null);await tick();
    assert(pending.length===4 && pending[3].kind==="listCloudCommunityResourceRows","reorder reread unchanged courses");
    pending[3].resolve([lessonFixture]);assert(await saved,"reorder failed");
  });
  for (const invalid of [null,session("b"),"rejected"]) await test(`Resources ${invalid === null ? "missing" : invalid === "rejected" ? "rejected" : "mismatched"} session settles without unauthorized reads`,async()=>{
    const hook=await mountHook(useResourcesHarness,{activeCommunityId:"c",session:session("a"),ensureSession:async()=>{if(invalid==="rejected")throw new Error("Session failure");return invalid;}});
    assert(pending.length===0 && hook.value.resourceRead.status==="error" && hook.value.moduleRead.status==="error","session failure stranded loading or queried resources");
  });
  await test("Resources overflow is explicit rather than a truncated lesson count", async()=>{
    const hook=await mountHook(useResourcesHarness,{activeCommunityId:"c",session:session("a"),ensureSession:async(s:any)=>s});
    assert(pending.every(r=>r.args.limit===201),"missing overflow sentinel");
    pending[0].resolve([courseFixture]);pending[1].resolve(Array.from({length:201},(_,i)=>({...lessonFixture,id:String(i)})));await tick();
    assert(hook.value.resourceRead.status==="error" && !hook.value.resourceRead.hasData && hook.value.resources.length===0,"truncated rows presented as complete");
  });
  await test("Events clock wakes at a boundary without focus or polling", async () => {
    const starts=Date.now()+150;
    const events=[{starts_at:new Date(starts).toISOString(),ends_at:new Date(starts+150).toISOString()}];
    const hook=await mountHook((props)=>({now:useCommunityEventClock(props.events,props.paused)}),{events,paused:false});
    await new Promise(resolve=>setTimeout(resolve,350));await tick();
    assert(hook.value.now>=starts+150,"boundary timer did not advance");
    await hook.update({events,paused:true});
    const frozen=hook.value.now;window.dispatchEvent(new Event("focus"));await tick();
    assert(hook.value.now===frozen,"paused clock advanced");
    await hook.update({events,paused:false});assert(hook.value.now>frozen,"unpaused clock did not catch up");
  });
  await test("Events agenda preserves chronology, date groups and scroll ownership", async () => {
    const realNow = Date.now;
    Date.now = () => agendaNow;
    try {
      const hook = await mountHook((props) => props, { rows: agendaRows }, (props) => <AgendaFixture {...props} />);
      const scroller = document.querySelector<HTMLElement>(".community-tab-scroll")!;
      const ids = () => [...document.querySelectorAll(".community-events-item")].map(row => row.id);
      assert(ids().join() === agendaRows.map(row => `community-event-${row.id}`).join(), "agenda is not chronological");
      assert(document.querySelectorAll('[aria-label="Sunday, September 20, 2026"]').length === 1, "mixed-phase day split into duplicate date groups");
      assert(!document.querySelector("[hidden], .community-events-past-toggle"), "history hidden");
      assert(scroller.scrollTop === 0 && document.scrollingElement!.scrollTop === 0, "entry moved the reader");
      const nav = document.querySelector(".community-events-month-nav")!;
      assert(getComputedStyle(nav).position === "static" && getComputedStyle(nav).backgroundColor === "rgba(0, 0, 0, 0)", "month navigation restored a sticky shelf or background");
      assert(!document.querySelector(".community-events-today-btn, .community-events-month-note") && !document.body.textContent?.includes("Ended"), "retired calendar chrome returned");
      const pastRow = document.querySelector(".community-events-item.is-past")!;
      const muted = getComputedStyle(pastRow.querySelector("h3")!).color;
      for (const selector of [".community-events-time", ".community-events-meta", ".community-events-description", ".community-events-actions button"]) assert(getComputedStyle(pastRow.querySelector(selector)!).color === muted, `past ${selector} stayed prominent`);
      assert(muted !== getComputedStyle(document.querySelector(".community-events-item:not(.is-past) h3")!).color, "past and upcoming look identical");
      assert(pastRow.getAttribute("aria-label")?.endsWith("past event"), "past state missing from accessible name");
      await (window as any).captureLoadingProofState("events-agenda");
      scroller.scrollTop = 300;
      const originalRow = document.querySelector(".community-events-item");
      await hook.update({ rows: [...agendaRows] });
      window.dispatchEvent(new Event("focus")); await tick();
      assert(scroller.scrollTop === 300 && document.querySelector(".community-events-item") === originalRow, "refresh/resume moved or remounted history");
      assert(nav.getBoundingClientRect().bottom < scroller.getBoundingClientRect().top, "month heading does not scroll away normally");
      await (window as any).captureLoadingProofState("events-agenda-history");
      (document.querySelector('[aria-label="Previous month"]') as HTMLButtonElement).click(); await tick();
      assert(scroller.scrollTop === 0 && !document.querySelector(".community-events-month-note"), "previous month retained stale scroll or current-month message");
    } finally { Date.now = realNow; }
  });
  await test("Events delayed initial data never repositions the reader", async () => {
    const realNow = Date.now; Date.now = () => agendaNow;
    try {
      const hook = await mountHook((props) => props, { rows: [], loading: true }, (props) => <AgendaFixture {...props} />);
      const scroller = document.querySelector<HTMLElement>(".community-tab-scroll")!;
      await hook.update({ rows: agendaRows, loading: false });
      assert(scroller.scrollTop === 0, "late data moved the reader");
    } finally { Date.now = realNow; }
  });
  await test("Events ended carryovers remain visible, with direct past-month history and honest empty states", async () => {
    const realNow = Date.now; Date.now = () => agendaNow;
    try {
      const carryover = { ...agendaEvent("Carryover", 0), ends_at: new Date(2026, 8, 1, 2).toISOString() };
      const rows = [carryover, agendaEvent("Earlier call", 2)];
      const hook = await mountHook((props) => props, { rows }, (props) => <AgendaFixture {...props} />);
      assert(document.querySelectorAll(".community-events-item.is-past").length === 2, "ended carryover disappeared");
      assert(!document.querySelector(".community-events-actions a") && document.querySelector('[aria-label="Edit event"]'), "past attendance or manager permissions changed");
      assert(!document.querySelector(".community-events-month-note"), "redundant month notice returned");
      (document.querySelector('[aria-label="Edit event"]') as HTMLButtonElement).click(); await tick();
      assert(document.querySelector('[role="dialog"] input')?.getAttribute("value") === "Carryover", "past event editor did not preserve the event");
      (document.querySelector('[aria-label="Close event editor"]') as HTMLButtonElement).click(); await tick();
      (document.querySelector('[aria-label="Previous month"]') as HTMLButtonElement).click(); await tick();
      assert(document.querySelectorAll(".community-events-item").length === 1 && !document.querySelector(".community-events-state, .community-events-month-note"), "past month obscures direct history");
      await hook.update({ rows: [] });
      assert(document.querySelector(".community-events-state")?.textContent?.includes("No events in August"), "empty month is misleading");
    } finally { Date.now = realNow; }
  });
  await test("Events rolls forward on resume, retains history and respects manual month browsing", async () => {
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
      const upcoming = {
        id: "rollover", parent_event_id: "rollover", title: "Rollover call", status: "live",
        starts_at: new Date(now + 60000).toISOString(), ends_at: new Date(now + 120000).toISOString(),
        timezone: "UTC", recurrence_frequency: "none", url: "https://example.test/call", location_type: "online",
      };
      const hook = await mountHook(() => {
        const [month, setMonth] = useState(new Date(now).toISOString());
        return { month, setMonth };
      }, {}, (value) => <WebCommunityEventsSection capabilities={{hasActiveCommunity:true,activeCommunityName:"Test",canManageEvents:false}}
        state={{events:[upcoming] as any,visibleMonthIso:value.month,isLoadingEvents:false,hasLoadedVisibleRange:true,eventsError:null}}
        actions={{setVisibleMonthIso:value.setMonth,getVisibleRange:()=>eventRange,reloadEvents:async()=>{},saveEvent:async()=>false,cancelEvent:async()=>false}} />);
      const originalRow = document.querySelector(".community-events-item");
      now += 60000;
      window.dispatchEvent(new Event("focus"));
      await tick();
      assert(document.body.textContent?.includes("Happening now"), "resume did not transition to ongoing");
      await (window as any).captureLoadingProofState("events-ongoing");
      (document.querySelector('a[href="https://example.test/call"]') as HTMLAnchorElement).focus();
      await tick();
      now += 60000;
      window.dispatchEvent(new Event("focus"));
      await tick();
      assert(!document.querySelector(".community-events-day-group[hidden]") && document.activeElement?.getAttribute("href") === "https://example.test/call", "rollover removed focused action");
      (document.activeElement as HTMLElement).blur();
      await tick();
      assert(document.querySelector(".community-events-item.is-past"), "past event was not subdued");
      assert(!document.querySelector('a[href="https://example.test/call"]'), "past event kept Join action");
      assert(!document.querySelector(".community-events-day-group[hidden], .community-events-past-toggle"), "history still hidden behind a disclosure");
      assert(document.querySelector(".community-events-item") === originalRow, "phase transition remounted the row");
      await (window as any).captureLoadingProofState("events-history");
      (document.querySelector('[aria-label="Previous month"]') as HTMLButtonElement).click();
      await tick();
      const manualMonth = hook.value.month;
      const future = new Date(now);
      now = new Date(future.getFullYear(), future.getMonth() + 1, 1).getTime();
      document.dispatchEvent(new Event("visibilitychange"));
      await tick();
      assert(hook.value.month === manualMonth, "clock overrode manual month selection");
      now = new Date(future.getFullYear(), future.getMonth() + 2, 1).getTime();
      window.dispatchEvent(new Event("pageshow"));await tick();
      assert(hook.value.month === manualMonth, "resume navigated away from the selected month");
    } finally { Date.now = realNow; }
  });
  for (const failure of ["missing", "mismatched", "rejected"]) {
    await test(`production Events Retry owns ${failure} session failure and recovery`, async () => {
      let mode = failure;
      let ensures = 0;
      const hook = await mountHook(useWebEventsHarness, {
        activeCommunityId: "c",
        session: session("a"),
        ensureSession: async () => {
          ensures += 1;
          if (mode === "rejected") throw new Error("Session unavailable. Try again.");
          return mode === "missing" ? null : session(mode === "mismatched" ? "b" : "a");
        },
      }, renderEvents);
      await hook.value.reloadActiveEvents(hook.value.eventsVisibleRange);
      await tick();
      assert(ensures === 1, "Retry resolved the session more than once");
      assert(!hook.value.loading && hook.value.error, "wrapper bypassed recoverable error state");
      assert(pending.length === 0, "unauthorized Events query issued");
      const retry = document.querySelector('[role="alert"] button') as HTMLButtonElement;
      assert(retry && !document.body.textContent?.includes("No events in"), "missing honest Retry UI");
      mode = "ready";
      retry.click();
      await tick();
      assert(ensures === 2 && pending.length === 1, "recovery did not use one session resolution and one query");
      assert(hook.value.loading && !hook.value.error, "recovery retained stale error");
      pending[0].resolve([]);
      await tick();
      assert(hook.value.loaded && !hook.value.loading && !hook.value.error, "recovery did not settle");
      assert(document.body.textContent?.includes("No events in"), "confirmed empty range missing");
    });
  }
  for (const changedScope of ["account", "community", "range"]) {
    await test(`production Events Retry ignores a late session after ${changedScope} change`, async () => {
      const ensures: Array<ReturnType<typeof deferred>> = [];
      const props = {
        activeCommunityId: "c",
        session: session("a"),
        ensureSession: () => {
          const d = deferred();
          ensures.push(d);
          return d.promise;
        },
      };
      const hook = await mountHook(useWebEventsHarness, props);
      const old = hook.value.reloadActiveEvents(hook.value.eventsVisibleRange);
      if (changedScope === "range") {
        const nextMonth = new Date(hook.value.eventsVisibleMonthIso);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        flushSync(() => hook.value.setEventsVisibleMonthIso(nextMonth.toISOString()));
        await tick();
      } else {
        await hook.update({ ...props, ...(changedScope === "account"
          ? { session: session("b") } : { activeCommunityId: "d" }) });
      }
      const next = hook.value.reloadActiveEvents(hook.value.eventsVisibleRange);
      ensures[0].resolve(session("a"));
      await tick();
      assert(pending.length === 0 && ensures.length === 2, "obsolete Retry re-resolved auth or queried Events");
      await old;
      assert(hook.value.loading && !hook.value.error, "obsolete Retry interrupted current loading");
      ensures[1].resolve(session(changedScope === "account" ? "b" : "a"));
      await tick();
      assert(pending.length === 1, "current Retry did not query exactly once");
      assert(pending[0].args.communityId === (changedScope === "community" ? "d" : "c"), "wrong community queried");
      assert(pending[0].args.startIso === hook.value.eventsVisibleRange.startIso, "wrong range queried");
      pending[0].resolve([{ id: "current" }]);
      await next;
      await tick();
      assert(hook.value.rows[0]?.id === "current" && !hook.value.loading, "current result not committed");
    });
  }
  await test("production Events Retry preserves intent order within the same range", async () => {
    const ensures: Array<ReturnType<typeof deferred>> = [];
    const hook = await mountHook(useWebEventsHarness, {
      activeCommunityId: "c",
      session: session("a"),
      ensureSession: () => {
        const d = deferred();
        ensures.push(d);
        return d.promise;
      },
    });
    const old = hook.value.reloadActiveEvents(hook.value.eventsVisibleRange);
    const next = hook.value.reloadActiveEvents(hook.value.eventsVisibleRange);
    ensures[1].resolve(session("a"));
    await tick();
    assert(ensures.length === 2 && pending.length === 1, "newer Retry did not query with a single session resolution");
    pending[0].resolve([{ id: "newer" }]);
    await next;
    ensures[0].reject(new Error("Obsolete session failure"));
    await old;
    await tick();
    assert(hook.value.rows[0]?.id === "newer" && !hook.value.loading && !hook.value.error, "older failure overwrote newer success");
    assert(pending.length === 1, "obsolete Retry issued another query");
  });
  for (const invalidSession of [null, session("b"), "rejected"]) {
    const failure =
      invalidSession === "rejected"
        ? "rejected"
        : invalidSession
          ? "mismatched"
          : "missing";
    await test(`Events ${failure} session stops loading, avoids false emptiness and retries`, async () => {
      let usable: any = invalidSession;
      const hook = await mountHook(
        useEventsHarness,
        {
          activeCommunityId: "c",
          session: session("a"),
          visibleRange: eventRange,
          ensureSession: async () => {
            if (usable === "rejected")
              throw new Error("Session service unavailable. Try again.");
            return usable;
          },
        },
        renderEvents,
      );
      await hook.value.loadCommunityEvents("c", session("a"), eventRange);
      await tick();
      assert(
        !hook.value.loading && hook.value.error,
        "current auth failure was silent",
      );
      assert(
        pending.length === 0,
        "events query issued without matching session",
      );
      assert(
        document.querySelector('[role="alert"]'),
        "missing rendered recovery message",
      );
      assert(
        !document.body.textContent?.includes("Loading events"),
        "unresolved range still looks loading",
      );
      assert(
        !document.body.textContent?.includes("No events in"),
        "failure presented as empty success",
      );
      if (failure === "missing")
        await (window as any).captureLoadingProofState("events-session-error");
      usable = session("a");
      (
        document.querySelector('[role="alert"] button') as HTMLButtonElement
      ).click();
      await tick();
      assert(
        hook.value.loading && !hook.value.error,
        "retry did not clear current error",
      );
      pending[0].resolve([]);
      await tick();
      assert(
        hook.value.loaded && !hook.value.loading && !hook.value.error,
        "retry failed to settle",
      );
      assert(
        document.body.textContent?.includes("No events in"),
        "confirmed empty result not shown",
      );
    });
    await test(`Profile ${failure} session preserves draft, reports failure and permits retry`, async () => {
      let usable: any = invalidSession;
      let signInRequests = 0;
      const hook = await mountHook(
        useProfileHarness,
        {
          session: session("a"),
          ensureSession: async () => {
            if (usable === "rejected")
              throw new Error("Session service unavailable. Try again.");
            return usable;
          },
          onProfileSaveUnauthenticated: () => {
            signInRequests += 1;
          },
        },
        renderProfile,
      );
      flushSync(() => {
        hook.value.ui.applyLoadedProfileToLocal(profile);
        hook.value.ui.setProfileBio("Keep my edit");
      });
      assert(
        !(await hook.value.admin.saveProfileToCloud()),
        "invalid session save succeeded",
      );
      await tick();
      assert(
        hook.value.ui.profileSaveError &&
          signInRequests === (failure === "rejected" ? 0 : 1),
        "save failure gave no recovery feedback",
      );
      assert(
        document.querySelector('[role="alert"]')?.textContent ===
          hook.value.ui.profileSaveError,
        "save error not rendered",
      );
      const saveButton = document.querySelector(
        ".platform-save-button",
      ) as HTMLButtonElement | null;
      assert(
        saveButton && !saveButton.disabled,
        "save retry disabled after failure",
      );
      assert(
        !hook.value.ui.isSavingProfile && hook.value.ui.isProfileDirty,
        "failed save stranded or cleared draft",
      );
      assert(
        hook.value.ui.profileBio === "Keep my edit" && pending.length === 0,
        "draft lost or write preparation issued",
      );
      if (failure === "missing")
        await (window as any).captureLoadingProofState("profile-session-error");
      usable = session("a");
      const retry = hook.value.admin.saveProfileToCloud();
      await tick();
      assert(!hook.value.ui.profileSaveError, "retry kept stale save error");
      assert(document.querySelector('[role="status"]')?.textContent === "Saving…", "canonical status did not announce saving");
      pending[0].resolve({ url: null, storageId: null });
      await tick();
      pending[1].resolve({ ...profile, user_id: "a", bio: "Keep my edit" });
      assert(await retry, "retry remained locked");
      await tick();
      assert(
        !hook.value.ui.isSavingProfile && !hook.value.ui.isProfileDirty,
        "retry did not acknowledge saved draft",
      );
      const statuses = document.querySelectorAll('[role="status"]');
      assert(statuses.length === 1 && statuses[0].textContent === "Saved", "Profile has duplicate or missing saved feedback");
      flushSync(() => hook.value.ui.setProfileBio("A newer edit"));
      assert(document.querySelector('[role="status"]')?.textContent === "Unsaved changes", "new edit retained stale saved feedback");
    });
  }
  await test("obsolete Events session failures cannot interrupt a newer request", async () => {
    const ensures: Array<ReturnType<typeof deferred>> = [];
    const hook = await mountHook(useEventsHarness, {
      activeCommunityId: "c",
      session: session("a"),
      ensureSession: () => {
        const d = deferred();
        ensures.push(d);
        return d.promise;
      },
    });
    const old = hook.value.loadCommunityEvents("c", session("a"), eventRange);
    const next = hook.value.loadCommunityEvents("c", session("a"), eventRange);
    ensures[0].resolve(null);
    await old;
    await tick();
    assert(
      hook.value.loading && !hook.value.error,
      "obsolete failure interrupted current request",
    );
    ensures[1].resolve(session("a"));
    await tick();
    pending[0].resolve([]);
    await next;
    await tick();
    assert(
      !hook.value.loading && !hook.value.error,
      "current request did not complete",
    );
  });
  await test("account switch suppresses stale Events session failure", async () => {
    const ensure = deferred();
    const props = {
      activeCommunityId: "c",
      session: session("a"),
      ensureSession: () => ensure.promise,
    };
    const hook = await mountHook(useEventsHarness, props);
    const old = hook.value.loadCommunityEvents("c", session("a"), eventRange);
    await hook.update({ ...props, session: session("b") });
    ensure.resolve(null);
    await old;
    await tick();
    assert(
      !hook.value.error && pending.length === 0,
      "old session failure affected new account",
    );
  });
  for (const completion of ["missing", "rejected"] as const) {
    await test(`account switch suppresses ${completion} Profile session failure`, async () => {
      const ensure = deferred();
      let signInRequests = 0;
      const props = {
        session: session("a"),
        ensureSession: () => ensure.promise,
        onProfileSaveUnauthenticated: () => {
          signInRequests += 1;
        },
      };
      const hook = await mountHook(useProfileHarness, props);
      const save = hook.value.admin.saveProfileToCloud();
      await hook.update({ ...props, session: session("b") });
      if (completion === "missing") ensure.resolve(null);
      else ensure.reject(new Error("old auth error"));
      assert(!(await save), "stale save accepted");
      await tick();
      assert(
        !hook.value.ui.profileSaveError && signInRequests === 0,
        "stale failure affected new account",
      );
      assert(
        !hook.value.ui.isSavingProfile && pending.length === 0,
        "stale save issued work or left spinner",
      );
    });
  }
  await test("profile save acknowledges only the submitted revision", async () => {
    const hook = await mountHook(useProfileHarness, {
      session: session("a"),
      ensureSession: async (s: any) => s,
    });
    flushSync(() => hook.value.ui.applyLoadedProfileToLocal(profile));
    flushSync(() => hook.value.ui.setProfileBio("Submitted bio"));
    const save = hook.value.admin.saveProfileToCloud();
    await tick();
    pending
      .find((p) => p.kind === "prepareCloudProfileAvatarField")!
      .resolve({ url: null, storageId: null });
    await tick();
    assert(
      pending.find((p) => p.kind === "upsertCloudProfileDetail")?.args.bio ===
        "Submitted bio",
      "saved payload changed after click",
    );
    flushSync(() => hook.value.ui.setProfileBio("Newer edit"));
    pending
      .find((p) => p.kind === "upsertCloudProfileDetail")!
      .resolve({ ...profile, user_id: "a", bio: "Submitted bio" });
    assert(await save, "save should succeed");
    await tick();
    assert(
      hook.value.ui.profileBio === "Newer edit",
      "save completion erased a newer edit",
    );
    assert(
      hook.value.cloudProfile.bio === "Submitted bio",
      "server baseline not updated",
    );
    assert(hook.value.ui.isProfileDirty, "newer draft marked saved");
  });
  await test("account change during avatar preparation prevents the profile write", async () => {
    const props = { session: session("a"), ensureSession: async (s: any) => s };
    const hook = await mountHook(useProfileHarness, props);
    const save = hook.value.admin.saveProfileToCloud();
    await tick();
    await hook.update({ ...props, session: session("b") });
    pending
      .find((p) => p.kind === "prepareCloudProfileAvatarField")!
      .resolve({ url: null, storageId: null });
    assert(!(await save), "stale save was accepted");
    await tick();
    assert(
      !pending.some((p) => p.kind === "upsertCloudProfileDetail"),
      "write issued under stale account",
    );
    assert(
      hook.value.ui.profileBio === "",
      "old draft appeared in new account",
    );
  });
  await test("profile read failure is not missing and retry can resolve an absent profile", async () => {
    const hook = await mountHook(useProfileHarness, {
      session: session("a"),
      ensureSession: async (s: any) => s,
    });
    const read = hook.value.admin.loadSelfProfile(session("a"));
    await tick();
    pending[0].reject(new Error("offline"));
    await read;
    await tick();
    assert(
      hook.value.ui.profileLoadStatus === "error",
      "failed read was hidden",
    );
    const retry = hook.value.admin.loadSelfProfile(session("a"));
    await tick();
    pending[1].resolve(null);
    await retry;
    await tick();
    assert(
      hook.value.ui.profileLoadStatus === "missing",
      "successful absence not distinguished",
    );
  });
  await test("stale billing error cannot replace the new account result", async () => {
    const props = {
      session: session("a"),
      ensureSession: async (s: any) => s,
      operatorComplimentaryAccess: false,
    };
    const hook = await mountHook(useWebFounderBillingController as any, props);
    await hook.update({ ...props, session: session("b") });
    pending[1].resolve({ communities: [{ community_id: "b" }] });
    await tick();
    pending[0].reject(new Error("old account error"));
    await tick();
    assert(
      hook.value.overview.communities[0]?.community_id === "b" &&
        hook.value.error === null,
      "stale billing error affected new account",
    );
  });
  await test("StrictMode replay does not strand active profile loading", async () => {
    let value: any;
    const Component = () => {
      value = useProfileHarness({
        session: session("a"),
        ensureSession: async (s: any) => s,
        profileIsActive: true,
      });
      return null;
    };
    flushSync(() =>
      root.render(
        <React.StrictMode>
          <Component />
        </React.StrictMode>,
      ),
    );
    await tick();
    const reads = pending.filter(
      (p) => p.kind === "fetchCloudProfileDetailByUserId",
    );
    assert(reads.length > 0, "active profile read never started");
    for (const read of reads) read.resolve({ ...profile, user_id: "a" });
    await tick();
    assert(
      value.ui.profileLoadStatus === "ready",
      "StrictMode left a stale in-flight lock",
    );
  });
  return results;
};

function ProfileVisual({
  phase,
  imageUrl,
}: {
  phase: "loading" | "ready" | "error";
  imageUrl: string | null;
}) {
  const [cloudProfile, setCloudProfile] = useState<any>(null);
  const ui = useWebProfileSettingsUiController({
    profileStorageUserId: "visual-fixture",
    initialProfileDraft: { name: "", handle: "", bio: "" },
    session: session("visual-fixture"),
    cloudProfile,
  });
  useEffect(() => {
    ui.setProfileLoadStatus(phase);
    if (phase === "ready") {
      const row = {
        ...profile,
        user_id: "visual-fixture",
        avatar_url: imageUrl,
      };
      setCloudProfile(row);
      ui.applyLoadedProfileToLocal(row);
    }
  }, [phase, imageUrl]);
  return (
    <main
      className="settings-panel"
      style={{ width: "100%", minHeight: "100vh", padding: 40 }}
    >
      <div style={{ width: 760, margin: "0 auto" }}>
        <WebProfileSettingsSection
          {...ui}
          session={session("visual-fixture")}
          cloudProfile={cloudProfile}
          handleProfileAvatarDrop={() => {}}
          handleProfileAvatarUpload={() => {}}
          getInitials={() => "AD"}
          onRemoveProfileAvatar={() => ui.setProfileAvatarUrl(null)}
          saveProfileToCloud={async () => false}
          reloadProfile={() => {}}
        />
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 32,
            alignItems: "center",
          }}
        >
          <UserAvatar
            name="Ada"
            imageUrl={imageUrl}
            className="proof-avatar"
            style={{ width: 48, height: 48, borderRadius: "50%" }}
            fallbackStyle={{ backgroundColor: "yellow", width: 48, height: 48 }}
          />
          <span>Shared avatar loading fixture · no external account data</span>
        </div>
      </div>
    </main>
  );
}
(window as any).showLoadingVisual = (
  phase: "loading" | "ready" | "error",
  imageUrl: string | null,
) => {
  flushSync(() =>
    root.render(<ProfileVisual phase={phase} imageUrl={imageUrl} />),
  );
};

if (new URLSearchParams(window.location.search).has("events-preview")) {
  (window as any).showEventsAgendaVisual();
}
