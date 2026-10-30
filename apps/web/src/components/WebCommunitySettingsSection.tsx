import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentProps, type DragEvent, type ReactNode } from "react";
import { ArrowRight, ImageUp, Megaphone } from "lucide-react";
import { buildCommunityTabPath } from "../../../../shared/webAppRouteState";
import type { CommunitySettingsLayer } from "../../../../shared/communityAccessViewModel";
import { deriveCommunitySettingsAccessPresentation } from "../../../../shared/communityAccessResolution";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import { formatStripeConnectCountry } from "../../../../shared/stripeConnectCountries";
import {
  listCommunitySettingsPanesForAccess,
  normalizeCommunitySettingsPaneForAccess,
  type CommunitySettingsPane,
} from "../../../../shared/appShellNavigation";
import { buildStripeConnectPresentation } from "../controllers/buildStripeConnectPresentation";
import { StripeConnectCountrySelect } from "./StripeConnectCountrySelect";
import { StripeSetupButton } from "./StripeSetupButton";
import { WebCommunityAiAgentSection } from "./WebCommunityAiAgentSection";
import { WebCommunityAgentProfileCard } from "./WebCommunityAgentProfileCard";
import { buildCommunitySettingsNav, WebCommunitySettingsNav } from "./WebCommunitySettingsNav";
import "./WebCommunitySettings.css";

// Panes only the owner and their team open load on demand, so members never
// download them (scripts/web_bundle_budget_check.mjs).
const WebCommunityCreatorsSettings = lazy(() =>
  import("./WebCommunityCreatorsSettings").then((module) => ({ default: module.WebCommunityCreatorsSettings })));
const WebCommunityAppearanceSettings = lazy(() =>
  import("./WebCommunityAppearanceSettings").then((module) => ({ default: module.WebCommunityAppearanceSettings })));
const WebCommunityOffersSettings = lazy(() =>
  import("./WebCommunityOffersSettings").then((module) => ({ default: module.WebCommunityOffersSettings })));
const WebCommunitySalesPageSettings = lazy(() =>
  import("./WebCommunitySalesPageSettings").then((module) => ({ default: module.WebCommunitySalesPageSettings })));
const WebCommunitySettingProposals = lazy(() =>
  import("./WebCommunitySettingProposals").then((module) => ({ default: module.WebCommunitySettingProposals })));
import { WebCommunityAccessSettings, WebCommunityMyAccessCard } from "./WebCommunityAccess";
import { useCommunityAccessGatewayForSession, type CommunityAccessGateway } from "../controllers/useWebCommunityAccessGateway";
import { useWebCommunityFrame } from "../controllers/useWebCommunityFrame";

// Community Settings, after Substack's admin: a side nav (with search) beside
// one column of section cards. General saves as you type; the sales page and
// the look keep a draft until Publish, because members would see them.

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
  aiAgentProps: ComponentProps<typeof WebCommunityAiAgentSection>;
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

const PANE_TITLES: Record<CommunitySettingsPane, string> = {
  community: "General",
  sales_page: "Sales page",
  offers: "Offers",
  appearance: "Appearance",
  agent: "Agent",
  creators: "Creators",
  access: "Access",
  danger: "Archive",
};

// Plain settings save themselves this long after the last change.
const AUTOSAVE_DELAY_MS = 900;

