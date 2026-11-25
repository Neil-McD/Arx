import { CommunityMyPlanSection } from "./CommunityMyPlanSection";
import { CommunityConnectedAppsSection } from "./CommunityConnectedAppsSection";
import { CommunityPlansSection } from "./CommunityPlansSection";
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { SettingsButton, SettingsGroup, SettingsNote, SettingsPageHead, SettingsRow, SettingsSaveStatus, SettingsSegmented, SettingsSelect, SettingsSwitch } from "./SettingsRows";
import { STRIPE_CONNECT_COUNTRIES, formatStripeConnectCountry } from "../../../../shared/stripeConnectCountries";
import type { DragEvent } from "react";
import type { CommunitySettingsLayer } from "../../../../shared/communityAccessViewModel";
import { deriveCommunitySettingsAccessPresentation } from "../../../../shared/communityAccessResolution";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import {
  listCommunitySettingsPanesForAccess,
  normalizeCommunitySettingsPaneForAccess,
  COMMUNITY_SETTINGS_PANE_LABELS,
  type CommunitySettingsPane,
} from "../../../../shared/appShellNavigation";
import { buildStripeConnectPresentation } from "../controllers/buildStripeConnectPresentation";
import type { WebCommunityAiAgentSection as WebCommunityAiAgentSectionType } from "./WebCommunityAiAgentSection";
import { GuideAllowedSettings } from "./GuideAllowedSettings";
import { platformTabId, platformTabPanelId } from "./WebPlatformChoiceControls";
import {
  getMyBuilderHeartbeatPreference,
  getMyMemberCoachPreference,
  setMyBuilderHeartbeatPreference,
  setMyMemberCoachPreference,
} from "../../../../shared/cloudCommunityMemberCoachGateway";
import type {
  BuilderHeartbeatPreferenceView,
  MemberCoachPreferenceView,
} from "../../../../shared/communityMemberCoachTypes";

const WebCommunityAiAgentSection = lazy(() =>
  import("./WebCommunityAiAgentSection").then((m) => ({ default: m.WebCommunityAiAgentSection })),
);
const WebCommunityAiRulesEditor = lazy(() =>
  import("./WebCommunityAiRulesEditor").then((m) => ({ default: m.WebCommunityAiRulesEditor })),
);
const CommunityFounderBriefSection = lazy(() =>
  import("./CommunityFounderBriefSection").then((m) => ({ default: m.CommunityFounderBriefSection })),
);
const CommunityMemberCoachSettingsSection = lazy(() =>
  import("./CommunityMemberCoachSettingsSection").then((m) => ({ default: m.CommunityMemberCoachSettingsSection })),
);
const GuideSoulMemoryCards = lazy(() =>
  import("./GuideSoulMemoryCards").then((m) => ({ default: m.GuideSoulMemoryCards })),
);

function MemberCoachPreferenceRow(props: {
  communityId: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}) {
  const [pref, setPref] = useState<MemberCoachPreferenceView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPref(null);
    setError(null);
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        const loaded = session ? await getMyMemberCoachPreference({ session, communityId: props.communityId }) : null;
        if (!cancelled) setPref(loaded);
      } catch {
        if (!cancelled) setError("Couldn't load check-in preference.");
      }
    })();
    return () => { cancelled = true; };
  }, [props.communityId]);
  const toggle = async (checked: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      setPref(await setMyMemberCoachPreference({ session, communityId: props.communityId, coachMuted: checked }));
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <SettingsRow
      label="Pause guide check-ins"
      help={error ? <span className="settings-v1-error" role="alert">{error}</span>
        : "Stop the community guide from starting private check-in messages with you."}
    >
      <SettingsSwitch label="Pause guide check-ins" checked={Boolean(pref?.coach_muted)} disabled={!pref || saving}
        onChange={(checked) => void toggle(checked)} />
    </SettingsRow>
  );
}

