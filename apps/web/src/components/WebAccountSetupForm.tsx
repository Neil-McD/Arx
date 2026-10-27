import { useId, useRef, useState } from "react";
import { Camera } from "lucide-react";

import type { AccountSetupStatus } from "../../../../shared/accountSetup";
import { normalizeProfileHandle } from "../../../../shared/profileHandle";
import { PROFILE_DISPLAY_NAME_MAX_CHARS } from "../../../../shared/profileText";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  PRIVACY_AI_DATA_POLICY_ENTRY,
  TERMS_OF_SERVICE_ENTRY,
  type LegalDocumentEntry,
} from "../docs/legalDocumentsContent";
import { formatProfileHandleAvailabilityHint } from "./profileHandleAvailabilityHint";
import { WebPlatformLegalReaderModal } from "./WebPlatformLegalReaderModal";
import { WebUserAvatarEditorModal } from "./WebUserAvatarEditorModal";
import type {
  PlatformLegalAcceptanceDraft,
  WebAccountSetupSurfaceModel,
} from "./webAccountSetupSurfaceModel";

type MissingField = "photo" | "name" | "handle" | "terms";

type WebAccountSetupFormProps = {
  accountSetupStatus: AccountSetupStatus | null;
  setup: WebAccountSetupSurfaceModel;
  primaryLabel: string;
  savingLabel: string;
  trustCopy?: string | null;
  onSubmit: (
    legalAcceptance: PlatformLegalAcceptanceDraft | null,
  ) => Promise<boolean> | boolean;
};

