import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Check, CircleUserRound, PlugZap, X } from "lucide-react";
import {
  formatAccountSetupMissingGuidance,
  type AccountSetupStatus,
  type AccountSetupStep,
} from "../../../../shared/accountSetup";
import { normalizeProfileHandle } from "../../../../shared/profileHandle";
import { formatProfileHandleAvailabilityHint } from "./profileHandleAvailabilityHint";
import type { SocialProfileKind, SocialProfileLinks } from "../../../../shared/socialProfileLinks";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  PRIVACY_AI_DATA_POLICY_ENTRY,
  TERMS_OF_SERVICE_ENTRY,
  type LegalDocumentEntry,
} from "../docs/legalDocumentsContent";
import { WebPlatformLegalReaderModal } from "./WebPlatformLegalReaderModal";
import { WebUserAvatarEditorModal } from "./WebUserAvatarEditorModal";
import { WebSocialProfileLinksFields } from "./WebSocialProfileLinksFields";
import {
  PROFILE_BIO_MAX_CHARS,
  PROFILE_DISPLAY_NAME_MAX_CHARS,
} from "../../../../shared/profileText";

type OnboardingStep = Exclude<AccountSetupStep, "complete">;

type ProfileHandleAvailability = {
  available: boolean;
  status: "empty" | "too_short" | "too_long" | "invalid_format" | "reserved" | "available" | "taken";
  handle: string | null;
  normalized_handle: string | null;
};

type WebOnboardingPageProps = {
  accountSetupStatus: AccountSetupStatus | null;
  displayName: string;
  handle: string;
  bio: string;
  socialLinks: SocialProfileLinks;
  avatarUrl: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarZoom: number;
  isAvatarFocusModalOpen: boolean;
  handleAvailability: ProfileHandleAvailability | null;
  isCheckingHandleAvailability: boolean;
  isAvatarDragOver: boolean;
  isSaving: boolean;
  error: string | null;
  setIsAvatarDragOver: (value: boolean) => void;
  setAvatarFocusX: (value: number) => void;
  setAvatarFocusY: (value: number) => void;
  setAvatarZoom: (value: number) => void;
  setIsAvatarFocusModalOpen: (value: boolean) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onAvatarUpload: (file: File | null) => Promise<void> | void;
  onRemoveAvatar: () => void;
  onDisplayNameChange: (value: string) => void;
  onHandleChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onSocialLinkChange: (kind: SocialProfileKind, value: string) => void;
  onNextProfile: (legalAcceptance: PlatformLegalAcceptanceDraft | null) => Promise<boolean> | boolean;
  chatgptConnected: boolean;
  chatgptStatus: string;
  isConnectingChatgpt: boolean;
  isPollingChatgptConnection: boolean;
  onConnectChatgpt: () => void;
  openAiConnected: boolean;
  openAiStatus: string;
  openAiApiKeyDraft: string;
  setOpenAiApiKeyDraft: (value: string) => void;
  isSavingOpenAiConnection: boolean;
  openAiConnectionError: string | null;
  openAiConnectionSuccess: string | null;
  onConnectOpenAi: () => Promise<void> | void;
  onFinishOnboarding: () => Promise<boolean | void> | boolean | void;
  onClose?: () => void;
};

export type PlatformLegalAcceptanceDraft = {
  termsOfServiceVersion: string;
  privacyPolicyVersion: string;
};

const STEP_LABELS: Record<OnboardingStep, string> = {
  identity: "Profile",
  inference: "Inference",
};

function normalizeStep(step: AccountSetupStep | null | undefined): OnboardingStep {
  if (step === "inference") return step;
  return "identity";
}

function stepIndex(step: OnboardingStep): number {
  return ["identity", "inference"].indexOf(step);
}

function stepIsComplete(status: AccountSetupStatus | null, step: OnboardingStep): boolean {
  return Boolean(status?.steps.find((item) => item.step === step)?.completed);
}

function StepIcon(props: { step: OnboardingStep }) {
  switch (props.step) {
    case "identity":
      return <CircleUserRound size={15} strokeWidth={2} aria-hidden="true" />;
    case "inference":
      return <PlugZap size={15} strokeWidth={2} aria-hidden="true" />;
  }
}

