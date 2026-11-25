import { useEffect, useRef, useState } from "react";

import connectYourAppGuide from "../../../../docs/product/guides/connect-your-app.md?raw";
import { tryCopyTextToClipboard } from "../../../../shared/chatUi";
import { fetchCloudCommunitySettings, saveCloudCommunitySettings } from "../../../../shared/cloudCommunityAdminGateway";
import { registerCloudConnectedApp } from "../../../../shared/cloudConnectedAppsGateway";
import { communityPageAddress } from "../../../../shared/communitySlug";
import { buildConnectedAppSetupPrompt } from "../../../../shared/connectedAppSetupPrompt";
import { buildPolynetMcpSetupForOrigin } from "../../../../shared/polynetMcpSetup";
import { announceCommunityAppLinksChanged } from "../controllers/communityAppLinks";
import { KitStartLaunch, type LaunchConnectedAppResult } from "../v1/KitStartCommunity";
import { clearStartExtras, readStartExtras, startExtrasNeedSaving } from "../v1/startCommunityExtras";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";

type LaunchCommunity = {
  id: string;
  slug: string;
  name: string;
  one_liner?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
};

export type WebCommunityLaunchStepProps = {
  community: LaunchCommunity;
  hostName: string | null;
  hostAvatarUrl: string | null;
  hostAvatarFocusX?: number | null;
  hostAvatarFocusY?: number | null;
  hostAvatarZoom?: number | null;
  ensureSession: () => Promise<unknown | null>;
  // Marks setup finished and opens the community.
  onComplete: () => Promise<boolean>;
};

// A price can't be charged until the host's payouts are connected, and a
// community can't be listed until it looks finished. Either is left for
// later; the rest of what was typed is still saved.
const isPayoutsError = (message: string) => /community_payout_access_required|community_stripe_connect/.test(message);
const isNotReadyToListError = (message: string) => /community_publish_ready_required/.test(message);