export function WebAccountSetupForm(props: WebAccountSetupFormProps) {
  const { identity, submission } = props.setup;
  const legalId = useId();
  const [attempted, setAttempted] = useState(false);
  const [hasConfirmedLegal, setHasConfirmedLegal] = useState(false);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [isAvatarDragOver, setIsAvatarDragOver] = useState(false);
  const [activeLegalDocument, setActiveLegalDocument] =
    useState<LegalDocumentEntry | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const identityRef = useRef<HTMLDivElement | null>(null);
  const legalRef = useRef<HTMLDivElement | null>(null);

  const normalizedHandle = normalizeProfileHandle(identity.handle);
  const handleAvailabilityMatches =
    identity.handleAvailability?.normalized_handle === normalizedHandle;
  const handleReady =
    Boolean(normalizedHandle) &&
    !identity.isCheckingHandleAvailability &&
    Boolean(handleAvailabilityMatches && identity.handleAvailability?.available);
  const handleHint = formatProfileHandleAvailabilityHint({
    handle: identity.handle,
    availability: identity.handleAvailability,
    isChecking: identity.isCheckingHandleAvailability,
    copy: {
      empty: "Required for your public profile.",
      checking: "Checking handle…",
      unknown: "Use 3–32 letters, numbers, underscores, or hyphens.",
      available: (available) => `@${available} is available.`,
      taken: "That handle is already taken.",
      reserved: "That handle is reserved.",
      tooShort: "Use at least 3 characters.",
      tooLong: "Use 32 characters or less.",
      invalidFormat: "Start and end with a letter or number.",
    },
  });
  const platformLegalMissing =
    props.accountSetupStatus?.missing.includes("platform_legal") !== false;
  const platformLegalReady = !platformLegalMissing || hasConfirmedLegal;
  const missing: MissingField[] = [];
  if (!identity.avatarUrl?.trim()) missing.push("photo");
  if (!identity.displayName.trim()) missing.push("name");
  if (!handleReady) missing.push("handle");
  if (!platformLegalReady) missing.push("terms");
  const isReady = missing.length === 0 && !submission.isSaving;

  const submit = async () => {
    if (submission.isSaving) return;
    if (missing.length > 0) {
      setAttempted(true);
      (missing[0] === "terms" ? legalRef.current : identityRef.current)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    await props.onSubmit(
      platformLegalMissing
        ? {
            termsOfServiceVersion: TERMS_OF_SERVICE_ENTRY.version,
            privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_ENTRY.version,
          }
        : null,
    );
  };

  const isMissing = (field: MissingField) => attempted && missing.includes(field);

  return (
    <div className="account-setup-form">
      <div className="account-setup-identity" ref={identityRef}>
        <div className="account-setup-avatar-block">
          <button
            className={`account-setup-avatar-trigger${identity.avatarUrl ? " has-image" : ""}${isAvatarDragOver ? " is-drag-over" : ""}${isMissing("photo") ? " is-missing" : ""}`}
            type="button"
            aria-label={identity.avatarUrl ? "Change profile photo" : "Add a profile photo"}
            disabled={submission.isSaving}
            onClick={() => avatarInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsAvatarDragOver(true);
            }}
            onDragLeave={() => setIsAvatarDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsAvatarDragOver(false);
              void identity.onAvatarUpload(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <UserAvatar
              className="account-setup-avatar"
              readyClassName="has-image"
              name={identity.displayName || identity.handle || "Profile"}
              imageUrl={identity.avatarUrl}
              focusX={identity.avatarFocusX}
              focusY={identity.avatarFocusY}
              zoom={identity.avatarZoom}
              alt="Profile avatar"
              fallback={<Camera size={22} strokeWidth={1.6} aria-hidden="true" />}
            />
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            hidden
            disabled={submission.isSaving}
            onChange={(event) => {
              void identity.onAvatarUpload(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          <div className="account-setup-avatar-actions">
            <button
              type="button"
              disabled={submission.isSaving}
              onClick={() => avatarInputRef.current?.click()}
            >
              {identity.avatarUrl ? "Change photo" : "Add photo"}
            </button>
            {identity.avatarUrl ? (
              <>
                <button
                  type="button"
                  disabled={submission.isSaving}
                  onClick={() => setIsAvatarEditorOpen(true)}
                >
                  Adjust
                </button>
                <button
                  type="button"
                  disabled={submission.isSaving}
                  onClick={identity.onAvatarRemove}
                >
                  Remove
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="account-setup-fields">
          <label>
            <span>Display name</span>
            <input
              className={isMissing("name") ? "is-missing" : ""}
              value={identity.displayName}
              maxLength={PROFILE_DISPLAY_NAME_MAX_CHARS}
              placeholder="Your name"
              autoComplete="name"
              disabled={submission.isSaving}
              onChange={(event) => identity.onDisplayNameChange(event.target.value)}
            />
          </label>
          <label>
            <span>Handle</span>
            <div className={`account-setup-handle${isMissing("handle") ? " is-missing" : ""}`}>
              <span aria-hidden="true">@</span>
              <input
                value={identity.handle}
                placeholder="yourhandle"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                disabled={submission.isSaving}
                onChange={(event) => identity.onHandleChange(event.target.value)}
              />
            </div>
            <small className={`account-setup-handle-status is-${handleHint.kind}`}>
              {handleHint.label}
            </small>
          </label>
        </div>
      </div>

      <div
        ref={legalRef}
        className={`account-setup-legal${isMissing("terms") ? " is-missing" : ""}`}
      >
        <input
          id={legalId}
          type="checkbox"
          aria-describedby={`${legalId}-copy`}
          checked={platformLegalReady}
          disabled={!platformLegalMissing || submission.isSaving}
          onChange={(event) => setHasConfirmedLegal(event.currentTarget.checked)}
        />
        <div id={`${legalId}-copy`} className="account-setup-legal-copy">
          <label htmlFor={legalId}>I agree to the</label>{" "}
          <button type="button" onClick={() => setActiveLegalDocument(TERMS_OF_SERVICE_ENTRY)}>
            Terms of Service
          </button>{" "}
          and acknowledge the{" "}
          <button type="button" onClick={() => setActiveLegalDocument(PRIVACY_AI_DATA_POLICY_ENTRY)}>
            Privacy &amp; AI Data Policy
          </button>
          .
        </div>
      </div>

      {submission.error ? (
        <p className="account-setup-error" role="alert">{submission.error}</p>
      ) : null}

      <button
        className={`account-setup-primary${isReady ? " is-ready" : ""}`}
        type="button"
        disabled={submission.isSaving}
        aria-busy={submission.isSaving || undefined}
        onClick={() => void submit()}
      >
        {submission.isSaving ? props.savingLabel : props.primaryLabel}
      </button>
      <div className="account-setup-guidance" role="status" aria-live="polite">
        {attempted && missing.length > 0
          ? `Still needed: ${missing.join(" · ")}`
          : attempted
            ? "Everything is ready."
            : ""}
      </div>
      {props.trustCopy ? <p className="account-setup-trust">{props.trustCopy}</p> : null}

      {activeLegalDocument ? (
        <WebPlatformLegalReaderModal
          document={activeLegalDocument}
          onClose={() => setActiveLegalDocument(null)}
        />
      ) : null}
      <WebUserAvatarEditorModal
        isOpen={isAvatarEditorOpen}
        avatarUrl={identity.avatarUrl}
        focusX={identity.avatarFocusX}
        focusY={identity.avatarFocusY}
        zoom={identity.avatarZoom}
        title="Adjust profile photo"
        imageAlt="Profile photo preview"
        hint="Drag the image to frame it inside your profile avatar."
        onChangeFocusX={identity.onAvatarFocusXChange}
        onChangeFocusY={identity.onAvatarFocusYChange}
        onChangeZoom={identity.onAvatarZoomChange}
        onDirty={() => undefined}
        onClose={() => setIsAvatarEditorOpen(false)}
      />
    </div>
  );
}