function formatHandleAvailability(
  handle: string,
  availability: ProfileHandleAvailability | null,
  isChecking: boolean,
): { kind: "idle" | "checking" | "success" | "error"; label: string } {
  return formatProfileHandleAvailabilityHint({
    handle,
    availability,
    isChecking,
    copy: {
      empty: "Required for your public profile.",
      checking: "Checking handle...",
      unknown: "Use 3-32 letters, numbers, underscores, or hyphens.",
      available: (available) => `@${available} is available.`,
      taken: "That handle is already taken.",
      reserved: "That handle is reserved.",
      tooShort: "Use at least 3 characters.",
      tooLong: "Use 32 characters or less.",
      invalidFormat: "Start and end with a letter or number.",
    },
  });
}

function formatProviderStatus(
  connected: boolean,
  selected: boolean,
  busy: boolean,
): { kind: "connected" | "selected" | "busy" | "idle"; label: string } {
  if (connected) return { kind: "connected", label: "Connected" };
  if (busy) return { kind: "busy", label: "Working" };
  if (selected) return { kind: "selected", label: "Selected" };
  return { kind: "idle", label: "Not connected" };
}

export function WebOnboardingPage(props: WebOnboardingPageProps) {
  const [step, setStep] = useState<OnboardingStep>(() => normalizeStep(props.accountSetupStatus?.current_step));
  const [hasConfirmedPlatformLegal, setHasConfirmedPlatformLegal] = useState(false);
  const [activeLegalDocument, setActiveLegalDocument] = useState<LegalDocumentEntry | null>(null);
  const [setupGuidance, setSetupGuidance] = useState<string | null>(null);
  const [providerChoice, setProviderChoice] = useState<"chatgpt" | "openai" | null>(() =>
    props.openAiConnected ? "openai" : props.chatgptConnected ? "chatgpt" : null,
  );

  useEffect(() => {
    if (props.openAiConnected) setProviderChoice("openai");
    else if (props.chatgptConnected) setProviderChoice("chatgpt");
  }, [props.chatgptConnected, props.openAiConnected]);

  const progress = props.accountSetupStatus?.percent ?? 0;
  const progressCircumference = 2 * Math.PI * 17;
  const progressDashOffset = progressCircumference - (progress / 100) * progressCircumference;
  const hasInferenceProvider = props.chatgptConnected || props.openAiConnected;

  useEffect(() => {
    if (props.accountSetupStatus?.completed || hasInferenceProvider) {
      setSetupGuidance(null);
    }
  }, [hasInferenceProvider, props.accountSetupStatus?.completed]);
  const normalizedHandle = normalizeProfileHandle(props.handle);
  const handleAvailabilityMatches = props.handleAvailability?.normalized_handle === normalizedHandle;
  const handleReady =
    Boolean(normalizedHandle) &&
    !props.isCheckingHandleAvailability &&
    Boolean(handleAvailabilityMatches && props.handleAvailability?.available);
  const platformLegalMissing = props.accountSetupStatus?.missing.includes("platform_legal") !== false;
  const platformLegalReady = !platformLegalMissing || hasConfirmedPlatformLegal;
  const profileReady =
    props.displayName.trim().length > 0 &&
    Boolean(props.avatarUrl?.trim()) &&
    handleReady &&
    platformLegalReady;
  const handleAvailability = formatHandleAvailability(
    props.handle,
    props.handleAvailability,
    props.isCheckingHandleAvailability,
  );
  const showOpenAiKeyEntry = providerChoice === "openai" || props.openAiConnected;
  const chatgptSelected = providerChoice === "chatgpt";
  const openAiSelected = providerChoice === "openai";
  const chatgptProviderStatus = formatProviderStatus(
    props.chatgptConnected,
    chatgptSelected,
    props.isConnectingChatgpt || props.isPollingChatgptConnection,
  );
  const openAiProviderStatus = formatProviderStatus(
    props.openAiConnected,
    openAiSelected,
    props.isSavingOpenAiConnection,
  );
  const stepOrder = useMemo<OnboardingStep[]>(
    () => ["identity", "inference"],
    [],
  );
  const setupRequirementMessage =
    props.error && props.accountSetupStatus && !props.accountSetupStatus.completed
      ? formatAccountSetupMissingGuidance(props.accountSetupStatus)
      : null;
  const displayedStatusMessage = setupGuidance ?? props.error;
  const displayedStatusMessageIsGuidance =
    Boolean(setupGuidance) || Boolean(props.error && setupRequirementMessage === props.error);

  const goNext = async () => {
    setSetupGuidance(null);
    if (step === "identity") {
      const ok = await props.onNextProfile(
        platformLegalReady
          ? {
              termsOfServiceVersion: TERMS_OF_SERVICE_ENTRY.version,
              privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_ENTRY.version,
            }
          : null,
      );
      if (ok) setStep("inference");
      return;
    }
    if (step === "inference") {
      if (!hasInferenceProvider) return;
      await props.onFinishOnboarding();
    }
  };

  const nextDisabled =
    props.isSaving ||
    (step === "identity" && !profileReady) ||
    (step === "inference" && !hasInferenceProvider);

  const handleClose = () => {
    props.onClose?.();
  };

  const flow = (
    <section className="polynet-onboarding-panel">
      <div className="polynet-onboarding-topbar">
        <div className="polynet-onboarding-brand">
          <img src="/favicon.svg" alt="" />
          <span>Polynet</span>
        </div>
        {props.onClose ? (
          <button
            className="polynet-onboarding-close"
            type="button"
            onClick={handleClose}
            aria-label="Finish setup later"
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="polynet-onboarding-header">
        <div className="polynet-onboarding-progress-ring" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <circle className="track" cx="20" cy="20" r="17" />
            <circle
              className="value"
              cx="20"
              cy="20"
              r="17"
              strokeDasharray={progressCircumference}
              strokeDashoffset={progressDashOffset}
            />
          </svg>
          <span>{progress}%</span>
        </div>
        <div>
          <p className="polynet-landing-kicker">Account setup</p>
          <h1 id="polynet-onboarding-title">Finish account setup</h1>
          <p>{progress}% complete</p>
        </div>
      </div>

      <div className="polynet-onboarding-shell">
        <nav className="polynet-onboarding-steps" aria-label="Setup steps">
          {stepOrder.map((item) => {
            const active = item === step;
            const complete = stepIsComplete(props.accountSetupStatus, item);
            return (
              <button
                key={item}
                type="button"
                className={`${active ? "active" : ""}${complete ? " complete" : ""}`}
                onClick={() => setStep(item)}
              >
                <span className="polynet-onboarding-step-icon">
                  {complete ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : <StepIcon step={item} />}
                </span>
                <span>{STEP_LABELS[item]}</span>
              </button>
            );
          })}
        </nav>

        <div className="polynet-onboarding-step-body">
          {step === "identity" ? (
            <div className="polynet-onboarding-profile">
              <div className="polynet-onboarding-avatar-row">
                <UserAvatar
                  className={`polynet-onboarding-avatar${props.isAvatarDragOver ? " drag-over" : ""}`}
                  readyClassName="has-image"
                  name={props.displayName || props.handle || "Profile"}
                  imageUrl={props.avatarUrl}
                  focusX={props.avatarFocusX}
                  focusY={props.avatarFocusY}
                  zoom={props.avatarZoom}
                  alt="Profile avatar"
                  fallback={<span>{props.displayName.trim().charAt(0).toUpperCase() || "P"}</span>}
                  onDragOver={(event) => {
                    event.preventDefault();
                    props.setIsAvatarDragOver(true);
                  }}
                  onDragLeave={() => props.setIsAvatarDragOver(false)}
                  onDrop={props.onAvatarDrop}
                />
                <div className="polynet-onboarding-avatar-actions">
                  <label className="create-avatar-btn">
                    Upload photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => void props.onAvatarUpload(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {props.avatarUrl ? (
                    <>
                      <button
                        className="create-avatar-btn"
                        type="button"
                        onClick={() => props.setIsAvatarFocusModalOpen(true)}
                      >
                        Adjust
                      </button>
                      <button className="create-avatar-remove" type="button" onClick={props.onRemoveAvatar}>
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
                <WebSocialProfileLinksFields
                  values={props.socialLinks}
                  disabled={props.isSaving}
                  variant="onboarding"
                  onChange={props.onSocialLinkChange}
                />
              </div>
              <label>
                Display name
                <input
                  value={props.displayName}
                  onChange={(event) => props.onDisplayNameChange(event.target.value)}
                  placeholder="Your name"
                  maxLength={PROFILE_DISPLAY_NAME_MAX_CHARS}
                />
              </label>
              <label>
                <span className="polynet-onboarding-label-row">
                  <span>Handle</span>
                  <em>Required</em>
                </span>
                <div className="polynet-onboarding-handle-row">
                  <span aria-hidden="true">@</span>
                  <input
                    value={props.handle}
                    onChange={(event) => props.onHandleChange(event.target.value)}
                    placeholder="yourhandle"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              </label>
              <small className={`polynet-onboarding-handle-status ${handleAvailability.kind}`}>
                {handleAvailability.label}
              </small>
              <label>
                <span className="polynet-onboarding-label-row">
                  <span>Bio</span>
                  <em>Optional</em>
                </span>
                <textarea
                  value={props.bio}
                  onChange={(event) => props.onBioChange(event.target.value)}
                  placeholder="A short line about who you are or what you build."
                  rows={3}
                  maxLength={PROFILE_BIO_MAX_CHARS}
                />
              </label>
              <small>Name, handle, and profile photo are required.</small>
              <div className="polynet-onboarding-legal-confirmation">
                <input
                  id="polynet-onboarding-platform-legal"
                  type="checkbox"
                  aria-describedby="polynet-onboarding-platform-legal-copy"
                  checked={platformLegalReady}
                  disabled={!platformLegalMissing || props.isSaving}
                  onChange={(event) => setHasConfirmedPlatformLegal(event.currentTarget.checked)}
                />
                <span id="polynet-onboarding-platform-legal-copy" className="polynet-onboarding-legal-copy">
                  I agree to the{" "}
                  <button
                    type="button"
                    className="polynet-onboarding-legal-link"
                    onClick={() => setActiveLegalDocument(TERMS_OF_SERVICE_ENTRY)}
                  >
                    Terms of Service
                  </button>
                  {" "}and acknowledge the{" "}
                  <button
                    type="button"
                    className="polynet-onboarding-legal-link"
                    onClick={() => setActiveLegalDocument(PRIVACY_AI_DATA_POLICY_ENTRY)}
                  >
                    Privacy &amp; AI Data Policy
                  </button>
                  .
                </span>
              </div>
            </div>
          ) : null}

          {step === "inference" ? (
            <div className="polynet-onboarding-provider-grid">
              <div
                className={`polynet-onboarding-provider-option recommended${chatgptSelected ? " selected" : ""}${props.chatgptConnected ? " connected" : ""}`}
              >
                <div className="polynet-onboarding-provider-copy">
                  <div className="polynet-onboarding-provider-topline">
                    <span className="polynet-onboarding-provider-label recommended">ChatGPT Plus/Pro</span>
                    <span className="polynet-onboarding-provider-recommended">Recommended</span>
                  </div>
                  <strong>Use ChatGPT</strong>
                  <p>Use your Plus or Pro plan limits through your connected ChatGPT account.</p>
                  <small className={`polynet-onboarding-provider-connection ${chatgptProviderStatus.kind}`}>
                    {props.chatgptConnected ? props.chatgptStatus : chatgptProviderStatus.label}
                  </small>
                </div>
                <button
                  className="platform-save-button platform-save-button--compact"
                  type="button"
                  onClick={() => {
                    setProviderChoice("chatgpt");
                    props.onConnectChatgpt();
                  }}
                  disabled={props.isConnectingChatgpt}
                >
                  {props.isConnectingChatgpt
                    ? "Starting..."
                    : props.isPollingChatgptConnection
                      ? "Continue auth"
                      : props.chatgptConnected
                        ? "Manage"
                        : "Connect ChatGPT"}
                </button>
              </div>
              <div
                className={`polynet-onboarding-provider-option${openAiSelected ? " selected" : ""}${props.openAiConnected ? " connected" : ""}${showOpenAiKeyEntry ? " has-key-entry" : ""}`}
              >
                <div className="polynet-onboarding-provider-copy">
                  <div className="polynet-onboarding-provider-topline">
                    <span className="polynet-onboarding-provider-label">OpenAI API</span>
                    <span className={`polynet-onboarding-provider-status ${openAiProviderStatus.kind}`}>
                      {openAiProviderStatus.label}
                    </span>
                  </div>
                  <strong>Use an API key</strong>
                  <p>Use a key from your OpenAI account and bill usage directly through OpenAI.</p>
                  {props.openAiConnected ? <small>{props.openAiStatus}</small> : null}
                </div>
                {!showOpenAiKeyEntry ? (
                  <button
                    className="platform-save-button platform-save-button--compact"
                    type="button"
                    onClick={() => setProviderChoice("openai")}
                  >
                    Use API key
                  </button>
                ) : (
                  <div className="polynet-onboarding-provider-key">
                    <input
                      className="provider-connection-input"
                      type="password"
                      value={props.openAiApiKeyDraft}
                      onChange={(event) => props.setOpenAiApiKeyDraft(event.target.value)}
                      placeholder="Paste OpenAI API key"
                      autoComplete="off"
                      disabled={props.isSavingOpenAiConnection}
                    />
                    <button
                      className="platform-save-button platform-save-button--compact"
                      type="button"
                      onClick={() => {
                        void props.onConnectOpenAi();
                      }}
                      disabled={props.isSavingOpenAiConnection || props.openAiApiKeyDraft.trim().length === 0}
                    >
                      {props.isSavingOpenAiConnection ? "Saving..." : props.openAiConnected ? "Update key" : "Connect key"}
                    </button>
                  </div>
                )}
                {props.openAiConnectionError ? <p className="polynet-onboarding-error">{props.openAiConnectionError}</p> : null}
                {props.openAiConnectionSuccess ? <p className="polynet-onboarding-success">{props.openAiConnectionSuccess}</p> : null}
              </div>
            </div>
          ) : null}

          {displayedStatusMessage ? (
            <p
              className={
                displayedStatusMessageIsGuidance
                  ? "polynet-onboarding-guidance"
                  : "polynet-onboarding-error"
              }
            >
              {displayedStatusMessage}
            </p>
          ) : null}

          <div className="polynet-onboarding-profile-footer">
            <div className="polynet-onboarding-footer-actions">
              {stepIndex(step) > 0 ? (
                <button
                  type="button"
                  className="polynet-onboarding-back"
                  disabled={props.isSaving}
                  onClick={() => setStep(stepOrder[Math.max(0, stepIndex(step) - 1)])}
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                className="polynet-onboarding-next"
                disabled={nextDisabled}
                onClick={() => void goNext()}
              >
                {props.isSaving ? "Saving..." : step === "inference" ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {props.onClose ? (
        <button className="polynet-onboarding-finish-later" type="button" onClick={props.onClose}>
          Finish later
        </button>
      ) : null}

      {activeLegalDocument ? (
        <WebPlatformLegalReaderModal
          document={activeLegalDocument}
          onClose={() => setActiveLegalDocument(null)}
        />
      ) : null}

      <WebUserAvatarEditorModal
        isOpen={props.isAvatarFocusModalOpen}
        avatarUrl={props.avatarUrl}
        focusX={props.avatarFocusX}
        focusY={props.avatarFocusY}
        zoom={props.avatarZoom}
        title="Adjust profile photo"
        imageAlt="Profile photo preview"
        hint="Drag the image to frame it inside your profile avatar."
        onChangeFocusX={props.setAvatarFocusX}
        onChangeFocusY={props.setAvatarFocusY}
        onChangeZoom={props.setAvatarZoom}
        onDirty={() => undefined}
        onClose={() => props.setIsAvatarFocusModalOpen(false)}
      />
    </section>
  );

  return (
    <div className="polynet-onboarding-modal-backdrop" role="presentation">
      <div
        className="polynet-onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="polynet-onboarding-title"
      >
        {flow}
      </div>
    </div>
  );
}