// The last step of starting a community, shown for one that was just created
// (and again after a refresh, until it is opened): it saves what step 2 asked
// for, then gives the invite link and the way in.
export function WebCommunityLaunchStep(props: WebCommunityLaunchStepProps) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listed, setListed] = useState(false);
  const [monthlyCents, setMonthlyCents] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);
  const [connectedApp, setConnectedApp] = useState<LaunchConnectedAppResult | null>(null);
  const [connectingApp, setConnectingApp] = useState(false);
  const [connectAppError, setConnectAppError] = useState<string | null>(null);
  const [appSecretCopied, setAppSecretCopied] = useState(false);
  const [appPromptCopied, setAppPromptCopied] = useState(false);
  const ensureSessionRef = useRef(props.ensureSession);
  ensureSessionRef.current = props.ensureSession;
  const communityId = props.community.id;
  const slug = props.community.slug;

  // Started once per community, even if the effect runs again (a remount in
  // development): the run that started is the one that finishes.
  const startedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (startedForRef.current === communityId) return;
    const extras = readStartExtras(slug);
    if (!startExtrasNeedSaving(extras)) return;
    startedForRef.current = communityId;
    setSaving(true);
    void (async () => {
      try {
        const session = await ensureSessionRef.current();
        if (!session) throw new Error("session");
        const now = await fetchCloudCommunitySettings({ session, communityId });
        if (!now) throw new Error("settings");
        const save = (ask: { cents: number | null; listed: boolean }) => saveCloudCommunitySettings({
          session,
          communityId,
          expectedSettingsRevision: now.settings_revision,
          name: now.name,
          slug: now.slug,
          oneLiner: now.one_liner,
          about: extras.about || now.about,
          avatarStorageId: now.avatar_storage_id,
          avatarUrl: now.avatar_url,
          avatarFocusX: now.avatar_focus_x,
          avatarFocusY: now.avatar_focus_y,
          avatarZoom: now.avatar_zoom,
          bannerStorageId: now.banner_storage_id,
          bannerUrl: now.banner_url,
          bannerFocusX: now.banner_focus_x,
          bannerFocusY: now.banner_focus_y,
          bannerZoom: now.banner_zoom,
          visibility: ask.listed ? "published" : now.visibility,
          monthlyAmountBaseUnits: ask.cents,
          annualAmountBaseUnits: null,
        });
        // Asked for in full first; what can't be had yet is dropped and the
        // rest saved (at most two retries: the price, the listing).
        const ask = { cents: extras.monthlyCents, listed: extras.listed };
        const notes: string[] = [];
        let saved = null;
        for (;;) {
          try {
            saved = await save(ask);
            break;
          } catch (failure) {
            const message = failure instanceof Error ? failure.message : String(failure ?? "");
            if (ask.cents && isPayoutsError(message)) {
              ask.cents = null;
              notes.push("It's free to join for now. Connect payouts in Settings to set your price.");
            } else if (ask.listed && isNotReadyToListError(message)) {
              ask.listed = false;
              notes.push("It stays unlisted until it has a picture, a banner and a one-liner. Switch on listing in Settings once it does.");
            } else {
              throw failure;
            }
          }
        }
        if (!saved) throw new Error("save");
        clearStartExtras(slug);
        setListed(saved.visibility === "published");
        setMonthlyCents(saved.pricing.monthly_amount_base_units);
        if (notes.length) setNote(notes.join(" "));
      } catch {
        // Kept in the tab: a refresh tries again.
        startedForRef.current = null;
        setError("What you wrote on the last step couldn't be saved. You can add it in Settings.");
      } finally {
        setSaving(false);
      }
    })();
  }, [communityId, slug]);

  const copy = () => {
    void navigator.clipboard?.writeText(`https://${communityPageAddress(slug)}`).then(() => setCopied(true), () => setCopied(false));
  };
  const copyAiSetup = async () => {
    try {
      const setup = buildPolynetMcpSetupForOrigin(window.location.origin, {
        community: { name: props.community.name, slug },
      });
      const ok = await tryCopyTextToClipboard(setup.setupBundle);
      setAiCopied(ok);
      if (ok) window.setTimeout(() => setAiCopied(false), 2200);
    } catch {
      setAiCopied(false);
    }
  };
  const connectApp = async (input: { name: string; appUrl: string }) => {
    if (connectingApp) return;
    setConnectingApp(true);
    setConnectAppError(null);
    try {
      const session = await ensureSessionRef.current();
      if (!session) throw new Error("session");
      const result = await registerCloudConnectedApp({
        session,
        communityId,
        name: input.name,
        appUrl: input.appUrl || undefined,
      });
      setConnectedApp({
        appId: result.app_id,
        name: input.name,
        appUrl: input.appUrl || null,
        secret: result.secret,
      });
      announceCommunityAppLinksChanged();
    } catch (failure) {
      const code = String((failure as Error)?.message ?? "");
      setConnectAppError(
        code.includes("connected_app_url_invalid")
          ? "Use your app's public https address."
          : code.includes("name_required")
            ? "Give your app a name."
            : "Couldn't connect your app. You can add it in Settings anytime.",
      );
    } finally {
      setConnectingApp(false);
    }
  };
  const copyAppSecret = async () => {
    if (!connectedApp) return;
    const ok = await tryCopyTextToClipboard(connectedApp.secret);
    setAppSecretCopied(ok);
    if (ok) window.setTimeout(() => setAppSecretCopied(false), 2200);
  };
  const copyAppPrompt = async () => {
    if (!connectedApp) return;
    const convex = String((import.meta as any).env?.VITE_CONVEX_URL ?? "");
    const apiOrigin = convex ? convex.replace(".convex.cloud", ".convex.site") : "";
    const prompt = buildConnectedAppSetupPrompt({
      communityName: props.community.name,
      appName: connectedApp.name,
      appId: connectedApp.appId,
      apiOrigin,
      hasWebhook: false,
      guide: connectYourAppGuide,
      communityUrl: `${window.location.origin}/c/${encodeURIComponent(slug)}`,
      hasAppLink: Boolean(connectedApp.appUrl),
      tiers: [],
    });
    const ok = await tryCopyTextToClipboard(prompt);
    setAppPromptCopied(ok);
    if (ok) window.setTimeout(() => setAppPromptCopied(false), 2200);
  };
  const open = async () => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      if (!(await props.onComplete())) setError("The community couldn't be opened. Try again.");
    } catch {
      setError("The community couldn't be opened. Try again.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <WebBlockingSetupModal titleId="community-launch-title" busy={saving || opening} size="wide" className="create-community-modal builder-create-modal is-kit-start">
      <KitStartLaunch
        titleId="community-launch-title"
        card={{
          slug,
          name: props.community.name,
          oneLiner: String(props.community.one_liner ?? ""),
          avatarUrl: props.community.avatar_url ?? null,
          avatarFocusX: props.community.avatar_focus_x ?? null,
          avatarFocusY: props.community.avatar_focus_y ?? null,
          avatarZoom: props.community.avatar_zoom ?? null,
          bannerUrl: props.community.banner_url ?? null,
          bannerFocusX: props.community.banner_focus_x ?? null,
          bannerFocusY: props.community.banner_focus_y ?? null,
          bannerZoom: props.community.banner_zoom ?? null,
          monthlyCents,
          hostName: props.hostName,
          hostAvatarUrl: props.hostAvatarUrl,
          hostAvatarFocusX: props.hostAvatarFocusX ?? null,
          hostAvatarFocusY: props.hostAvatarFocusY ?? null,
          hostAvatarZoom: props.hostAvatarZoom ?? null,
        }}
        listed={listed}
        saving={saving}
        note={note}
        error={error}
        opening={opening}
        copied={copied}
        onCopy={copy}
        aiCopied={aiCopied}
        onCopyAiSetup={() => void copyAiSetup()}
        connectedApp={connectedApp}
        connectingApp={connectingApp}
        connectAppError={connectAppError}
        appSecretCopied={appSecretCopied}
        appPromptCopied={appPromptCopied}
        onConnectApp={connectApp}
        onCopyAppSecret={() => void copyAppSecret()}
        onCopyAppPrompt={() => void copyAppPrompt()}
        onOpen={() => void open()}
      />
    </WebBlockingSetupModal>
  );
}
