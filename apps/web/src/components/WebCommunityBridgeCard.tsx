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
import {
  PRIVACY_AI_DATA_POLICY_ENTRY,
  TERMS_OF_SERVICE_ENTRY,
  type LegalDocumentEntry,
} from "../docs/legalDocumentsContent";
import { renderMarkdown } from "../../../../shared/markdownUi";
import type { PlatformLegalAcceptanceDraft } from "./WebOnboardingPage";

type BridgeHandleAvailability = {
  available: boolean;
  status: "empty" | "too_short" | "too_long" | "invalid_format" | "reserved" | "available" | "taken";
  handle: string | null;
  normalized_handle: string | null;
};

export type WebCommunityBridgeCardProps = {
  communityName: string;
  communityAvatarUrl: string | null;
  communityAvatarFocusX: number | null;
  communityAvatarFocusY: number | null;
  communityAvatarZoom: number | null;
  paidReceiptLabel: string | null;
  enterLabel: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  handleAvailability: BridgeHandleAvailability | null;
  isCheckingHandleAvailability: boolean;
  onDisplayNameChange: (value: string) => void;
  onHandleChange: (value: string) => void;
  onAvatarUpload: (file: File | null) => Promise<void> | void;
  chatgptConnected: boolean;
  openAiConnected: boolean;
  isConnectingChatgpt: boolean;
  isPollingChatgptConnection: boolean;
  onConnectChatgpt: () => void;
  openAiApiKeyDraft: string;
  setOpenAiApiKeyDraft: (value: string) => void;
  isSavingOpenAiConnection: boolean;
  openAiConnectionError: string | null;
  openAiConnectionSuccess: string | null;
  onConnectOpenAi: () => Promise<void> | void;
  isSaving: boolean;
  error: string | null;
  onEnter: (legalAcceptance: PlatformLegalAcceptanceDraft | null) => Promise<boolean> | boolean;
};

type BridgeMissing = "photo" | "name" | "handle" | "AI" | "terms";

function formatBridgeHandleHint(
  handle: string,
  availability: BridgeHandleAvailability | null,
  isChecking: boolean,
): { ok: boolean; label: string } {
  const trimmed = handle.trim();
  if (!trimmed) return { ok: false, label: "" };
  if (isChecking) return { ok: false, label: "Checking handle..." };
  if (!validateProfileHandle(trimmed).ok) {
    return { ok: false, label: "Use 3-32 letters, numbers, underscores, or hyphens." };
  }
  if (!availability) return { ok: false, label: "" };
  if (availability.status === "available") return { ok: true, label: `@${trimmed} is available` };
  if (availability.status === "taken") return { ok: false, label: `@${trimmed} is taken` };
  if (availability.status === "reserved") return { ok: false, label: `@${trimmed} is reserved` };
  return { ok: false, label: "Use 3-32 letters, numbers, underscores, or hyphens." };
}

