import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Bot, Check, CircleUserRound, Compass, PlugZap, X } from "lucide-react";
import type { AccountSetupStatus, AccountSetupStep } from "../../../../shared/accountSetup";

type OnboardingStep = Exclude<AccountSetupStep, "complete">;

type WebOnboardingPageProps = {
  variant?: "page" | "modal";
  accountSetupStatus: AccountSetupStatus | null;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  isAvatarDragOver: boolean;
  isSaving: boolean;
  error: string | null;
  setIsAvatarDragOver: (value: boolean) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onAvatarUpload: (file: File | null) => Promise<void> | void;
  onRemoveAvatar: () => void;
  onDisplayNameChange: (value: string) => void;
  onNextProfile: () => Promise<boolean> | boolean;
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
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={props.disabled} onClick={props.onClick}>
      <span>{props.title}</span>
      <p>{props.details}</p>
    </button>
  );
}

export function WebOnboardingPage(props: WebOnboardingPageProps) {
  const [step, setStep] = useState<OnboardingStep>(() => normalizeStep(props.accountSetupStatus?.current_step));
  const [agentNameDraft, setAgentNameDraft] = useState(props.agentName);
  const [agentSoulDraft, setAgentSoulDraft] = useState(props.agentSoul);
  const isModal = props.variant === "modal";

  useEffect(() => {
    setAgentNameDraft(props.agentName);
  }, [props.agentName]);

  useEffect(() => {
    setAgentSoulDraft(props.agentSoul);
  }, [props.agentSoul]);

  useEffect(() => {
    const currentStep = props.accountSetupStatus?.current_step;
    if (currentStep === "complete") return;
    if (step === "inference" && currentStep === "agent") setStep("agent");
  }, [props.accountSetupStatus?.current_step, step]);

  const progress = props.accountSetupStatus?.percent ?? 0;
  const progressCircumference = 2 * Math.PI * 17;
  const progressDashOffset = progressCircumference - (progress / 100) * progressCircumference;
  const hasInferenceProvider = props.chatgptConnected || props.openAiConnected;
  const profileReady = props.displayName.trim().length > 0 && Boolean(props.avatarUrl?.trim());
  const agentReady = agentNameDraft.trim().length > 0;
  const stepOrder = useMemo<OnboardingStep[]>(
    () => ["identity", "inference", "agent", "direction"],
    [],
  );

  const goNext = async () => {
    if (step === "identity") {
      const ok = await props.onNextProfile();
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
                <div
                  className={`polynet-onboarding-avatar${props.isAvatarDragOver ? " drag-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    props.setIsAvatarDragOver(true);
                  }}
                  onDragLeave={() => props.setIsAvatarDragOver(false)}
                  onDrop={props.onAvatarDrop}
                >
                  {props.avatarUrl ? <img src={props.avatarUrl} alt="Profile avatar" /> : <span>P</span>}
                </div>
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
                    <button className="create-avatar-remove" type="button" onClick={props.onRemoveAvatar}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              <label>
                Display name
                <input
                  value={props.displayName}
                  onChange={(event) => props.onDisplayNameChange(event.target.value)}
                  placeholder="Your name"
                />
              </label>
              <small>Name and profile photo are required.</small>
            </div>
          ) : null}

          {step === "inference" ? (
            <div className="polynet-onboarding-provider-grid">
              <div className="polynet-onboarding-provider-option primary">
                <div>
                  <span>ChatGPT OAuth</span>
                  <strong>Use ChatGPT Plus/Pro rate limits</strong>
                  <p>Connect ChatGPT so Polynet can use your personal OpenAI account limits.</p>
                  <small>{props.chatgptStatus}</small>
                </div>
                <button
                  className="platform-save-button platform-save-button--compact"
                  type="button"
                  onClick={props.onConnectChatgpt}
                  disabled={props.isConnectingChatgpt}
                >
                  {props.isConnectingChatgpt
                    ? "Starting..."
                    : props.isPollingChatgptConnection
                      ? "Continue auth"
                      : props.chatgptConnected
                        ? "Manage"
                        : "Connect"}
                </button>
              </div>
              <div className="polynet-onboarding-provider-option">
                <div>
                  <span>OpenAI API</span>
                  <strong>Use your API key</strong>
                  <p>Paste an OpenAI API key billed directly through OpenAI.</p>
                  <small>{props.openAiStatus}</small>
                </div>
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
                    className="secondary"
                    type="button"
                    onClick={() => void props.onConnectOpenAi()}
                    disabled={props.isSavingOpenAiConnection || props.openAiApiKeyDraft.trim().length === 0}
                  >
                    {props.isSavingOpenAiConnection ? "Saving..." : props.openAiConnected ? "Update key" : "Connect key"}
                  </button>
                </div>
                {props.openAiConnectionError ? <p className="polynet-onboarding-error">{props.openAiConnectionError}</p> : null}
                {props.openAiConnectionSuccess ? <p className="polynet-onboarding-success">{props.openAiConnectionSuccess}</p> : null}
              </div>
            </div>
          ) : null}

          {step === "agent" ? (
            <div className="polynet-onboarding-agent">
              <div className="polynet-onboarding-step-intro">
                <strong>Give your agent a name and a personality.</strong>
                <p>The name is required. The personality can stay light for now.</p>
              </div>
              <label>
                Agent name
                <input
                  value={agentNameDraft}
                  onChange={(event) => setAgentNameDraft(event.target.value)}
                  placeholder="Polynet Agent"
                />
              </label>
              <label>
                Personality (optional)
                <textarea
                  value={agentSoulDraft}
                  onChange={(event) => setAgentSoulDraft(event.target.value)}
                  placeholder="Tell your agent how to think, collaborate, and behave for you."
                  rows={7}
                />
              </label>
            </div>
          ) : null}

          {step === "direction" ? (
            <div className="polynet-onboarding-choice">
              <DirectionButton
                title="Build a community"
                details="Create a community intelligence system around your expertise."
                disabled={props.isSaving}
                onClick={() => chooseDirection("build_community")}
              />
              <DirectionButton
                title="Discover a community"
                details="Find communities with agents, resources, and members."
                disabled={props.isSaving}
                onClick={() => chooseDirection("discover_community")}
              />
            </div>
          ) : null}

          {props.error ? <p className="polynet-onboarding-error">{props.error}</p> : null}

          <div className="polynet-onboarding-profile-footer">
            {props.email ? <p className="polynet-onboarding-email">{props.email}</p> : <span />}
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
