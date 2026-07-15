import { useEffect, useRef, useState } from "react";

import { tryCopyTextToClipboard } from "../../../../shared/chatUi";
import { POLYNET_MCP_SETUP_BUNDLE } from "../../../../shared/polynetMcpSetup";
import { WebCommunityOnboardingConciergeSurface } from "./WebCommunityOnboardingConciergeSurface";

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
    : "**Take Polynet with you.**\n\nPolynet MCP lets you access your communities from the AI harnesses you already use. Copy the setup below to connect another harness.";
  const primaryLabel = hasCopied
    ? copyState === "error"
      ? "Try finishing again"
      : "Finish onboarding"
    : copyState === "error"
      ? "Try copying again"
      : "Copy MCP setup";

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
          autoFocusPrimary={true}
          secondaryLabel="Skip"
          onPrimary={() => void (hasCopied ? handleFinish() : handleCopy())}
          onSecondary={props.onDismiss}
        />
      </section>
    </div>
  );
}