function BuilderHeartbeatPreferenceSection(props: {
  communityId: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}) {
  const [pref, setPref] = useState<BuilderHeartbeatPreferenceView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPref(null);
    setError(null);
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        const loaded = session
          ? await getMyBuilderHeartbeatPreference({ session, communityId: props.communityId })
          : null;
        if (!cancelled) setPref(loaded);
      } catch {
        if (!cancelled) setError("Couldn't load personal check-in preference.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communityId]);
  const toggle = async (checked: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      setPref(
        await setMyBuilderHeartbeatPreference({
          session,
          communityId: props.communityId,
          enabled: checked,
        }),
      );
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };
  if (pref && !pref.eligible) return null;
  return (
    <SettingsGroup label="Personal check-ins">
      <SettingsRow
        label="Check in on my private goals & commitments"
        help={
          error ? (
            <span className="settings-v1-error" role="alert">{error}</span>
          ) : (
            "Your guide follows up privately in your Agent thread on commitments you share here — separate from the daily brief, strictly private to you, and pauses automatically if you go quiet."
          )
        }
      >
        <SettingsSwitch
          label="Check in on my private goals & commitments"
          checked={pref ? pref.enabled : true}
          disabled={!pref || saving}
          onChange={(checked) => void toggle(checked)}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
import { discoverListingGap } from "../../../../shared/communityDiscoverListing";
import { FormGroupsSkeleton } from "./WebLoadingSkeleton";

type CommunityPricingMode = "free" | "monthly" | "annual";

type ActiveCommunity = {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  one_liner: string | null;
  about: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type WebCommunitySettingsSectionProps = {
  activeCommunity: ActiveCommunity | null;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  hasSession: boolean;
  isResolvingCommunityAccess: boolean;
  communityAccessLoadError: string | null;
  onRetryCommunityAccess: () => void;
  canViewActiveCommunitySettings: boolean;
  communitySettingsLayer: CommunitySettingsLayer;
  activePane: CommunitySettingsPane;
  onSelectPane: (pane: CommunitySettingsPane, opts?: { replace?: boolean }) => void;
  canManageCommunitySettings: boolean;
  canManageMembersActiveCommunity: boolean;
  aiAgentProps: ComponentProps<typeof WebCommunityAiAgentSectionType>;
  requireSignIn: () => void;
  accountCommerceStatus: AccountCommerceStatus | null;
  communityPlatformFeeBps: number | null;
  accountCommerceError: string | null;
  startStripeConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  }) => Promise<void> | void;
  isStartingStripeConnectOnboarding: boolean;
  state: {
    isSettingsBannerDragOver: boolean;
    isProcessingCommunitySettingsBanner: boolean;
    isCommunityAvatarFocusModalOpen: boolean;
    isCommunityBannerFocusModalOpen: boolean;
    communitySettingsAvatarFocusX: number;
    communitySettingsAvatarFocusY: number;
    communitySettingsAvatarZoom: number;
    communitySettingsBannerUrl: string | null;
    communitySettingsBannerFocusX: number;
    communitySettingsBannerFocusY: number;
    communitySettingsBannerZoom: number;
    communitySettingsBannerUploadError: string | null;
    isSettingsAvatarDragOver: boolean;
    communitySettingsAvatarUrl: string | null;
    communitySettingsName: string;
    communitySettingsSlug: string;
    communitySettingsOneLiner: string;
    communitySettingsAbout: string;
    communitySettingsVisibility: string;
    communitySettingsPricingMode: CommunityPricingMode;
    communitySettingsPriceUsdMonthly: string;
    communitySettingsPriceUsdAnnual: string;
    isCommunitySettingsDirty: boolean;
    isLoadingCommunitySettings: boolean;
    isCommunitySettingsReady: boolean;
    communitySettingsConflict: boolean;
    communitySettingsError: string | null;
    isSavingCommunitySettings: boolean;
    communityMemberMuted: boolean;
    isLoadingCommunityMemberSettings: boolean;
    isLeavingCommunity: boolean;
    communityMemberSettingsError: string | null;
    isArchivingCommunity: boolean;
    communityArchiveError: string | null;
  };
  actions: {
    setIsSettingsBannerDragOver: (value: boolean) => void;
    handleSettingsBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
    handleCommunityBannerUpload: (file: File | null) => Promise<void> | void;
    setCommunitySettingsBannerUrl: (value: string | null) => void;
    setCommunitySettingsBannerFocusX: (value: number) => void;
    setCommunitySettingsBannerFocusY: (value: number) => void;
    setCommunitySettingsBannerZoom: (value: number) => void;
    setCommunitySettingsBannerUploadError: (value: string | null) => void;
    openCommunityBannerFocusModal: () => void;
    closeCommunityBannerFocusModal: () => void;
    markCommunitySettingsDirty: () => void;
    setIsSettingsAvatarDragOver: (value: boolean) => void;
    handleSettingsAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
    communityInitials: (value: string) => string;
    handleCommunityAvatarUpload: (file: File | null) => Promise<void> | void;
    setCommunitySettingsAvatarUrl: (value: string | null) => void;
    setCommunitySettingsAvatarFocusX: (value: number) => void;
    setCommunitySettingsAvatarFocusY: (value: number) => void;
    setCommunitySettingsAvatarZoom: (value: number) => void;
    openCommunityAvatarFocusModal: () => void;
    closeCommunityAvatarFocusModal: () => void;
    setCommunitySettingsName: (value: string) => void;
    setCommunitySettingsSlug: (value: string) => void;
    slugifyCommunityName: (value: string) => string;
    setCommunitySettingsOneLiner: (value: string) => void;
    setCommunitySettingsAbout: (value: string) => void;
    setCommunitySettingsVisibility: (value: string) => void;
    setCommunitySettingsPricingMode: (value: CommunityPricingMode) => void;
    setCommunitySettingsPriceUsdMonthly: (value: string) => void;
    setCommunitySettingsPriceUsdAnnual: (value: string) => void;
    handleCancelCommunitySettings: () => void;
    handleReloadLatestCommunitySettings: () => Promise<void> | void;
    handleSaveCommunitySettings: () => Promise<void> | void;
    handleToggleCommunityMute: (value: boolean) => Promise<void> | void;
    handleLeaveCommunity: () => Promise<void> | void;
    handleArchiveCommunity: () => Promise<void> | void;
  };
};

type SharedSettingsProps = Pick<WebCommunitySettingsSectionProps, "state" | "actions">;

// The sections that share the community's saved form.
const FORM_PANES: CommunitySettingsPane[] = ["community", "plans", "app"];

// General as rows (after Linear's settings). Everything saves as you change it
// (see useAutosave below); Archive sits at the bottom.
function CommunityGeneralSettingsV1({
  activeCommunity,
  isOwner,
  state,
  actions,
}: SharedSettingsProps & { activeCommunity: ActiveCommunity; isOwner: boolean }) {
  // Listed but not showing yet: what Discover still needs (shown under the switch).
  const discoverGap = discoverListingGap({
    listed: state.communitySettingsVisibility === "published",
    hasBanner: Boolean(state.communitySettingsBannerUrl),
    oneLiner: state.communitySettingsOneLiner,
  });
  const [confirmArchive, setConfirmArchive] = useState(false);
  useEffect(() => { setConfirmArchive(false); }, [activeCommunity.id]);
  const name = state.communitySettingsName || activeCommunity?.name || "Community";
  const fileButton = (label: string, onFile: (file: File | null) => void, disabled?: boolean) => (
    <label className={`settings-v1-button${disabled ? " is-disabled" : ""}`}>
      {label}
      <input type="file" accept="image/*" disabled={disabled} onChange={(event) => {
        const file = event.target.files?.[0] ?? null;
        event.target.value = "";
        onFile(file);
      }} />
    </label>
  );
  return (
    <>
      <SettingsGroup>
        {isOwner ? (
          <SettingsRow label="Logo" help="Square, shown beside the name everywhere.">
            <CommunityAvatar
              className="settings-v1-logo"
              imageUrl={state.communitySettingsAvatarUrl}
              focusX={state.communitySettingsAvatarFocusX}
              focusY={state.communitySettingsAvatarFocusY}
              zoom={state.communitySettingsAvatarZoom}
              name={name}
              alt="Community logo"
              fallback={actions.communityInitials(name)}
            />
            {fileButton(state.communitySettingsAvatarUrl ? "Change" : "Upload", (file) => void actions.handleCommunityAvatarUpload(file))}
            {state.communitySettingsAvatarUrl ? (
              <>
                <button className="settings-v1-button" type="button" onClick={actions.openCommunityAvatarFocusModal}>Adjust</button>
                <button className="settings-v1-button is-quiet" type="button" onClick={() => {
                  actions.setCommunitySettingsAvatarUrl(null);
                  actions.setCommunitySettingsAvatarFocusX(0.5);
                  actions.setCommunitySettingsAvatarFocusY(0.5);
                  actions.setCommunitySettingsAvatarZoom(1);
                  actions.closeCommunityAvatarFocusModal();
                  actions.markCommunitySettingsDirty();
                }}>Remove</button>
              </>
            ) : null}
          </SettingsRow>
        ) : null}
        {isOwner ? (
          <SettingsRow
            label="Banner"
            help={state.communitySettingsBannerUploadError
              ? <span className="settings-v1-error">{state.communitySettingsBannerUploadError}</span>
              : state.isProcessingCommunitySettingsBanner ? "Processing…" : "Wide image at the top of the left column."}
          >
            <StableFramedMedia
              className="settings-v1-banner"
              imageUrl={state.communitySettingsBannerUrl}
              frame={{ focusX: state.communitySettingsBannerFocusX, focusY: state.communitySettingsBannerFocusY, zoom: state.communitySettingsBannerZoom }}
              alt="Community banner"
              loading="eager"
              fallback={<div className="settings-v1-banner-empty" />}
            />
            {fileButton(state.communitySettingsBannerUrl ? "Change" : "Upload", (file) => void actions.handleCommunityBannerUpload(file), state.isProcessingCommunitySettingsBanner)}
            {state.communitySettingsBannerUrl ? (
              <>
                <button className="settings-v1-button" type="button" disabled={state.isProcessingCommunitySettingsBanner} onClick={actions.openCommunityBannerFocusModal}>Adjust</button>
                <button className="settings-v1-button is-quiet" type="button" disabled={state.isProcessingCommunitySettingsBanner} onClick={() => {
                  actions.setCommunitySettingsBannerUrl(null);
                  actions.setCommunitySettingsBannerFocusX(0.5);
                  actions.setCommunitySettingsBannerFocusY(0.5);
                  actions.setCommunitySettingsBannerZoom(1);
                  actions.setCommunitySettingsBannerUploadError(null);
                  actions.closeCommunityBannerFocusModal();
                  actions.markCommunitySettingsDirty();
                }}>Remove</button>
              </>
            ) : null}
          </SettingsRow>
        ) : null}
        <SettingsRow label="Name" htmlFor="settings-community-name">
          <input id="settings-community-name" className="settings-v1-input" type="text" value={state.communitySettingsName} disabled={!isOwner}
            onChange={(event) => { actions.setCommunitySettingsName(event.target.value); actions.markCommunitySettingsDirty(); }} />
        </SettingsRow>
        {isOwner ? (
          <SettingsRow label="Address" htmlFor="settings-community-slug" help={`Its link: /c/${state.communitySettingsSlug || "your-community"}`}>
            <input id="settings-community-slug" className="settings-v1-input" type="text" maxLength={32} value={state.communitySettingsSlug}
              onChange={(event) => { actions.setCommunitySettingsSlug(actions.slugifyCommunityName(event.target.value)); actions.markCommunitySettingsDirty(); }} />
          </SettingsRow>
        ) : null}
        <SettingsRow label="One-liner" htmlFor="settings-community-one-liner" help="Shown on Discover and when people join.">
          <input id="settings-community-one-liner" className="settings-v1-input" type="text" value={state.communitySettingsOneLiner}
            placeholder="Who it's for, in one line"
            onChange={(event) => { actions.setCommunitySettingsOneLiner(event.target.value); actions.markCommunitySettingsDirty(); }} />
        </SettingsRow>
        <SettingsRow label="About" htmlFor="settings-community-about" stacked>
          <textarea id="settings-community-about" className="settings-v1-input" rows={4} value={state.communitySettingsAbout}
            placeholder="What members get, and who it's for."
            onChange={(event) => { actions.setCommunitySettingsAbout(event.target.value); actions.markCommunitySettingsDirty(); }} />
        </SettingsRow>
      </SettingsGroup>
      {isOwner ? (
        <SettingsGroup label="Visibility">
          <SettingsRow label="Listed in Discover" help={discoverGap
            ? <>Anyone can find it. Joining still goes through your plans or approval. <span style={{ display: "block", marginTop: 4, color: "var(--text-ink)" }}>{discoverGap}</span></>
            : "Anyone can find it. Joining still goes through your plans or approval."}>
            <SettingsSwitch
              label="Listed in Discover"
              checked={state.communitySettingsVisibility === "published"}
              onChange={(checked) => { actions.setCommunitySettingsVisibility(checked ? "published" : "unlisted"); actions.markCommunitySettingsDirty(); }}
            />
          </SettingsRow>
        </SettingsGroup>
      ) : null}
      {isOwner ? (
        <SettingsGroup label="Danger zone" tone="danger">
          <SettingsRow
            label="Archive community"
            help={state.communityArchiveError
              ? <span className="settings-v1-error">{state.communityArchiveError}</span>
              : "Freezes it and stops subscriptions. Content is kept and it can be restored."}
          >
            {confirmArchive ? (
              <>
                <button className="settings-v1-button" type="button" disabled={state.isArchivingCommunity} onClick={() => setConfirmArchive(false)}>Cancel</button>
                <button className="settings-v1-button is-danger" type="button" disabled={state.isArchivingCommunity} onClick={() => void actions.handleArchiveCommunity()}>
                  {state.isArchivingCommunity ? "Archiving…" : "Confirm archive"}
                </button>
              </>
            ) : (
              <button className="settings-v1-button is-danger" type="button" disabled={state.isArchivingCommunity} onClick={() => setConfirmArchive(true)}>Archive</button>
            )}
          </SettingsRow>
        </SettingsGroup>
      ) : null}
    </>
  );
}

// Saves as you go: when a field is committed (a text field loses focus, a
// select or switch changes) or a picture changes, the form saves.
function useAutosave(enabled: boolean, rootRef: { current: HTMLElement | null }, state: SharedSettingsProps["state"], save: () => Promise<void> | void) {
  const latest = useRef({ state, save });
  latest.current = { state, save };
  const trySave = useCallback(() => {
    const { state: now, save: run } = latest.current;
    if (!now.isCommunitySettingsDirty || now.isSavingCommunitySettings || now.isProcessingCommunitySettingsBanner || now.communitySettingsConflict) return;
    const active = document.activeElement;
    // Still typing in a field of this page: wait for it to be committed.
    if (active && rootRef.current?.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && (active as HTMLInputElement).type !== "file") return;
    void run();
  }, [rootRef]);
  // Handlers go on the page's root as React props, so they follow the root
  // when it mounts late (it renders only once access has loaded).
  const onCommit = useCallback(() => { if (enabled) window.setTimeout(trySave, 0); }, [enabled, trySave]);
  // Pictures and switches change without a committed field.
  const media = [state.communitySettingsAvatarUrl, state.communitySettingsAvatarFocusX, state.communitySettingsAvatarFocusY, state.communitySettingsAvatarZoom,
    state.communitySettingsBannerUrl, state.communitySettingsBannerFocusX, state.communitySettingsBannerFocusY, state.communitySettingsBannerZoom,
    state.communitySettingsVisibility, state.communitySettingsPricingMode, state.isProcessingCommunitySettingsBanner,
    // A save that finishes while edits are still unsaved goes again.
    state.isSavingCommunitySettings].join("|");
  useEffect(() => { if (enabled) window.setTimeout(trySave, 0); }, [enabled, media, trySave]);
  return { onChange: onCommit, onBlur: onCommit, onClick: onCommit };
}

function CommunityMonetizationConfigSection({
  activeCommunity,
  accountCommerceStatus,
  communityPlatformFeeBps,
  accountCommerceError,
  startStripeConnectOnboarding,
  isStartingStripeConnectOnboarding,
  canManagePayoutAccount,
  state,
  actions,
}: SharedSettingsProps & {
  activeCommunity: ActiveCommunity;
  accountCommerceStatus: AccountCommerceStatus | null;
  communityPlatformFeeBps: number | null;
  accountCommerceError: string | null;
  startStripeConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  }) => Promise<void> | void;
  isStartingStripeConnectOnboarding: boolean;
  canManagePayoutAccount: boolean;
}) {
  const pricingOptions = [
    { key: "free", label: "Free" },
    { key: "monthly", label: "Monthly" },
    { key: "annual", label: "Annual" },
  ] as Array<{ key: CommunityPricingMode; label: string }>;
  const stripeConnectPresentation = buildStripeConnectPresentation({
    accountCommerceStatus,
    surface: "community",
    platformFeeBpsOverride: communityPlatformFeeBps,
  });
  const canReceiveCommunityRevenue = stripeConnectPresentation.isReady;
  const platformFeePercent = Number(
    communityPlatformFeeBps ?? accountCommerceStatus?.platform_fee_bps ?? 0,
  ) / 100;
  const canMonetizeCommunities = platformFeePercent > 0;
  const needsStripeConnect = !canMonetizeCommunities || !canReceiveCommunityRevenue;
  const storedStripeConnectCountry = accountCommerceStatus?.stripe_connect.country ?? null;
  const [stripeConnectCountry, setStripeConnectCountry] = useState("");
  useEffect(() => {
    if (storedStripeConnectCountry) {
      setStripeConnectCountry(storedStripeConnectCountry);
    }
  }, [storedStripeConnectCountry]);
  const selectedStripeConnectCountry = stripeConnectCountry || storedStripeConnectCountry || "";
  const stripeConnectCountryLabel = formatStripeConnectCountry(selectedStripeConnectCountry);
  const needsStripeConnectCountry = !canReceiveCommunityRevenue && !selectedStripeConnectCountry;

  const priceRow = (mode: "monthly" | "annual") => {
    const monthly = mode === "monthly";
    return (
      <SettingsRow label={monthly ? "Monthly price" : "Annual price"} htmlFor={`pricing-${mode}`} help={monthly ? "Billed monthly." : "Billed once a year."}>
        <span className="settings-v1-prefixed"><span aria-hidden="true">$</span>
          <input id={`pricing-${mode}`} className="settings-v1-input" type="text" inputMode="decimal" placeholder={monthly ? "29" : "290"}
            value={monthly ? state.communitySettingsPriceUsdMonthly : state.communitySettingsPriceUsdAnnual} disabled={needsStripeConnect}
            onChange={(event) => {
              if (monthly) actions.setCommunitySettingsPriceUsdMonthly(event.target.value);
              else actions.setCommunitySettingsPriceUsdAnnual(event.target.value);
              actions.markCommunitySettingsDirty();
            }} />
        </span>
      </SettingsRow>
    );
  };
  const feeLine = `Paid memberships: ${platformFeePercent.toFixed(1)}% Polynet fee, plus Stripe's.`;
  return (
    <>
      <SettingsGroup label="Base price">
        <SettingsRow label="Price" help={needsStripeConnect ? "Connect Stripe below to charge." : "What the base membership costs."}>
          <SettingsSegmented
            label="Pricing options"
            value={state.communitySettingsPricingMode}
            options={pricingOptions.map((opt) => ({ id: opt.key, label: opt.label, disabled: opt.key !== "free" && needsStripeConnect }))}
            onChange={(value) => { actions.setCommunitySettingsPricingMode(value); actions.markCommunitySettingsDirty(); }}
          />
        </SettingsRow>
        {state.communitySettingsPricingMode === "monthly" ? priceRow("monthly") : null}
        {state.communitySettingsPricingMode === "annual" ? priceRow("annual") : null}
      </SettingsGroup>
      <SettingsGroup label="Payments">
        {!canMonetizeCommunities ? (
          <SettingsRow label="Stripe" help="Paid memberships aren't available for this account yet." />
        ) : canReceiveCommunityRevenue ? (
          <SettingsRow label="Stripe" help={`Connected${stripeConnectCountryLabel ? ` · ${stripeConnectCountryLabel}` : ""}. ${feeLine}`}>
            {canManagePayoutAccount ? (
              <SettingsButton disabled={isStartingStripeConnectOnboarding} onClick={() => void startStripeConnectOnboarding({ context: "community", communitySlug: activeCommunity.slug, country: selectedStripeConnectCountry || null })}>
                {isStartingStripeConnectOnboarding ? "Opening…" : "Open Stripe"}
              </SettingsButton>
            ) : null}
          </SettingsRow>
        ) : (
          <>
            <SettingsRow label="Stripe" help={<>
              {stripeConnectPresentation.statusMessage}
              {stripeConnectPresentation.requirementsPreview.length > 0 ? <><br />Stripe still needs: {stripeConnectPresentation.requirementsPreview.join(", ")}.</> : null}
              {canManagePayoutAccount ? null : <><br />The owner must finish Stripe setup first.</>}
            </>}>
              {canManagePayoutAccount ? (
                <SettingsButton variant="primary" disabled={isStartingStripeConnectOnboarding || needsStripeConnectCountry} onClick={() => void startStripeConnectOnboarding({ context: "community", communitySlug: activeCommunity.slug, country: selectedStripeConnectCountry || null })}>
                  {isStartingStripeConnectOnboarding ? "Opening…" : stripeConnectPresentation.connectCtaLabel}
                </SettingsButton>
              ) : null}
            </SettingsRow>
            {canManagePayoutAccount ? (
              <SettingsRow label="Payout country" htmlFor="stripe-country" help="Where your business is legally based.">
                <SettingsSelect id="stripe-country" value={selectedStripeConnectCountry} disabled={isStartingStripeConnectOnboarding}
                  onChange={(event) => setStripeConnectCountry(event.target.value)}>
                  <option value="">Select country</option>
                  {STRIPE_CONNECT_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
                </SettingsSelect>
              </SettingsRow>
            ) : null}
          </>
        )}
      </SettingsGroup>
      {accountCommerceError ? <SettingsNote tone="error">{accountCommerceError}</SettingsNote> : null}
    </>
  );
}

function CommunityMemberSettingsSection({
  activeCommunity,
  state,
  actions,
  session,
  ensureSession,
}: SharedSettingsProps & {
  activeCommunity: ActiveCommunity;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  return (
    <div className="create-community-form community-settings-form settings-page-v1">
      <SettingsPageHead title="Membership" />
      <SettingsGroup label="Notifications">
        <SettingsRow label="Mute this community"
          help={state.communityMemberSettingsError ? <span className="settings-v1-error">{state.communityMemberSettingsError}</span>
            : "Fewer notifications and no attention dots from it."}>
          <SettingsSwitch label="Mute this community" checked={state.communityMemberMuted} disabled={state.isLoadingCommunityMemberSettings}
            onChange={(checked) => void actions.handleToggleCommunityMute(checked)} />
        </SettingsRow>
        <MemberCoachPreferenceRow
          communityId={activeCommunity.id}
          session={session}
          ensureSession={ensureSession}
        />
      </SettingsGroup>
      <Suspense fallback={null}>
        <GuideSoulMemoryCards
          mode="personal"
          communityId={activeCommunity.id}
          session={session}
          ensureSession={ensureSession}
        />
      </Suspense>
      <GuideAllowedSettings communityId={activeCommunity.id} session={session} />
      <CommunityMyPlanSection communityId={activeCommunity.id} session={session} ensureSession={ensureSession} />
      <SettingsGroup label="Danger zone" tone="danger">
        <SettingsRow label={`Leave ${activeCommunity.name}`} help="You lose access to it. You can join again later.">
          {confirmLeave ? (
            <>
              <SettingsButton variant="quiet" disabled={state.isLeavingCommunity} onClick={() => setConfirmLeave(false)}>Cancel</SettingsButton>
              <SettingsButton variant="danger" disabled={state.isLeavingCommunity} onClick={() => void actions.handleLeaveCommunity()}>
                {state.isLeavingCommunity ? "Leaving…" : "Confirm leave"}
              </SettingsButton>
            </>
          ) : (
            <SettingsButton variant="danger" onClick={() => setConfirmLeave(true)}>Leave</SettingsButton>
          )}
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

export function WebCommunitySettingsSection(props: WebCommunitySettingsSectionProps) {
  const {
    activeCommunity,
    hasSession,
    isResolvingCommunityAccess,
    communityAccessLoadError,
    onRetryCommunityAccess,
    canViewActiveCommunitySettings,
    communitySettingsLayer,
    activePane,
    onSelectPane,
    canManageCommunitySettings,
    canManageMembersActiveCommunity,
    aiAgentProps,
    requireSignIn,
    accountCommerceStatus,
    communityPlatformFeeBps,
    accountCommerceError,
    startStripeConnectOnboarding,
    isStartingStripeConnectOnboarding,
    state,
    actions,
  } = props;
  const isOwnerSettingsLayer = communitySettingsLayer === "owner";
  const settingsPaneAccess = {
    canViewSettings: canViewActiveCommunitySettings,
    canManageSettings: canManageCommunitySettings,
    canManageMembers: canManageMembersActiveCommunity,
    isOwner: isOwnerSettingsLayer,
  };
  // Danger is folded into General (Archive at its bottom).
  const availableSettingsPanes: CommunitySettingsPane[] = listCommunitySettingsPanesForAccess(settingsPaneAccess)
    .filter((pane) => pane !== "danger");
  const normalizedPane = normalizeCommunitySettingsPaneForAccess(activePane, settingsPaneAccess);
  const selectedSettingsPane = availableSettingsPanes.includes(normalizedPane) ? normalizedPane : (availableSettingsPanes[0] ?? "community");
  const isFormPane = FORM_PANES.includes(selectedSettingsPane);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const autosave = useAutosave(isFormPane, pageRef, state, actions.handleSaveCommunitySettings);
  const availableSettingsPaneKey = availableSettingsPanes.join("|");
  const accessPresentationState = deriveCommunitySettingsAccessPresentation({
    hasActiveCommunity: Boolean(activeCommunity),
    hasAuthenticatedPresentation: hasSession,
    isResolvingAccess: isResolvingCommunityAccess,
    accessLoadError: communityAccessLoadError,
    canView: canViewActiveCommunitySettings,
  });
  const resolvedActiveCommunity = activeCommunity as ActiveCommunity;

  useEffect(() => {
    if (availableSettingsPanes.length > 0 && !availableSettingsPanes.includes(activePane)) {
      onSelectPane(availableSettingsPanes[0]!, { replace: true });
    }
  }, [activePane, availableSettingsPaneKey, onSelectPane]);

  useEffect(() => {
    if (!state.communitySettingsAvatarUrl && state.isCommunityAvatarFocusModalOpen) {
      actions.closeCommunityAvatarFocusModal();
    }
  }, [actions, state.communitySettingsAvatarUrl, state.isCommunityAvatarFocusModalOpen]);

  useEffect(() => {
    if (!state.communitySettingsBannerUrl && state.isCommunityBannerFocusModalOpen) {
      actions.closeCommunityBannerFocusModal();
    }
  }, [actions, state.communitySettingsBannerUrl, state.isCommunityBannerFocusModalOpen]);

  return (
    <div className="settings-panel community-settings-panel">
      {accessPresentationState === "select_community" ? (
        <div className="chat-empty">Select a community to view settings.</div>
      ) : accessPresentationState === "sign_in" ? (
        <div className="chat-empty">
          <div>Sign in to view community settings.</div>
          <button
            className="secondary"
            type="button"
            onClick={requireSignIn}
            style={{ marginTop: 12 }}
          >
            Sign in
          </button>
        </div>
      ) : accessPresentationState === "resolving" ? (
        <div className="create-community-form community-settings-form settings-page-v1">
          <FormGroupsSkeleton label="Loading community settings…" />
        </div>
      ) : accessPresentationState === "failed" ? (
        <div className="chat-empty">
          <div>{communityAccessLoadError}</div>
          <button
            className="secondary"
            type="button"
            onClick={onRetryCommunityAccess}
            style={{ marginTop: 12 }}
          >
            Retry
          </button>
        </div>
      ) : accessPresentationState === "denied" ? (
        <div className="chat-empty">You do not have access to this community's settings.</div>
      ) : !canManageCommunitySettings ? (
        <CommunityMemberSettingsSection
          activeCommunity={resolvedActiveCommunity}
          state={state}
          actions={actions}
          session={props.session}
          ensureSession={props.ensureSession}
        />
      ) : (
        <div ref={pageRef} {...autosave} className="create-community-form community-settings-form settings-page-v1">
          <div
            id={platformTabPanelId("community-settings", selectedSettingsPane)}
            role="tabpanel"
            aria-labelledby={platformTabId("community-settings", selectedSettingsPane)}
            tabIndex={0}
            className="community-settings-pane-content"
          >
            <div className="settings-page-head">
              <h1 className="settings-page-title">{COMMUNITY_SETTINGS_PANE_LABELS[selectedSettingsPane]}</h1>
              {isFormPane && selectedSettingsPane !== "app" && state.isCommunitySettingsReady ? (
                <span className="settings-v1-status-row">
                  <SettingsSaveStatus saving={state.isSavingCommunitySettings} dirty={state.isCommunitySettingsDirty} error={state.communitySettingsError} />
                  {state.communitySettingsConflict ? (
                    <button className="settings-v1-button" type="button" disabled={state.isLoadingCommunitySettings}
                      onClick={() => void actions.handleReloadLatestCommunitySettings()}>Reload latest</button>
                  ) : null}
                </span>
              ) : null}
            </div>
            {isFormPane && state.isLoadingCommunitySettings ? (
              <FormGroupsSkeleton label="Loading community settings…" />
            ) : null}
            {isFormPane &&
            !state.isLoadingCommunitySettings &&
            !state.isCommunitySettingsReady ? (
              <div className="chat-empty">
                <div>{state.communitySettingsError ?? "Community settings are unavailable."}</div>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void actions.handleReloadLatestCommunitySettings()}
                  style={{ marginTop: 12 }}
                >
                  Try again
                </button>
              </div>
            ) : null}
            {selectedSettingsPane === "community" && !state.isLoadingCommunitySettings && state.isCommunitySettingsReady ? (
              <CommunityGeneralSettingsV1 activeCommunity={resolvedActiveCommunity} isOwner={isOwnerSettingsLayer} state={state} actions={actions} />
            ) : null}
            {isFormPane && selectedSettingsPane !== "community" &&
            !state.isLoadingCommunitySettings &&
            state.isCommunitySettingsReady ? (
              <div className="community-general-settings">
                <div className="community-general-settings-grid without-branding">
                  <div className="community-general-settings-secondary">
                    {isOwnerSettingsLayer && selectedSettingsPane === "plans" ? (
                      <CommunityPlansSection
                        communityId={resolvedActiveCommunity.id}
                        session={props.session}
                        ensureSession={props.ensureSession}
                      />
                    ) : null}
                    {isOwnerSettingsLayer && selectedSettingsPane === "app" ? (
                      <CommunityConnectedAppsSection
                        communityId={resolvedActiveCommunity.id}
                        communityName={resolvedActiveCommunity.name}
                        communitySlug={resolvedActiveCommunity.slug}
                        session={props.session}
                        ensureSession={props.ensureSession}
                      />
                    ) : null}
                    {selectedSettingsPane === "plans" ? (
                      <CommunityMonetizationConfigSection
                        activeCommunity={resolvedActiveCommunity}
                        accountCommerceStatus={accountCommerceStatus}
                        communityPlatformFeeBps={communityPlatformFeeBps}
                        accountCommerceError={accountCommerceError}
                        startStripeConnectOnboarding={startStripeConnectOnboarding}
                        isStartingStripeConnectOnboarding={isStartingStripeConnectOnboarding}
                        canManagePayoutAccount={isOwnerSettingsLayer}
                        state={state}
                        actions={actions}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {selectedSettingsPane === "agent" ? (
              <Suspense fallback={null}>
                <WebCommunityAiAgentSection {...aiAgentProps} embedded />
              </Suspense>
            ) : null}
            {/* What the guide does for this person without asking: theirs alone. */}
            {selectedSettingsPane === "agent" ? (
              <Suspense fallback={null}>
                <GuideSoulMemoryCards
                  mode="personal"
                  communityId={resolvedActiveCommunity.id}
                  session={props.session}
                  ensureSession={props.ensureSession}
                />
              </Suspense>
            ) : null}
            {selectedSettingsPane === "agent" ? (
              <BuilderHeartbeatPreferenceSection
                communityId={resolvedActiveCommunity.id}
                session={props.session}
                ensureSession={props.ensureSession}
              />
            ) : null}
            {selectedSettingsPane === "agent" ? (
              <GuideAllowedSettings communityId={resolvedActiveCommunity.id} session={props.session} />
            ) : null}
            {/* House rules for members' own AIs: free or paid, whether or not the guide is on. */}
            {selectedSettingsPane === "agent" ? (
              <Suspense fallback={null}>
                <WebCommunityAiRulesEditor
                  communityId={resolvedActiveCommunity.id}
                  session={props.session}
                  ensureSession={props.ensureSession}
                />
              </Suspense>
            ) : null}
            {selectedSettingsPane === "agent" && isOwnerSettingsLayer ? (
              <Suspense fallback={null}>
                <GuideSoulMemoryCards
                  mode="community"
                  communityId={resolvedActiveCommunity.id}
                  session={props.session}
                  ensureSession={props.ensureSession}
                />
                <CommunityFounderBriefSection
                  communityId={resolvedActiveCommunity.id}
                  session={props.session}
                  ensureSession={props.ensureSession}
                />
                <CommunityMemberCoachSettingsSection
                  communityId={resolvedActiveCommunity.id}
                  session={props.session}
                  ensureSession={props.ensureSession}
                />
              </Suspense>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
