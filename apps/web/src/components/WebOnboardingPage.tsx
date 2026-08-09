import { useEffect, useState, type DragEvent } from "react";
import { Check, CircleUserRound, X } from "lucide-react";
import {
  formatAccountSetupMissingGuidance,
  type AccountSetupStatus,
  type AccountSetupStep,
} from "../../../../shared/accountSetup";
import { normalizeProfileHandle } from "../../../../shared/profileHandle";
import { formatProfileHandleAvailabilityHint } from "./profileHandleAvailabilityHint";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  PRIVACY_AI_DATA_POLICY_ENTRY,
  TERMS_OF_SERVICE_ENTRY,
  type LegalDocumentEntry,
} from "../docs/legalDocumentsContent";
import { WebPlatformLegalReaderModal } from "./WebPlatformLegalReaderModal";
import { WebUserAvatarEditorModal } from "./WebUserAvatarEditorModal";
import { WebSocialProfileLinksFields } from "./WebSocialProfileLinksFields";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";
import {
  PROFILE_BIO_MAX_CHARS,
  PROFILE_DISPLAY_NAME_MAX_CHARS,
} from "../../../../shared/profileText";
import type { WebAccountSetupSurfaceModel } from "./webAccountSetupSurfaceModel";

type OnboardingStep = Exclude<AccountSetupStep, "complete">;

type WebOnboardingPageProps = {
  accountSetupStatus: AccountSetupStatus | null;
  setup: WebAccountSetupSurfaceModel;
  isAvatarFocusModalOpen: boolean;
  isAvatarDragOver: boolean;
  setIsAvatarDragOver: (value: boolean) => void;
  setAvatarFocusX: (value: number) => void;
  setAvatarFocusY: (value: number) => void;
  setAvatarZoom: (value: number) => void;
  setIsAvatarFocusModalOpen: (value: boolean) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onRemoveAvatar: () => void;
  onCompleteAccountSetup: (
    legalAcceptance: PlatformLegalAcceptanceDraft | null,
  ) => Promise<boolean> | boolean;
  onClose?: () => void;
};

export type PlatformLegalAcceptanceDraft = {
  termsOfServiceVersion: string;
  privacyPolicyVersion: string;
};

const STEP_LABELS: Record<OnboardingStep, string> = {
  identity: "Profile",
};

function normalizeStep(_step: AccountSetupStep | null | undefined): OnboardingStep {
  return "identity";
}

function stepIsComplete(status: AccountSetupStatus | null, step: OnboardingStep): boolean {
  return Boolean(status?.steps.find((item) => item.step === step)?.completed);
}

function StepIcon(props: { step: OnboardingStep }) {
  switch (props.step) {
    case "identity":
      return <CircleUserRound size={15} strokeWidth={2} aria-hidden="true" />;
  }
}

function formatHandleAvailability(
  handle: string,
  availability: WebAccountSetupSurfaceModel["identity"]["handleAvailability"],
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

export function WebOnboardingPage(props: WebOnboardingPageProps) {
  const { identity, submission } = props.setup;
  const [step, setStep] = useState<OnboardingStep>(() =>
    normalizeStep(props.accountSetupStatus?.current_step),
  );
  const [hasConfirmedPlatformLegal, setHasConfirmedPlatformLegal] = useState(false);
  const [activeLegalDocument, setActiveLegalDocument] = useState<LegalDocumentEntry | null>(null);
  const [setupGuidance, setSetupGuidance] = useState<string | null>(null);
  const progress = props.accountSetupStatus?.percent ?? 0;
  const progressCircumference = 2 * Math.PI * 17;
  const progressDashOffset = progressCircumference - (progress / 100) * progressCircumference;
  useEffect(() => {
    if (props.accountSetupStatus?.completed) {
      setSetupGuidance(null);
    }
  }, [props.accountSetupStatus?.completed]);
  const normalizedHandle = normalizeProfileHandle(identity.handle);
  const handleAvailabilityMatches =
    identity.handleAvailability?.normalized_handle === normalizedHandle;
  const handleReady =
    Boolean(normalizedHandle) &&
    !identity.isCheckingHandleAvailability &&
    Boolean(handleAvailabilityMatches && identity.handleAvailability?.available);
  const platformLegalMissing = props.accountSetupStatus?.missing.includes("platform_legal") !== false;
  const platformLegalReady = !platformLegalMissing || hasConfirmedPlatformLegal;
  const profileReady =
    identity.displayName.trim().length > 0 &&
    Boolean(identity.avatarUrl?.trim()) &&
    handleReady &&
    platformLegalReady;
  const handleAvailability = formatHandleAvailability(
    identity.handle,
    identity.handleAvailability,
    identity.isCheckingHandleAvailability,
  );
  const stepOrder: OnboardingStep[] = ["identity"];
  const setupRequirementMessage =
    submission.error && props.accountSetupStatus && !props.accountSetupStatus.completed
      ? formatAccountSetupMissingGuidance(props.accountSetupStatus)
      : null;
  const displayedStatusMessage = setupGuidance ?? submission.error;
  const displayedStatusMessageIsGuidance =
    Boolean(setupGuidance) ||
    Boolean(submission.error && setupRequirementMessage === submission.error);

  const goNext = async () => {
    setSetupGuidance(null);
    if (step === "identity") {
      await props.onCompleteAccountSetup(
        platformLegalReady
          ? {
              termsOfServiceVersion: TERMS_OF_SERVICE_ENTRY.version,
              privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_ENTRY.version,
            }
          : null,
      );
      return;
    }
  };

  const nextDisabled =
    submission.isSaving ||
    (step === "identity" && !profileReady);

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
          <p className="setup-section-kicker">Account setup</p>
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
                  name={identity.displayName || identity.handle || "Profile"}
                  imageUrl={identity.avatarUrl}
                  focusX={identity.avatarFocusX}
                  focusY={identity.avatarFocusY}
                  zoom={identity.avatarZoom}
                  alt="Profile avatar"
                  fallback={
                    <span>{identity.displayName.trim().charAt(0).toUpperCase() || "P"}</span>
                  }
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
                      onChange={(event) =>
                        void identity.onAvatarUpload(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  {identity.avatarUrl ? (
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
                  values={identity.socialLinks}
                  disabled={submission.isSaving}
                  variant="onboarding"
                  onChange={identity.onSocialLinkChange}
                />
              </div>
              <label>
                Display name
                <input
                  value={identity.displayName}
                  onChange={(event) => identity.onDisplayNameChange(event.target.value)}
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
                    value={identity.handle}
                    onChange={(event) => identity.onHandleChange(event.target.value)}
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
                  value={identity.bio}
                  onChange={(event) => identity.onBioChange(event.target.value)}
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
                  disabled={!platformLegalMissing || submission.isSaving}
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
              <button
                type="button"
                className="polynet-onboarding-next"
                disabled={nextDisabled}
                onClick={() => void goNext()}
              >
                {submission.isSaving
                  ? "Saving..."
                  : "Finish setup"}
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
        avatarUrl={identity.avatarUrl}
        focusX={identity.avatarFocusX}
        focusY={identity.avatarFocusY}
        zoom={identity.avatarZoom}
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
    <WebBlockingSetupModal
      titleId="polynet-onboarding-title"
      dismissible={Boolean(props.onClose)}
      busy={submission.isSaving}
      size="wide"
      className="polynet-onboarding-modal"
      onDismiss={handleClose}
    >
      {flow}
    </WebBlockingSetupModal>
  );
}
