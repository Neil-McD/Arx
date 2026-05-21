import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { ArrowRight, Bot, Check, CircleUserRound, Compass, PlugZap, PlusCircle, Search, X } from "lucide-react";
import type { AccountSetupStatus, AccountSetupStep } from "../../../../shared/accountSetup";
import { DEFAULT_AGENT_PERSONALITY_PROMPT_TEXT } from "../../../../shared/agentPersonalityPresets";
import { renderMarkdown } from "../../../../shared/markdownUi";
import { normalizeProfileHandle } from "../../../../shared/profileHandle";
import type { SocialProfileKind, SocialProfileLinks } from "../../../../shared/socialProfileLinks";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  PRIVACY_AI_DATA_POLICY_ENTRY,
  TERMS_OF_SERVICE_ENTRY,
  type LegalDocumentEntry,
} from "../docs/legalDocumentsContent";
import { WebUserAvatarEditorModal } from "./WebUserAvatarEditorModal";
import { WebAgentPersonalityPicker } from "./WebAgentPersonalityPicker";
import { WebSocialProfileLinksFields } from "./WebSocialProfileLinksFields";

type OnboardingStep = Exclude<AccountSetupStep, "complete">;

type ProfileHandleAvailability = {
  available: boolean;
  status: "empty" | "too_short" | "too_long" | "invalid_format" | "reserved" | "available" | "taken";
  handle: string | null;
  normalized_handle: string | null;
};

type WebOnboardingPageProps = {
  variant?: "page" | "modal";
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
  agentName: string;
  agentSoul: string;
  isSavingAgent: boolean;
  onSaveAgent: (next: { agentName: string; agentSoul: string }) => Promise<boolean> | boolean;
  onBuildCommunity: () => void;
  onDiscoverCommunity: () => void;
  onClose?: () => void;
};

export type PlatformLegalAcceptanceDraft = {
  termsOfServiceVersion: string;
  privacyPolicyVersion: string;
};

const STEP_LABELS: Record<OnboardingStep, string> = {
  identity: "Profile",
  inference: "Inference",
  agent: "Agent",
  direction: "Direction",
};

function normalizeStep(step: AccountSetupStep | null | undefined): OnboardingStep {
  if (step === "inference" || step === "agent" || step === "direction") return step;
  return "identity";
}

function stepIndex(step: OnboardingStep): number {
  return ["identity", "inference", "agent", "direction"].indexOf(step);
}

function stepIsComplete(status: AccountSetupStatus | null, step: OnboardingStep): boolean {
  return Boolean(status?.steps.find((item) => item.step === step)?.completed);
}

function normalizeAgentSoulDraft(agentSoul: string): string {
  return agentSoul.trim().length > 0 ? agentSoul : DEFAULT_AGENT_PERSONALITY_PROMPT_TEXT;
}

function StepIcon(props: { step: OnboardingStep }) {
  switch (props.step) {
    case "identity":
      return <CircleUserRound size={15} strokeWidth={2} aria-hidden="true" />;
    case "inference":
      return <PlugZap size={15} strokeWidth={2} aria-hidden="true" />;
    case "agent":
      return <Bot size={15} strokeWidth={2} aria-hidden="true" />;
    case "direction":
      return <Compass size={15} strokeWidth={2} aria-hidden="true" />;
  }
}

function DirectionButton(props: {
  title: string;
  details: string;
  action: string;
  icon: ReactNode;
  tone: "build" | "discover";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`polynet-onboarding-direction-card ${props.tone}`}
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="polynet-onboarding-direction-icon">{props.icon}</span>
      <span className="polynet-onboarding-direction-copy">
        <strong>{props.title}</strong>
        <p>{props.details}</p>
      </span>
      <span className="polynet-onboarding-direction-action">
        {props.action}
        <ArrowRight size={14} strokeWidth={2.2} aria-hidden="true" />
      </span>
    </button>
  );
}

