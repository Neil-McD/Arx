import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useWebProfileSettingsUiController } from "../../apps/web/src/controllers/useWebProfileSettingsUiController";
import { useWebFounderBillingController } from "../../apps/web/src/controllers/useWebFounderBillingController";
import { useCommunityEventsController } from "../../shared/useCommunityEventsController";
import { useWebCommunityContentController } from "../../apps/web/src/controllers/useWebCommunityContentController";
import { UserAvatar } from "../../shared/UserAvatar";
import { useCommunityAdminController } from "../../shared/useCommunityAdminController";
import { WebProfileSettingsSection } from "../../apps/web/src/components/WebProfileSettingsSection";
import { WebCommunityEventsSection } from "../../apps/web/src/components/WebCommunityEventsSection";
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
    profileSaveUnauthenticatedErrorMessage:
      props.profileSaveUnauthenticatedErrorMessage ?? null,
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
      now += 60000;
      window.dispatchEvent(new Event("focus"));
      await tick();
      assert(document.body.textContent?.includes("Happening now"), "resume did not transition to ongoing");
      now += 60000;
      window.dispatchEvent(new Event("focus"));
      await tick();
      assert(document.querySelector(".community-events-day-group[hidden]"), "past event stayed prominent");
      assert(!document.querySelector('a[href="https://example.test/call"]'), "past event kept Join action");
      (document.querySelector(".community-events-past-toggle") as HTMLButtonElement).click();
      await tick();
      assert(!document.querySelector(".community-events-day-group[hidden]"), "history inaccessible");
      (document.querySelector('[aria-label="Previous month"]') as HTMLButtonElement).click();
      await tick();
      const manualMonth = hook.value.month;
      const future = new Date(now);
      now = new Date(future.getFullYear(), future.getMonth() + 1, 1).getTime();
      document.dispatchEvent(new Event("visibilitychange"));
      await tick();
      assert(hook.value.month === manualMonth, "clock overrode manual month selection");
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