function openInAppPath(path: string) {
  window.history.pushState(window.history.state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function SettingsCard(props: {
  id?: string;
  title: string;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const titleId = props.id ? `${props.id}-title` : undefined;
  return (
    <section
      id={props.id}
      className={`settings-section pn-settings-card${props.className ? ` ${props.className}` : ""}`}
      aria-labelledby={titleId}
    >
      <header className="pn-settings-card-header">
        <h2 className="settings-section-title" id={titleId}>{props.title}</h2>
        {props.description ? <p className="settings-section-desc">{props.description}</p> : null}
      </header>
      <div className="pn-settings-card-body">{props.children}</div>
    </section>
  );
}

// One setting: a label with help under it. A small control (select, toggle,
// button) sits on the label's row; a text field goes full width below.
function SettingsRow(props: {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="pn-settings-row">
      <div className="pn-settings-row-head">
        <div className="pn-settings-row-text">
          {props.htmlFor ? (
            <label className="pn-settings-label" htmlFor={props.htmlFor}>{props.label}</label>
          ) : (
            <span className="pn-settings-label">{props.label}</span>
          )}
          {props.help ? <span className="pn-settings-help">{props.help}</span> : null}
        </div>
        {props.control ? <div className="pn-settings-row-control">{props.control}</div> : null}
      </div>
      {props.children ? <div className="pn-settings-row-field">{props.children}</div> : null}
    </div>
  );
}

function SettingsSwitch(props: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      className={`pn-settings-switch${props.checked ? " is-on" : ""}`}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}

type SaveStatus = "saved" | "pending" | "waiting" | "saving" | "error";

function SaveStatusPill(props: { status: SaveStatus; onRetry?: () => void }) {
  const text = {
    saved: "Saved",
    pending: "Unsaved changes",
    waiting: "Not saved yet",
    saving: "Saving…",
    error: "Not saved",
  }[props.status];
  return (
    <span className={`pn-settings-save-pill is-${props.status}`} role="status" aria-live="polite">
      <span className="pn-settings-save-dot" aria-hidden="true" />
      {text}
      {props.status === "error" && props.onRetry ? (
        <button type="button" className="pn-settings-link" onClick={props.onRetry}>Retry</button>
      ) : null}
    </span>
  );
}

// What blocks a save while someone is still typing, so autosave waits rather
// than flashing an error at a half-written value.
function incompleteSettingsHint(state: WebCommunitySettingsSectionProps["state"]): string | null {
  if (!state.communitySettingsName.trim()) return "Give the community a name to save.";
  const slug = state.communitySettingsSlug.trim();
  if (slug.length < 3) return "The address needs at least 3 characters.";
  if (state.communitySettingsPricingMode === "monthly" && !state.communitySettingsPriceUsdMonthly.trim()) {
    return "Enter a monthly price to save.";
  }
  if (state.communitySettingsPricingMode === "annual" && !state.communitySettingsPriceUsdAnnual.trim()) {
    return "Enter an annual price to save.";
  }
  return null;
}

/**
 * General settings save on change, like Substack's: no Save button. Each
 * change waits a moment for more typing, then saves the whole form through
 * the same handler the old Save button used. A failed save isn't retried
 * until something changes or the owner presses Retry.
 */
function useCommunitySettingsAutosave({ state, actions }: SharedSettingsProps): {
  status: SaveStatus;
  hint: string | null;
  retry: () => void;
} {
  const valuesKey = JSON.stringify([
    state.communitySettingsName,
    state.communitySettingsSlug,
    state.communitySettingsOneLiner,
    state.communitySettingsAbout,
    state.communitySettingsVisibility,
    state.communitySettingsPricingMode,
    state.communitySettingsPriceUsdMonthly,
    state.communitySettingsPriceUsdAnnual,
    state.communitySettingsAvatarUrl,
    state.communitySettingsAvatarFocusX,
    state.communitySettingsAvatarFocusY,
    state.communitySettingsAvatarZoom,
    state.communitySettingsBannerUrl,
    state.communitySettingsBannerFocusX,
    state.communitySettingsBannerFocusY,
    state.communitySettingsBannerZoom,
  ]);
  const lastAttemptKey = useRef<string | null>(null);
  const hint = state.isCommunitySettingsDirty ? incompleteSettingsHint(state) : null;
  const failed = Boolean(state.communitySettingsError) && lastAttemptKey.current === valuesKey;
  const canSave =
    state.isCommunitySettingsDirty &&
    !state.isSavingCommunitySettings &&
    !state.isProcessingCommunitySettingsBanner &&
    !state.communitySettingsConflict &&
    !hint;

  useEffect(() => {
    if (!canSave || failed) return;
    const timer = window.setTimeout(() => {
      lastAttemptKey.current = valuesKey;
      void actions.handleSaveCommunitySettings();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [actions, canSave, failed, valuesKey]);

  const status: SaveStatus = state.isSavingCommunitySettings || state.isProcessingCommunitySettingsBanner
    ? "saving"
    : failed || state.communitySettingsConflict
      ? "error"
      : hint
        ? "waiting"
        : state.isCommunitySettingsDirty
          ? "pending"
          : "saved";
  return {
    status,
    hint,
    retry: () => {
      lastAttemptKey.current = valuesKey;
      void actions.handleSaveCommunitySettings();
    },
  };
}

function CommunityIdentityCard({
  activeCommunity,
  state,
  actions,
}: SharedSettingsProps & { activeCommunity: ActiveCommunity }) {
  const name = state.communitySettingsName || activeCommunity.name || "Community";
  const bannerBusy = state.isProcessingCommunitySettingsBanner;
  return (
    <SettingsCard id="settings-identity" title="Identity">
      <SettingsRow label="Name" htmlFor="community-settings-name">
        <input
          id="community-settings-name"
          className="pn-settings-input"
          type="text"
          placeholder="Community name"
          value={state.communitySettingsName}
          onChange={(event) => {
            actions.setCommunitySettingsName(event.target.value);
            actions.markCommunitySettingsDirty();
          }}
        />
      </SettingsRow>
      <SettingsRow
        label="Address"
        htmlFor="community-settings-slug"
        help="Letters, numbers and hyphens. Changing it breaks links you've already shared."
      >
        <div className="pn-settings-affix">
          <span aria-hidden="true">/c/</span>
          <input
            id="community-settings-slug"
            className="pn-settings-input"
            type="text"
            placeholder="your-community"
            value={state.communitySettingsSlug}
            maxLength={32}
            onChange={(event) => {
              actions.setCommunitySettingsSlug(actions.slugifyCommunityName(event.target.value));
              actions.markCommunitySettingsDirty();
            }}
          />
        </div>
      </SettingsRow>
      <SettingsRow
        label="Logo"
        help="Square, at least 256px. Shown in the community rail and on your sales page. Drop an image on it or click to replace."
        control={
          <div className="pn-settings-logo">
            <label
              className={`pn-settings-thumb is-logo${state.isSettingsAvatarDragOver ? " is-drag-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                actions.setIsSettingsAvatarDragOver(true);
              }}
              onDragLeave={() => actions.setIsSettingsAvatarDragOver(false)}
              onDrop={(event) => actions.handleSettingsAvatarDrop(event as unknown as DragEvent<HTMLDivElement>)}
            >
              <CommunityAvatar
                className="pn-settings-thumb-media"
                imageUrl={state.communitySettingsAvatarUrl}
                focusX={state.communitySettingsAvatarFocusX}
                focusY={state.communitySettingsAvatarFocusY}
                zoom={state.communitySettingsAvatarZoom}
                name={name}
                alt=""
                fallback={actions.communityInitials(name)}
              />
              <span className="pn-settings-thumb-overlay">
                <ImageUp size={16} strokeWidth={2} aria-hidden="true" />
              </span>
              <input
                type="file"
                accept="image/*"
                aria-label={state.communitySettingsAvatarUrl ? "Replace logo" : "Upload logo"}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  void actions.handleCommunityAvatarUpload(file);
                }}
              />
            </label>
            {state.communitySettingsAvatarUrl ? (
              <div className="pn-settings-thumb-actions">
                <button className="pn-settings-button" type="button" onClick={actions.openCommunityAvatarFocusModal}>Adjust</button>
                <button
                  className="pn-settings-button"
                  type="button"
                  onClick={() => {
                    actions.setCommunitySettingsAvatarUrl(null);
                    actions.setCommunitySettingsAvatarFocusX(0.5);
                    actions.setCommunitySettingsAvatarFocusY(0.5);
                    actions.setCommunitySettingsAvatarZoom(1);
                    actions.closeCommunityAvatarFocusModal();
                    actions.markCommunitySettingsDirty();
                  }}
                >
                  Remove
                </button>
              </div>
            ) : null}
          </div>
        }
      />
      <SettingsRow label="Banner" help="Wide, about 1600×400. It sits at the top of your community and your sales page.">
        <label
          className={`pn-settings-thumb is-banner${state.isSettingsBannerDragOver ? " is-drag-over" : ""}${bannerBusy ? " is-busy" : ""}`}
          aria-busy={bannerBusy || undefined}
          onDragOver={(event) => {
            event.preventDefault();
            actions.setIsSettingsBannerDragOver(true);
          }}
          onDragLeave={() => actions.setIsSettingsBannerDragOver(false)}
          onDrop={(event) => actions.handleSettingsBannerDrop(event as unknown as DragEvent<HTMLDivElement>)}
        >
          <StableFramedMedia
            className="pn-settings-thumb-media"
            imageUrl={state.communitySettingsBannerUrl}
            frame={{
              focusX: state.communitySettingsBannerFocusX,
              focusY: state.communitySettingsBannerFocusY,
              zoom: state.communitySettingsBannerZoom,
            }}
            alt=""
            loading="eager"
            fetchPriority="high"
            fallback={
              <span className="pn-settings-thumb-empty">
                <ImageUp size={20} strokeWidth={2} aria-hidden="true" />
                Add a banner
              </span>
            }
          />
          {state.communitySettingsBannerUrl ? (
            <span className="pn-settings-thumb-overlay">
              <ImageUp size={16} strokeWidth={2} aria-hidden="true" /> Replace
            </span>
          ) : null}
          <input
            type="file"
            accept="image/*"
            disabled={bannerBusy}
            aria-label={state.communitySettingsBannerUrl ? "Replace banner" : "Upload banner"}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void actions.handleCommunityBannerUpload(file);
            }}
          />
        </label>
        <div className="pn-settings-thumb-actions is-row">
          {bannerBusy ? <span className="pn-settings-help" role="status">Processing banner…</span> : null}
          {state.communitySettingsBannerUrl && !bannerBusy ? (
            <>
              <button className="pn-settings-button" type="button" onClick={actions.openCommunityBannerFocusModal}>Adjust</button>
              <button
                className="pn-settings-button"
                type="button"
                onClick={() => {
                  actions.setCommunitySettingsBannerUrl(null);
                  actions.setCommunitySettingsBannerFocusX(0.5);
                  actions.setCommunitySettingsBannerFocusY(0.5);
                  actions.setCommunitySettingsBannerZoom(1);
                  actions.setCommunitySettingsBannerUploadError(null);
                  actions.closeCommunityBannerFocusModal();
                  actions.markCommunitySettingsDirty();
                }}
              >
                Remove
              </button>
            </>
          ) : null}
          {state.communitySettingsBannerUploadError ? (
            <span className="pn-settings-inline-error" role="alert">{state.communitySettingsBannerUploadError}</span>
          ) : null}
        </div>
      </SettingsRow>
    </SettingsCard>
  );
}

function CommunityProfileCard({
  state,
  actions,
  onOpenSalesPage,
}: SharedSettingsProps & { onOpenSalesPage: (() => void) | null }) {
  return (
    <SettingsCard id="settings-profile" title="Public profile" description="Shown on your sales page, in Discover and in the About tab.">
      <SettingsRow label="One-liner" htmlFor="community-settings-one-liner" help="One sentence on who it's for and what they get.">
        <textarea
          id="community-settings-one-liner"
          className="pn-settings-input"
          placeholder="A community for…"
          rows={2}
          value={state.communitySettingsOneLiner}
          onChange={(event) => {
            actions.setCommunitySettingsOneLiner(event.target.value);
            actions.markCommunitySettingsDirty();
          }}
        />
      </SettingsRow>
      <SettingsRow label="About" htmlFor="community-settings-about" help="The longer description. Markdown works: **bold**, lists and links.">
        <textarea
          id="community-settings-about"
          className="pn-settings-input"
          placeholder="Who this community is for, what members get, and how it works."
          rows={6}
          value={state.communitySettingsAbout}
          onChange={(event) => {
            actions.setCommunitySettingsAbout(event.target.value);
            actions.markCommunitySettingsDirty();
          }}
        />
      </SettingsRow>
      {onOpenSalesPage ? (
        <div className="pn-settings-callout">
          <span className="pn-settings-callout-icon" aria-hidden="true"><Megaphone size={20} strokeWidth={2} /></span>
          <span className="pn-settings-callout-text">
            <strong>Sales page</strong>
            <small>Pick its style, add pictures and videos and write the pitch, with a live preview.</small>
          </span>
          <button className="pn-settings-button is-primary" type="button" onClick={onOpenSalesPage}>
            Edit sales page <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </SettingsCard>
  );
}

function CommunityAccessAndPaymentsCards({
  activeCommunity,
  accountCommerceStatus,
  communityPlatformFeeBps,
  accountCommerceError,
  startStripeConnectOnboarding,
  isStartingStripeConnectOnboarding,
  canManagePublishing,
  canManagePayoutAccount,
  state,
  actions,
}: SharedSettingsProps & {
  activeCommunity: ActiveCommunity;
  accountCommerceStatus: AccountCommerceStatus | null;
  communityPlatformFeeBps: number | null;
  accountCommerceError: string | null;
  startStripeConnectOnboarding: WebCommunitySettingsSectionProps["startStripeConnectOnboarding"];
  isStartingStripeConnectOnboarding: boolean;
  canManagePublishing: boolean;
  canManagePayoutAccount: boolean;
}) {
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
  const openStripe = () =>
    void startStripeConnectOnboarding({
      context: "community",
      communitySlug: activeCommunity.slug,
      country: selectedStripeConnectCountry || null,
    });
  const stripeLabel = isStartingStripeConnectOnboarding ? "Opening…" : stripeConnectPresentation.connectCtaLabel;
  const mode = state.communitySettingsPricingMode;
  const priceField = mode === "monthly" || mode === "annual" ? (
    <SettingsRow
      label={mode === "monthly" ? "Monthly price" : "Annual price"}
      htmlFor="community-settings-price"
      help={mode === "monthly" ? "In US dollars, billed every month." : "In US dollars, billed once a year."}
      control={
        <div className="pn-settings-affix is-compact">
          <span aria-hidden="true">$</span>
          <input
            id="community-settings-price"
            className="pn-settings-input"
            type="text"
            inputMode="decimal"
            placeholder={mode === "monthly" ? "29" : "290"}
            value={mode === "monthly" ? state.communitySettingsPriceUsdMonthly : state.communitySettingsPriceUsdAnnual}
            disabled={needsStripeConnect}
            onChange={(event) => {
              if (mode === "monthly") actions.setCommunitySettingsPriceUsdMonthly(event.target.value);
              else actions.setCommunitySettingsPriceUsdAnnual(event.target.value);
              actions.markCommunitySettingsDirty();
            }}
          />
        </div>
      }
    />
  ) : null;

  return (
    <>
      <SettingsCard id="settings-access" title="Access & pricing">
        {canManagePublishing ? (
          <SettingsRow
            label="Visibility"
            htmlFor="community-settings-visibility"
            help={state.communitySettingsVisibility === "published"
              ? "Listed in Discover. People still join through your sales page."
              : "Hidden from Discover. Only people with the link can find it."}
            control={
              <select
                id="community-settings-visibility"
                className="pn-settings-select"
                value={state.communitySettingsVisibility}
                onChange={(event) => {
                  actions.setCommunitySettingsVisibility(event.target.value);
                  actions.markCommunitySettingsDirty();
                }}
              >
                <option value="published">Listed</option>
                <option value="unlisted">Unlisted</option>
              </select>
            }
          />
        ) : null}
        <SettingsRow
          label="Pricing"
          htmlFor="community-settings-pricing"
          help={needsStripeConnect
            ? "Paid plans open once Stripe is connected below."
            : "Shown on your sales page and at checkout."}
          control={
            <select
              id="community-settings-pricing"
              className="pn-settings-select"
              value={mode}
              onChange={(event) => {
                actions.setCommunitySettingsPricingMode(event.target.value as CommunityPricingMode);
                actions.markCommunitySettingsDirty();
              }}
            >
              <option value="free">Free</option>
              <option value="monthly" disabled={needsStripeConnect}>Monthly</option>
              <option value="annual" disabled={needsStripeConnect}>Annual</option>
            </select>
          }
        />
        {priceField}
      </SettingsCard>
      <SettingsCard id="settings-payments" title="Payments">
        {!canMonetizeCommunities ? (
          <p className="pn-settings-note">Paid communities aren't available for this account yet.</p>
        ) : canReceiveCommunityRevenue ? (
          <SettingsRow
            label={`Stripe connected${stripeConnectCountryLabel ? ` · ${stripeConnectCountryLabel}` : ""}`}
            help={`Paid memberships pay out to your Stripe account. Polynet keeps ${platformFeePercent.toFixed(1)}%, plus Stripe's fees.`}
            control={canManagePayoutAccount ? (
              <button className="pn-settings-button" type="button" disabled={isStartingStripeConnectOnboarding} onClick={openStripe}>
                {stripeLabel}
              </button>
            ) : null}
          />
        ) : (
          <>
            <SettingsRow
              label="Connect Stripe"
              help={
                <>
                  {stripeConnectPresentation.statusMessage}
                  {stripeConnectPresentation.requirementsPreview.length > 0
                    ? ` Stripe still needs: ${stripeConnectPresentation.requirementsPreview.join(", ")}.`
                    : ""}
                </>
              }
            />
            {canManagePayoutAccount ? (
              <div className="pn-settings-stripe">
                <StripeConnectCountrySelect
                  value={selectedStripeConnectCountry}
                  disabled={isStartingStripeConnectOnboarding}
                  onChange={setStripeConnectCountry}
                  style={{ margin: 0 }}
                />
                <StripeSetupButton
                  label={stripeLabel}
                  onClick={openStripe}
                  disabled={isStartingStripeConnectOnboarding || needsStripeConnectCountry}
                />
              </div>
            ) : (
              <p className="pn-settings-note">The community owner has to finish Stripe setup before paid access can change.</p>
            )}
            {accountCommerceError ? <p className="pn-settings-inline-error" role="alert">{accountCommerceError}</p> : null}
          </>
        )}
      </SettingsCard>
    </>
  );
}

function CommunityArchiveCard({
  activeCommunity,
  state,
  actions,
}: SharedSettingsProps & { activeCommunity: ActiveCommunity }) {
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);

  useEffect(() => {
    setIsConfirmingArchive(false);
  }, [activeCommunity.id]);

  return (
    <SettingsCard id="settings-archive" title="Archive community" className="is-danger">
      <SettingsRow
        label={`Archive ${activeCommunity.name}`}
        help="Freezes the community, removes member access and stops active subscriptions. Content and settings are kept. Restoring it later needs Builder at $79/month."
        control={isConfirmingArchive ? null : (
          <button
            className="pn-settings-button is-danger"
            type="button"
            disabled={state.isArchivingCommunity}
            onClick={() => setIsConfirmingArchive(true)}
          >
            Archive…
          </button>
        )}
      />
      {isConfirmingArchive ? (
        <div className="pn-settings-confirm" role="group" aria-label="Confirm archive">
          <span>Members lose access straight away. Archive {activeCommunity.name}?</span>
          <div className="pn-settings-actions">
            <button className="pn-settings-button" type="button" disabled={state.isArchivingCommunity} onClick={() => setIsConfirmingArchive(false)}>
              Cancel
            </button>
            <button className="pn-settings-button is-danger-solid" type="button" disabled={state.isArchivingCommunity} onClick={() => void actions.handleArchiveCommunity()}>
              {state.isArchivingCommunity ? "Archiving…" : "Archive community"}
            </button>
          </div>
        </div>
      ) : null}
      {state.communityArchiveError ? <p className="pn-settings-inline-error" role="alert">{state.communityArchiveError}</p> : null}
    </SettingsCard>
  );
}

// Members who don't manage the community get their own two settings.
function CommunityMemberSettings({
  activeCommunity,
  accessGateway,
  state,
  actions,
}: SharedSettingsProps & { activeCommunity: ActiveCommunity; accessGateway: CommunityAccessGateway | null }) {
  return (
    <div className="pn-settings-single">
      <header className="pn-settings-page-header">
        <h1>Settings</h1>
      </header>
      <div className="pn-settings-stack">
        {accessGateway ? <WebCommunityMyAccessCard key={accessGateway.scopeKey} gateway={accessGateway} /> : null}
        <SettingsCard title="Notifications">
          <SettingsRow
            label="Mute this community"
            help={state.communityMemberMuted
              ? `${activeCommunity.name} is muted for you.`
              : "Fewer notifications and unread markers from this community."}
            control={
              <SettingsSwitch
                label="Mute this community"
                checked={state.communityMemberMuted}
                disabled={state.isLoadingCommunityMemberSettings}
                onChange={(value) => void actions.handleToggleCommunityMute(value)}
              />
            }
          />
          {state.communityMemberSettingsError ? (
            <p className="pn-settings-inline-error" role="alert">{state.communityMemberSettingsError}</p>
          ) : null}
        </SettingsCard>
        <SettingsCard title="Membership" className="is-danger">
          <SettingsRow
            label="Leave community"
            help="Removes your member access. You can join again from its sales page."
            control={
              <button
                type="button"
                className="pn-settings-button is-danger"
                onClick={() => void actions.handleLeaveCommunity()}
                disabled={state.isLeavingCommunity}
              >
                {state.isLeavingCommunity ? "Leaving…" : "Leave"}
              </button>
            }
          />
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsMessage(props: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="pn-settings-message">
      <p>{props.children}</p>
      {props.action}
    </div>
  );
}

export function WebCommunitySettingsSection(props: WebCommunitySettingsSectionProps) {
  const frame = useWebCommunityFrame();
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
  const availableSettingsPanes = listCommunitySettingsPanesForAccess(settingsPaneAccess);
  const selectedSettingsPane = normalizeCommunitySettingsPaneForAccess(
    activePane,
    settingsPaneAccess,
  );
  const availableSettingsPaneKey = availableSettingsPanes.join("|");
  const accessPresentationState = deriveCommunitySettingsAccessPresentation({
    hasActiveCommunity: Boolean(activeCommunity),
    hasAuthenticatedPresentation: hasSession,
    isResolvingAccess: isResolvingCommunityAccess,
    accessLoadError: communityAccessLoadError,
    canView: canViewActiveCommunitySettings,
  });
  const resolvedActiveCommunity = activeCommunity as ActiveCommunity;
  const workflowsPath = buildCommunityTabPath(resolvedActiveCommunity?.slug, "workflows");
  const peoplePath = buildCommunityTabPath(resolvedActiveCommunity?.slug, "people");
  const navGroups = useMemo(
    () => buildCommunitySettingsNav({ panes: availableSettingsPanes, workflowsPath, peoplePath }),
    [availableSettingsPaneKey, workflowsPath, peoplePath],
  );
  const autosave = useCommunitySettingsAutosave({ state, actions });
  const accessGateway = useCommunityAccessGatewayForSession({
    communityId: resolvedActiveCommunity?.id ?? null, session: props.session, ensureSession: props.ensureSession,
  });
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);

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

  // A section link from the nav or search: open General, then scroll to it.
  useEffect(() => {
    if (!pendingAnchor || selectedSettingsPane !== "community") return;
    const target = document.getElementById(pendingAnchor);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
    setPendingAnchor(null);
  }, [pendingAnchor, selectedSettingsPane, state.isCommunitySettingsReady]);

  const selectPane = (pane: CommunitySettingsPane) => {
    if (pane !== selectedSettingsPane) onSelectPane(pane);
  };
  const selectAnchor = (anchorId: string) => {
    selectPane("community");
    setPendingAnchor(anchorId);
  };

  if (accessPresentationState === "select_community") {
    return <div className="settings-panel community-settings-panel pn-settings"><SettingsMessage>Select a community to see its settings.</SettingsMessage></div>;
  }
  if (accessPresentationState === "sign_in") {
    return (
      <div className="settings-panel community-settings-panel pn-settings">
        <SettingsMessage action={<button className="pn-settings-button" type="button" onClick={requireSignIn}>Sign in</button>}>
          Sign in to see this community's settings.
        </SettingsMessage>
      </div>
    );
  }
  if (accessPresentationState === "resolving") {
    return (
      <div className="settings-panel community-settings-panel pn-settings">
        <div className="pn-settings-loading" role="status"><span className="pn-settings-spinner" aria-hidden="true" />Loading settings…</div>
      </div>
    );
  }
  if (accessPresentationState === "failed") {
    return (
      <div className="settings-panel community-settings-panel pn-settings">
        <SettingsMessage action={<button className="pn-settings-button" type="button" onClick={onRetryCommunityAccess}>Try again</button>}>
          {communityAccessLoadError}
        </SettingsMessage>
      </div>
    );
  }
  if (accessPresentationState === "denied") {
    return <div className="settings-panel community-settings-panel pn-settings"><SettingsMessage>You don't have access to this community's settings.</SettingsMessage></div>;
  }
  if (!canManageCommunitySettings) {
    return (
      <div className="settings-panel community-settings-panel pn-settings">
        <CommunityMemberSettings activeCommunity={resolvedActiveCommunity} accessGateway={accessGateway} state={state} actions={actions} />
      </div>
    );
  }

  const generalBody = state.isLoadingCommunitySettings ? (
    <div className="pn-settings-loading" role="status"><span className="pn-settings-spinner" aria-hidden="true" />Loading settings…</div>
  ) : !state.isCommunitySettingsReady ? (
    <SettingsMessage action={<button className="pn-settings-button" type="button" onClick={() => void actions.handleReloadLatestCommunitySettings()}>Try again</button>}>
      {state.communitySettingsError ?? "These settings didn't load."}
    </SettingsMessage>
  ) : (
    <div className="pn-settings-stack">
      {state.communitySettingsError || autosave.hint ? (
        <div className={`pn-settings-banner${state.communitySettingsError ? " is-error" : ""}`} role={state.communitySettingsError ? "alert" : "status"}>
          <span>{state.communitySettingsError ?? autosave.hint}</span>
          {state.communitySettingsConflict ? (
            <button
              className="pn-settings-button"
              type="button"
              onClick={() => void actions.handleReloadLatestCommunitySettings()}
              disabled={state.isLoadingCommunitySettings}
            >
              Reload latest
            </button>
          ) : state.communitySettingsError && state.isCommunitySettingsDirty ? (
            <button className="pn-settings-button" type="button" onClick={actions.handleCancelCommunitySettings}>
              Undo changes
            </button>
          ) : null}
        </div>
      ) : null}
      {isOwnerSettingsLayer ? (
        <CommunityIdentityCard activeCommunity={resolvedActiveCommunity} state={state} actions={actions} />
      ) : null}
      <CommunityProfileCard
        state={state}
        actions={actions}
        onOpenSalesPage={availableSettingsPanes.includes("sales_page") ? () => onSelectPane("sales_page") : null}
      />
      <CommunityAccessAndPaymentsCards
        activeCommunity={resolvedActiveCommunity}
        accountCommerceStatus={accountCommerceStatus}
        communityPlatformFeeBps={communityPlatformFeeBps}
        accountCommerceError={accountCommerceError}
        startStripeConnectOnboarding={startStripeConnectOnboarding}
        isStartingStripeConnectOnboarding={isStartingStripeConnectOnboarding}
        canManagePublishing={isOwnerSettingsLayer}
        canManagePayoutAccount={isOwnerSettingsLayer}
        state={state}
        actions={actions}
      />
    </div>
  );

  // In Channels, Settings replaces the community's menu (as Substack's does),
  // so its own menu starts with the way back. Classroom has its owner bar.
  const settingsBack = frame.layout.navigation.position !== "top" && frame.community
    ? { label: frame.community.name, onBack: () => frame.onSelectTab(frame.layout.navigation.home === "agent" ? "chat" : frame.layout.navigation.home) }
    : null;

  return (
    <div className="settings-panel community-settings-panel pn-settings">
      <div className="pn-settings-layout">
        <WebCommunitySettingsNav
          groups={navGroups}
          activePane={selectedSettingsPane}
          onSelectPane={selectPane}
          onSelectAnchor={selectAnchor}
          onOpenLink={openInAppPath}
          back={settingsBack}
        />
        <div className="pn-settings-main" id={`community-settings-${selectedSettingsPane}`}>
          <header className="pn-settings-page-header">
            <h1>{PANE_TITLES[selectedSettingsPane]}</h1>
            {selectedSettingsPane === "community" && state.isCommunitySettingsReady ? (
              <SaveStatusPill status={autosave.status} onRetry={autosave.retry} />
            ) : null}
          </header>
          <Suspense fallback={<div className="pn-settings-loading" role="status"><span className="pn-settings-spinner" aria-hidden="true" />Loading…</div>}>
          {canManageCommunitySettings && resolvedActiveCommunity ? (
            <WebCommunitySettingProposals communityId={resolvedActiveCommunity.id} session={props.session} />
          ) : null}
          {selectedSettingsPane === "community" ? generalBody : null}
          {selectedSettingsPane === "appearance" && resolvedActiveCommunity ? (
            <WebCommunityAppearanceSettings
              communityId={resolvedActiveCommunity.id}
              communitySlug={resolvedActiveCommunity.slug}
              hasBanner={Boolean(state.communitySettingsBannerUrl?.trim())}
              session={props.session}
              ensureSession={props.ensureSession}
            />
          ) : null}
          {selectedSettingsPane === "agent" ? (
            <WebCommunityAiAgentSection
              {...aiAgentProps}
              embedded
              profileCard={resolvedActiveCommunity ? (
                <WebCommunityAgentProfileCard
                  session={props.session}
                  communityId={resolvedActiveCommunity.id}
                  communityName={String(resolvedActiveCommunity.name ?? "")}
                />
              ) : null}
            />
          ) : null}
          {selectedSettingsPane === "sales_page" && resolvedActiveCommunity ? (
            <WebCommunitySalesPageSettings
              key={resolvedActiveCommunity.id}
              communityId={resolvedActiveCommunity.id}
              communitySlug={resolvedActiveCommunity.slug}
              session={props.session}
              ensureSession={props.ensureSession}
            />
          ) : null}
          {selectedSettingsPane === "offers" && resolvedActiveCommunity ? (
            <WebCommunityOffersSettings
              key={resolvedActiveCommunity.id}
              communityId={resolvedActiveCommunity.id}
              communitySlug={resolvedActiveCommunity.slug}
              session={props.session}
              isOwner={isOwnerSettingsLayer}
              onOpenPricing={() => selectAnchor("settings-access")}
            />
          ) : null}
          {selectedSettingsPane === "creators" && resolvedActiveCommunity ? (
            <WebCommunityCreatorsSettings
              key={resolvedActiveCommunity.id}
              communityId={resolvedActiveCommunity.id}
              session={props.session}
              isOwner={isOwnerSettingsLayer}
            />
          ) : null}
          {selectedSettingsPane === "access" && accessGateway ? (
            <WebCommunityAccessSettings key={accessGateway.scopeKey} gateway={accessGateway} />
          ) : null}
          {selectedSettingsPane === "danger" && isOwnerSettingsLayer ? (
            <CommunityArchiveCard activeCommunity={resolvedActiveCommunity} state={state} actions={actions} />
          ) : null}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