function formatHandleAvailability(
  handle: string,
  availability: ProfileHandleAvailability | null,
  isChecking: boolean,
): { kind: "idle" | "checking" | "success" | "error"; label: string } {
  if (!handle.trim()) {
    return { kind: "idle", label: "Required for your public profile." };
  }
  if (isChecking) {
    return { kind: "checking", label: "Checking handle..." };
  }
  if (!availability) {
    return { kind: "idle", label: "Use 3-32 letters, numbers, underscores, or hyphens." };
  }
  if (availability.status === "available") {
    return { kind: "success", label: `@${availability.handle} is available.` };
  }
  if (availability.status === "taken") {
    return { kind: "error", label: "That handle is already taken." };
  }
  if (availability.status === "reserved") {
    return { kind: "error", label: "That handle is reserved." };
  }
  if (availability.status === "too_short") {
    return { kind: "error", label: "Use at least 3 characters." };
  }
  if (availability.status === "too_long") {
    return { kind: "error", label: "Use 32 characters or less." };
  }
  if (availability.status === "invalid_format") {
    return { kind: "error", label: "Start and end with a letter or number." };
  }
  return { kind: "idle", label: "Required for your public profile." };
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
  const [agentNameDraft, setAgentNameDraft] = useState(props.agentName);
  const [agentSoulDraft, setAgentSoulDraft] = useState(() => normalizeAgentSoulDraft(props.agentSoul));
  const [hasConfirmedPlatformLegal, setHasConfirmedPlatformLegal] = useState(false);
  const [activeLegalDocument, setActiveLegalDocument] = useState<LegalDocumentEntry | null>(null);
  const [providerChoice, setProviderChoice] = useState<"chatgpt" | "openai" | null>(() =>
    props.openAiConnected ? "openai" : props.chatgptConnected ? "chatgpt" : null,
  );
  const isModal = props.variant === "modal";

  useEffect(() => {
    setAgentNameDraft(props.agentName);
  }, [props.agentName]);

  useEffect(() => {
    setAgentSoulDraft(normalizeAgentSoulDraft(props.agentSoul));
  }, [props.agentSoul]);

  useEffect(() => {
    const currentStep = props.accountSetupStatus?.current_step;
    if (currentStep === "complete") return;
    if (step === "inference" && currentStep === "agent") setStep("agent");
  }, [props.accountSetupStatus?.current_step, step]);

  useEffect(() => {
    if (props.openAiConnected) setProviderChoice("openai");
    else if (props.chatgptConnected) setProviderChoice("chatgpt");
  }, [props.chatgptConnected, props.openAiConnected]);

  const progress = props.accountSetupStatus?.percent ?? 0;
  const progressCircumference = 2 * Math.PI * 17;
  const progressDashOffset = progressCircumference - (progress / 100) * progressCircumference;
  const hasInferenceProvider = props.chatgptConnected || props.openAiConnected;
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
  const agentReady = agentNameDraft.trim().length > 0;
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
    () => ["identity", "inference", "agent", "direction"],
    [],
  );

  const goNext = async () => {
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
    if (step === "agent") {
      const ok = await props.onSaveAgent({
        agentName: agentNameDraft,
        agentSoul: agentSoulDraft,
      });
      if (ok) setStep("direction");
      return;
    }
    if (step === "inference") {
      if (!hasInferenceProvider) return;
      setStep("agent");
    }
  };

  const nextDisabled =
    props.isSaving ||
    props.isSavingAgent ||
    (step === "identity" && !profileReady) ||
    (step === "inference" && !hasInferenceProvider) ||
    (step === "agent" && !agentReady);

  const chooseDirection = (direction: "build_community" | "discover_community") => {
    if (direction === "build_community") props.onBuildCommunity();
    if (direction === "discover_community") props.onDiscoverCommunity();
  };

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
        {isModal && props.onClose ? (
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

          {step === "agent" ? (
            <div className="polynet-onboarding-agent">
              <div className="polynet-onboarding-step-intro">
                <strong>Give your agent a name and a personality.</strong>
                <p>Pick the starting energy. You can tune it later.</p>
              </div>
              <label>
                Agent name
                <input
                  value={agentNameDraft}
                  onChange={(event) => setAgentNameDraft(event.target.value)}
                  placeholder="Polynet Agent"
                />
              </label>
              <WebAgentPersonalityPicker
                value={agentSoulDraft}
                onChange={setAgentSoulDraft}
                disabled={props.isSavingAgent}
                variant="onboarding"
              />
            </div>
          ) : null}

          {step === "direction" ? (
            <div className="polynet-onboarding-choice">
              <DirectionButton
                title="Build my first community"
                details="Create a community, configure access, and launch your agent."
                action="Start building"
                icon={<PlusCircle size={18} strokeWidth={2} aria-hidden="true" />}
                tone="build"
                disabled={props.isSaving}
                onClick={() => chooseDirection("build_community")}
              />
              <DirectionButton
                title="Discover communities"
                details="Explore communities, join one, and start using shared agents."
                action="Explore communities"
                icon={<Search size={18} strokeWidth={2} aria-hidden="true" />}
                tone="discover"
                disabled={props.isSaving}
                onClick={() => chooseDirection("discover_community")}
              />
            </div>
          ) : null}

          {props.error ? <p className="polynet-onboarding-error">{props.error}</p> : null}

          <div className="polynet-onboarding-profile-footer">
            <div className="polynet-onboarding-footer-actions">
              {stepIndex(step) > 0 ? (
                <button
                  type="button"
                  className="polynet-onboarding-back"
                  disabled={props.isSaving || props.isSavingAgent}
                  onClick={() => setStep(stepOrder[Math.max(0, stepIndex(step) - 1)])}
                >
                  Back
                </button>
              ) : null}
              {step !== "direction" ? (
                <button
                  type="button"
                  className="polynet-onboarding-next"
                  disabled={nextDisabled}
                  onClick={() => void goNext()}
                >
                  {props.isSaving || props.isSavingAgent ? "Saving..." : "Next"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isModal && props.onClose ? (
        <button className="polynet-onboarding-finish-later" type="button" onClick={props.onClose}>
          Finish later
        </button>
      ) : null}

      {activeLegalDocument ? (
        <div className="modal-overlay polynet-onboarding-legal-overlay" onClick={() => setActiveLegalDocument(null)}>
          <div
            className="modal polynet-onboarding-legal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="polynet-onboarding-legal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="modal-title" id="polynet-onboarding-legal-title">
                  {activeLegalDocument.title}
                </div>
                <div className="polynet-onboarding-legal-meta">
                  {activeLegalDocument.version} - Effective {activeLegalDocument.effectiveDate}
                </div>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setActiveLegalDocument(null)}
                title="Close"
              >
                x
              </button>
            </div>
            <div className="modal-body polynet-onboarding-legal-body">
              <div className="polynet-onboarding-legal-reader message-text">
                {renderMarkdown(activeLegalDocument.content)}
              </div>
            </div>
          </div>
        </div>
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

  if (isModal) {
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

  return (
    <main className="polynet-onboarding-page" aria-labelledby="polynet-onboarding-title">
      {flow}
    </main>
  );
}
