/* The guest-pass gate card's SECOND state: after auth (and payment, when paid),
   the same card position asks for everything Polynet needs — identity and
   inference on one page — then hands the member to the community guide.
   The CTA is never disabled: an attempt with gaps lights the missing fields
   up and they clear live as each one is fixed. */
import { useRef, useState } from "react";
import { Camera, Check } from "lucide-react";
import { validateProfileHandle } from "../../../../shared/profileHandle";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { WebSocialProfileLinksFields } from "./WebSocialProfileLinksFields";
import {
  PRIVACY_AI_DATA_POLICY_ENTRY,
  TERMS_OF_SERVICE_ENTRY,
  type LegalDocumentEntry,
} from "../docs/legalDocumentsContent";
import type { PlatformLegalAcceptanceDraft } from "./WebOnboardingPage";
import { WebPlatformLegalReaderModal } from "./WebPlatformLegalReaderModal";
/* The card's styles live in the visitor chrome sheet; own the import so the
   card renders styled wherever it mounts (funnel gate OR standalone page). */
import "./CommunityVisitorChrome.css";

import { formatProfileHandleAvailabilityHint } from "./profileHandleAvailabilityHint";
import type { WebAccountSetupSurfaceModel } from "./webAccountSetupSurfaceModel";

export type WebCommunityBridgeCardProps = {
  /* "community": banner + community identity — for people entering a specific
     community. "platform": bannerless, platform-generic — for people who just
     joined Polynet and already came through the platform's own pitch. */
  variant?: "community" | "platform";
  communityName: string;
  communityAvatarUrl: string | null;
  communityAvatarFocusX: number | null;
  communityAvatarFocusY: number | null;
  communityAvatarZoom: number | null;
  paidReceiptLabel: string | null;
  enterLabel: string;
  setup: WebAccountSetupSurfaceModel;
  onEnter: (legalAcceptance: PlatformLegalAcceptanceDraft | null) => Promise<boolean> | boolean;
};

type BridgeMissing = "photo" | "name" | "handle" | "AI" | "terms";

function formatBridgeHandleHint(
  handle: string,
  availability: WebAccountSetupSurfaceModel["identity"]["handleAvailability"],
  isChecking: boolean,
): { ok: boolean; label: string } {
  const trimmed = handle.trim();
  /* Instant client-side format feedback before the availability check lands. */
  if (trimmed && !isChecking && !validateProfileHandle(trimmed).ok) {
    return { ok: false, label: "Use 3-32 letters, numbers, underscores, or hyphens." };
  }
  const hint = formatProfileHandleAvailabilityHint({
    handle,
    availability,
    isChecking,
    copy: {
      empty: "",
      checking: "Checking handle...",
      unknown: "",
      available: () => `@${trimmed} is available`,
      taken: `@${trimmed} is taken`,
      reserved: `@${trimmed} is reserved`,
      tooShort: "Use 3-32 letters, numbers, underscores, or hyphens.",
      tooLong: "Use 3-32 letters, numbers, underscores, or hyphens.",
      invalidFormat: "Use 3-32 letters, numbers, underscores, or hyphens.",
    },
  });
  return { ok: hint.kind === "success", label: hint.label };
}