export function WebCommunityBridgeCard(props: WebCommunityBridgeCardProps) {
  const [attempted, setAttempted] = useState(false);
  const [hasConfirmedLegal, setHasConfirmedLegal] = useState(false);
  const [showKeyEntry, setShowKeyEntry] = useState(false);
  const [activeLegalDocument, setActiveLegalDocument] = useState<LegalDocumentEntry | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const identityRef = useRef<HTMLDivElement | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const legalRef = useRef<HTMLLabelElement | null>(null);

  const hasInferenceProvider = props.chatgptConnected || props.openAiConnected;
  const handleHint = formatBridgeHandleHint(
    props.handle,
    props.handleAvailability,
    props.isCheckingHandleAvailability,
  );

  const missing: BridgeMissing[] = [];
  if (!props.avatarUrl?.trim()) missing.push("photo");
  if (!props.displayName.trim()) missing.push("name");
  if (!handleHint.ok) missing.push("handle");
  if (!hasInferenceProvider) missing.push("AI");
  if (!hasConfirmedLegal) missing.push("terms");

  const lit = (field: BridgeMissing) => attempted && missing.includes(field);

  const handleEnter = async () => {
    if (props.isSaving) return;
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

  return (
    <div className="cfg-gatecard cvs-bridge-card">
      <div className="cfg-gbanner" />
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

      <div className="cvs-bridge-section" ref={identityRef}>
        <div className="cvs-bridge-label">
          <span>Identity</span>
          <i />
        </div>
        <div className="cvs-bridge-idgrid">
          <div className="cvs-bridge-avblock">
            <button
              type="button"
              className={`cvs-bridge-avbtn${props.avatarUrl ? " has-photo" : ""}${lit("photo") ? " cvs-bridge-miss" : ""}`}
              onClick={() => avatarInputRef.current?.click()}
              aria-label="Add a profile photo"
            >
              {props.avatarUrl ? (
                <UserAvatar className="cfg-fill" imageUrl={props.avatarUrl} name={props.displayName || "You"} />
              ) : (
                <Camera size={22} strokeWidth={1.6} aria-hidden="true" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void props.onAvatarUpload(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <div className={`cvs-bridge-avcap${props.avatarUrl ? " done" : ""}`}>
              {props.avatarUrl ? "Looks good" : "Add a photo (required)"}
            </div>
          </div>
          <div className="cvs-bridge-fields">
            <label className="cvs-bridge-field">
              Display name
              <input
                className={lit("name") ? "cvs-bridge-miss" : ""}
                value={props.displayName}
                placeholder="Your name"
                autoComplete="off"
                onChange={(event) => props.onDisplayNameChange(event.target.value)}
              />
            </label>
            <label className="cvs-bridge-field">
              Handle
              <span className="cvs-bridge-handle">
                <span aria-hidden="true">@</span>
                <input
                  className={lit("handle") ? "cvs-bridge-miss" : ""}
                  value={props.handle}
                  placeholder="handle"
                  autoComplete="off"
                  onChange={(event) => props.onHandleChange(event.target.value)}
                />
              </span>
              <span className={`cvs-bridge-avail${handleHint.ok ? " ok" : ""}`}>{handleHint.label}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="cvs-bridge-section" ref={aiRef}>
        <div className="cvs-bridge-label">
          <span>Your AI</span>
          <i />
        </div>
        <p className="cvs-bridge-aicopy">
          {props.communityName} onboards you through your agent — connect the AI that powers it.
        </p>
        <div className="cvs-bridge-tiles">
          <button
            type="button"
            className={`cvs-bridge-tile${props.chatgptConnected ? " selected" : ""}${lit("AI") ? " cvs-bridge-miss" : ""}`}
            onClick={props.onConnectChatgpt}
            disabled={props.isConnectingChatgpt || props.isPollingChatgptConnection}
          >
            {props.chatgptConnected ? (
              <span className="cvs-bridge-tile-check" aria-hidden="true">
                <Check size={10} strokeWidth={3.2} />
              </span>
            ) : null}
            <span className="cvs-bridge-tile-name">
              {props.chatgptConnected
                ? "ChatGPT connected"
                : props.isConnectingChatgpt || props.isPollingChatgptConnection
                  ? "Connecting..."
                  : "Connect ChatGPT"}
            </span>
            <span className="cvs-bridge-tile-sub">Use your Plus or Pro plan limits</span>
          </button>
          <button
            type="button"
            className={`cvs-bridge-tile${props.openAiConnected ? " selected" : ""}${lit("AI") ? " cvs-bridge-miss" : ""}`}
            onClick={() => setShowKeyEntry((value) => !value)}
          >
            {props.openAiConnected ? (
              <span className="cvs-bridge-tile-check" aria-hidden="true">
                <Check size={10} strokeWidth={3.2} />
              </span>
            ) : null}
            <span className="cvs-bridge-tile-name">
              {props.openAiConnected ? "API key saved" : "OpenAI API key"}
            </span>
            <span className="cvs-bridge-tile-sub">Use a key from your OpenAI account</span>
          </button>
        </div>
        {showKeyEntry || props.openAiConnected ? (
          <div className="cvs-bridge-keyrow">
            <input
              value={props.openAiApiKeyDraft}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(event) => props.setOpenAiApiKeyDraft(event.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                void props.onConnectOpenAi();
              }}
              disabled={props.isSavingOpenAiConnection || props.openAiApiKeyDraft.trim().length === 0}
            >
              {props.isSavingOpenAiConnection ? "Saving..." : props.openAiConnected ? "Update key" : "Save"}
            </button>
          </div>
        ) : null}
        {props.openAiConnectionError ? <p className="cvs-bridge-error">{props.openAiConnectionError}</p> : null}
        {props.openAiConnectionSuccess ? <p className="cvs-bridge-success">{props.openAiConnectionSuccess}</p> : null}
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

      {props.error ? <p className="cvs-bridge-error">{props.error}</p> : null}

      <button className="cfg-join" type="button" onClick={() => void handleEnter()}>
        {props.isSaving ? "Entering..." : props.enterLabel}
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
        <div className="modal-overlay polynet-onboarding-legal-overlay" onClick={() => setActiveLegalDocument(null)}>
          <div
            className="modal polynet-onboarding-legal-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="modal-title">{activeLegalDocument.title}</div>
                <div className="polynet-onboarding-legal-meta">
                  {activeLegalDocument.version} - Effective {activeLegalDocument.effectiveDate}
                </div>
              </div>
              <button className="modal-close" type="button" onClick={() => setActiveLegalDocument(null)} title="Close">
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
    </div>
  );
}
