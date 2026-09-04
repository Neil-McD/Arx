import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useWebProfileSettingsUiController } from "../../apps/web/src/controllers/useWebProfileSettingsUiController";
import { useWebFounderBillingController } from "../../apps/web/src/controllers/useWebFounderBillingController";
import { useCommunityEventsController } from "../../shared/useCommunityEventsController";
import { UserAvatar } from "../../shared/UserAvatar";
import { useCommunityAdminController } from "../../shared/useCommunityAdminController";
import { WebProfileSettingsSection } from "../../apps/web/src/components/WebProfileSettingsSection";
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

async function mountHook(useHook: (props: any) => any, initial: any) {
  let value: any;
  const Component = (props: any) => {
    value = useHook(props);
    return null;
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
    profileSaveUnauthenticatedErrorMessage: "Sign in",
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