export function WebCommunityBridgeCard(props: WebCommunityBridgeCardProps) {
  const { identity, inference, submission } = props.setup;
  const { chatgpt, openai } = inference;
  const [attempted, setAttempted] = useState(false);
  const [hasConfirmedLegal, setHasConfirmedLegal] = useState(false);
  const [showKeyEntry, setShowKeyEntry] = useState(false);
  const [activeLegalDocument, setActiveLegalDocument] = useState<LegalDocumentEntry | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const identityRef = useRef<HTMLDivElement | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const legalRef = useRef<HTMLLabelElement | null>(null);

  const hasInferenceProvider = chatgpt.connected || openai.connected;
  const handleHint = formatBridgeHandleHint(
    identity.handle,
    identity.handleAvailability,
    identity.isCheckingHandleAvailability,
  );

  const missing: BridgeMissing[] = [];
  if (!identity.avatarUrl?.trim()) missing.push("photo");
  if (!identity.displayName.trim()) missing.push("name");
  if (!handleHint.ok) missing.push("handle");
  if (!hasInferenceProvider) missing.push("AI");
  if (!hasConfirmedLegal) missing.push("terms");

  const lit = (field: BridgeMissing) => attempted && missing.includes(field);

  const handleEnter = async () => {
    if (submission.isSaving) return;
    if (missing.length > 0) {
      setAttempted(true);
      const target =
        missing[0] === "AI" ? aiRef.current : missing[0] === "terms" ? legalRef.current : identityRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    /* Always submit acceptance versions — the server records them
       idempotently, and version skew fails loudly instead of stranding
       the member behind a checkbox that isn't rendered. */
    await props.onEnter({
      termsOfServiceVersion: TERMS_OF_SERVICE_ENTRY.version,
      privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_ENTRY.version,
    });
  };

  const isPlatform = props.variant === "platform";

  return (
    <div className={`cfg-gatecard cvs-bridge-card${isPlatform ? " cvs-bridge-platform" : ""}`}>
      {isPlatform ? null : <div className="cfg-gbanner" />}
      {isPlatform ? null : (
        <>
          <div className="cfg-gav">
            <CommunityAvatar
              className="cfg-fill"
              imageUrl={props.communityAvatarUrl}
              focusX={props.communityAvatarFocusX}
              focusY={props.communityAvatarFocusY}
              zoom={props.communityAvatarZoom}
              name={props.communityName}
              alt={`${props.communityName} avatar`}
            />
          </div>
          <div className="cfg-gname">{props.communityName}</div>
          {props.paidReceiptLabel ? (
            <div className="cvs-bridge-paid">
              <span className="cvs-bridge-paid-dot" aria-hidden="true" />
              {props.paidReceiptLabel}
            </div>
          ) : null}
          <p className="cfg-gpromise">
            You&rsquo;re in as soon as you set up <b>who you are here</b>.
          </p>
        </>
      )}

      <div className="cvs-bridge-section" ref={identityRef}>
        <div className="cvs-bridge-label">
          <span>Identity</span>
          <i />
        </div>
        <div className="cvs-bridge-idgrid">
          <div className="cvs-bridge-avblock">
            {/* The one canonical avatar system (UserAvatar/StableAvatar with
               framing + ready/fallback states) — same as chat and the modal. */}
            <UserAvatar
              className={`polynet-onboarding-avatar cvs-bridge-avatar${lit("photo") ? " cvs-bridge-miss" : ""}`}
              readyClassName="has-image"
              name={identity.displayName || identity.handle || "Profile"}
              imageUrl={identity.avatarUrl}
              focusX={identity.avatarFocusX}
              focusY={identity.avatarFocusY}
              zoom={identity.avatarZoom}
              alt="Profile avatar"
              title={identity.avatarUrl ? "Change photo" : "Add a profile photo"}
              onClick={() => avatarInputRef.current?.click()}
              fallback={<Camera size={22} strokeWidth={1.6} aria-hidden="true" />}
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void identity.onAvatarUpload(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className={`cvs-bridge-avcap${identity.avatarUrl ? " done" : ""}`}
              onClick={() => avatarInputRef.current?.click()}
            >
              {identity.avatarUrl ? "Change photo" : "Add a photo (required)"}
            </button>
          </div>
          <div className="cvs-bridge-fields">
            <label className="cvs-bridge-field">
              Display name
              <input
                className={lit("name") ? "cvs-bridge-miss" : ""}
                value={identity.displayName}
                placeholder="Your name"
                autoComplete="off"
                onChange={(event) => identity.onDisplayNameChange(event.target.value)}
              />
            </label>
            <label className="cvs-bridge-field">
              Handle
              <span className="cvs-bridge-handle">
                <span aria-hidden="true">@</span>
                <input
                  className={lit("handle") ? "cvs-bridge-miss" : ""}
                  value={identity.handle}
                  placeholder="handle"
                  autoComplete="off"
                  onChange={(event) => identity.onHandleChange(event.target.value)}
                />
              </span>
              <span className={`cvs-bridge-avail${handleHint.ok ? " ok" : ""}`}>{handleHint.label}</span>
            </label>
          </div>
        </div>
        {/* Optional, deterministic profile seeds — the canonical social-links
           editor. Whatever lands here is saved with the profile and written
           to the ontology ledger as stated_bridge facts. */}
        <div className="cvs-bridge-socials">
          <span className="cvs-bridge-socials-label">Social links (optional)</span>
          <WebSocialProfileLinksFields
            values={identity.socialLinks}
            disabled={submission.isSaving}
            variant="onboarding"
            onChange={identity.onSocialLinkChange}
          />
        </div>
      </div>

      <div className="cvs-bridge-section" ref={aiRef}>
        <div className="cvs-bridge-label">
          <span>Your AI</span>
          <i />
        </div>
        <p className="cvs-bridge-aicopy">
          {isPlatform
            ? "Polynet runs on your AI — you bring the model, it powers everything you do here."
            : `${props.communityName} onboards you through your agent — connect the AI that powers it.`}
        </p>
        <div className="cvs-bridge-tiles">
          <button
            type="button"
            className={`cvs-bridge-tile${chatgpt.connected ? " selected" : ""}${lit("AI") ? " cvs-bridge-miss" : ""}`}
            onClick={chatgpt.onConnect}
            disabled={chatgpt.isConnecting || chatgpt.isPolling}
          >
            {chatgpt.connected ? (
              <span className="cvs-bridge-tile-check" aria-hidden="true">
                <Check size={10} strokeWidth={3.2} />
              </span>
            ) : null}
            <span className="cvs-bridge-tile-name">
              {chatgpt.connected
                ? "ChatGPT connected"
                : chatgpt.isConnecting || chatgpt.isPolling
                  ? "Connecting..."
                  : "Connect ChatGPT"}
            </span>
            <span className="cvs-bridge-tile-sub">Use your Plus or Pro plan limits</span>
          </button>
          <button
            type="button"
            className={`cvs-bridge-tile${openai.connected ? " selected" : ""}${lit("AI") ? " cvs-bridge-miss" : ""}`}
            onClick={() => setShowKeyEntry((value) => !value)}
          >
            {openai.connected ? (
              <span className="cvs-bridge-tile-check" aria-hidden="true">
                <Check size={10} strokeWidth={3.2} />
              </span>
            ) : null}
            <span className="cvs-bridge-tile-name">
              {openai.connected ? "API key saved" : "OpenAI API key"}
            </span>
            <span className="cvs-bridge-tile-sub">Use a key from your OpenAI account</span>
          </button>
        </div>
        {showKeyEntry || openai.connected ? (
          <div className="cvs-bridge-keyrow">
            <input
              value={openai.apiKeyDraft}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(event) => openai.setApiKeyDraft(event.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                void openai.onConnect();
              }}
              disabled={openai.isSaving || openai.apiKeyDraft.trim().length === 0}
            >
              {openai.isSaving ? "Saving..." : openai.connected ? "Update key" : "Save"}
            </button>
          </div>
        ) : null}
        {openai.error ? <p className="cvs-bridge-error">{openai.error}</p> : null}
        {openai.success ? <p className="cvs-bridge-success">{openai.success}</p> : null}
      </div>

      <label className={`cvs-bridge-legal${lit("terms") ? " cvs-bridge-miss-text" : ""}`} ref={legalRef}>
        <input
          type="checkbox"
          checked={hasConfirmedLegal}
          onChange={(event) => setHasConfirmedLegal(event.target.checked)}
        />
        <span>
          I agree to the{" "}
          <button
            type="button"
            onClick={(event) => {
              /* Reading the document must not toggle consent — stop the
                 label's default activation from reaching the checkbox. */
              event.preventDefault();
              setActiveLegalDocument(TERMS_OF_SERVICE_ENTRY);
            }}
          >
            Terms of Service
          </button>{" "}
          and acknowledge the{" "}
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              setActiveLegalDocument(PRIVACY_AI_DATA_POLICY_ENTRY);
            }}
          >
            Privacy &amp; AI Data Policy
          </button>
          .
        </span>
      </label>

      {submission.error ? <p className="cvs-bridge-error">{submission.error}</p> : null}

      <button className="cfg-join" type="button" onClick={() => void handleEnter()}>
        {submission.isSaving ? "Entering..." : props.enterLabel}
      </button>
      <div className={`cfg-gmicro${attempted && missing.length ? " cvs-bridge-miss-text" : ""}`}>
        {attempted && missing.length
          ? `Still needed: ${missing.join(" · ")}`
          : attempted
            ? "Everything's ready — instant access."
            : ""}
      </div>
      <div className="cvs-bridge-trust">
        Communities see your profile card — never your keys or your billing.
      </div>

      {activeLegalDocument ? (
        <WebPlatformLegalReaderModal
          document={activeLegalDocument}
          onClose={() => setActiveLegalDocument(null)}
        />
      ) : null}
    </div>
  );
}
