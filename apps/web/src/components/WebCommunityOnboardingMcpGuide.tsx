import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";

import { tryCopyTextToClipboard } from "../../../../shared/chatUi";
import { buildCommunityOnboardingCopy } from "../../../../shared/communityOnboardingCopy";
import {
  POLYNET_MCP_SETUP_BUNDLE,
  POLYNET_MCP_TOOL_COUNT_LABEL,
} from "../../../../shared/polynetMcpSetup";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";
import { WebCommunityOnboardingConciergeSurface } from "./WebCommunityOnboardingConciergeSurface";
import { WebCommunityOnboardingMcpCompatibility } from "./WebCommunityOnboardingMcpCompatibility";

type CopyState = "idle" | "copying" | "saving" | "error";

export function WebCommunityOnboardingMcpGuide(props: {
  communityName: string;
  communityAvatarUrl?: string | null;
  communityAvatarFocusX?: number | null;
  communityAvatarFocusY?: number | null;
  communityAvatarZoom?: number | null;
  isPending: boolean;
  error: string | null;
  onComplete: () => Promise<boolean>;
  onDismiss: () => void;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [copyError, setCopyError] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const isBusy = props.isPending || copyState === "copying" || copyState === "saving";
  const transcript = hasCopied
    ? "**Copied.**\n\nGo to your harness and paste the setup into the chat. It will add the Polynet MCP server, guide you through sign-in if needed, and verify the connection for you.\n\nOnce connected, you can work with Polynet from any harness."
    : buildCommunityOnboardingCopy({
        cue: "mcp_handoff",
        communityName: props.communityName,
        hasVideo: false,
      });
  const primaryLabel =
    copyState === "error" ? "Try finishing again" : "Finish onboarding";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleCopy = async () => {
    if (isBusy) return;
    setCopyState("copying");
    setCopyError(null);
    try {
      const copied = await tryCopyTextToClipboard(POLYNET_MCP_SETUP_BUNDLE);
      if (!copied) {
        setCopyState("error");
        setCopyError("We couldn’t copy the setup packet. Try again.");
        return;
      }
      setHasCopied(true);
      setCopyState("idle");
    } catch {
      setCopyState("error");
      setCopyError("We couldn’t copy the setup packet. Try again.");
    }
  };

  const handleFinish = async () => {
    if (isBusy) return;
    setCopyState("saving");
    setCopyError(null);
    try {
      const completed = await props.onComplete();
      if (!completed) {
        setCopyState("error");
        setCopyError("Your setup is copied, but we couldn’t finish onboarding. Try again.");
      }
    } catch {
      setCopyState("error");
      setCopyError("Your setup is copied, but we couldn’t finish onboarding. Try again.");
    }
  };

  return (
    <div className="community-onboarding-mcp-overlay">
      <section
        ref={dialogRef}
        className="community-onboarding-concierge-guide community-onboarding-mcp-guide"
        role="dialog"
        aria-modal="true"
        aria-label={`${props.communityName} onboarding: Take Polynet with you`}
        aria-describedby="community-onboarding-mcp-description"
        tabIndex={-1}
      >
        <WebCommunityOnboardingConciergeSurface
          key={hasCopied ? "copied" : "ready"}
          communityName={props.communityName}
          communityAvatarUrl={props.communityAvatarUrl}
          communityAvatarFocusX={props.communityAvatarFocusX}
          communityAvatarFocusY={props.communityAvatarFocusY}
          communityAvatarZoom={props.communityAvatarZoom}
          stepLabel="Step 4 of 4"
          transcript={transcript}
          descriptionId="community-onboarding-mcp-description"
          isPending={isBusy}
          error={copyError ?? props.error}
          primaryLabel={primaryLabel}
          pendingPrimaryLabel={copyState === "saving" || props.isPending ? "Finishing…" : "Copying…"}
          autoFocusPrimary={hasCopied}
          showPrimary={hasCopied}
          secondaryLabel="Skip"
          onPrimary={() => void handleFinish()}
          onSecondary={props.onDismiss}
        >
          <WebCommunityOnboardingMcpCompatibility />
          <div className={`community-onboarding-mcp-product-card${hasCopied ? " is-copied" : ""}`}>
            <div className="community-onboarding-mcp-product-identity">
              <DiscoverCatalogLogo
                name="Polynet MCP"
                logoUrl="/landing-polynet/logo.png"
              />
              <div className="community-onboarding-mcp-product-copy">
                <strong>Polynet MCP</strong>
                <span>
                  Access your authorized Polynet communities from compatible AI harnesses.
                </span>
                <small>{POLYNET_MCP_TOOL_COUNT_LABEL} · OAuth protected</small>
              </div>
            </div>
            <button
              type="button"
              className="community-onboarding-mcp-copy-action"
              onClick={() => void handleCopy()}
              disabled={isBusy || hasCopied}
            >
              <Copy aria-hidden="true" />
              {hasCopied
                ? "Setup copied"
                : copyState === "error"
                  ? "Try copying again"
                  : copyState === "copying"
                    ? "Copying…"
                    : "Copy MCP setup"}
            </button>
          </div>
        </WebCommunityOnboardingConciergeSurface>
      </section>
    </div>
  );
}
