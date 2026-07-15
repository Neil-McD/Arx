import { Copy, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { tryCopyTextToClipboard } from "../../../../shared/chatUi";
import {
  POLYNET_MCP_ENDPOINT_URL,
  POLYNET_MCP_SETUP_BUNDLE,
} from "../../../../shared/polynetMcpSetup";

type CopyState = "idle" | "copying" | "saving" | "error";

export function WebCommunityOnboardingMcpGuide(props: {
  isPending: boolean;
  error: string | null;
  onComplete: () => Promise<boolean>;
  onDismiss: () => void;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyButtonRef = useRef<HTMLButtonElement | null>(null);
  const isBusy = props.isPending || copyState === "copying" || copyState === "saving";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => copyButtonRef.current?.focus());
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
      setCopyState("saving");
      const completed = await props.onComplete();
      if (!completed) {
        setCopyState("error");
        setCopyError("The setup packet was copied, but we couldn’t save your progress. Try again.");
      }
    } catch {
      setCopyState("error");
      setCopyError("We couldn’t copy the setup packet. Try again.");
    }
  };

  return (
    <div className="community-onboarding-mcp-overlay">
      <section
        className="community-onboarding-mcp-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-onboarding-mcp-title"
        aria-describedby="community-onboarding-mcp-description"
      >
        <div className="community-onboarding-mcp-icon" aria-hidden="true">
          <Link2 />
        </div>
        <div className="community-onboarding-mcp-copy">
          <span>Step 4 of 4</span>
          <h2 id="community-onboarding-mcp-title">Take Polynet with you</h2>
          <p id="community-onboarding-mcp-description">
            Copy one setup packet, paste it into Codex, Claude Code, Cursor, Hermes,
            OpenClaw, or another MCP-compatible harness, then sign in once.
          </p>
          <code>{POLYNET_MCP_ENDPOINT_URL}</code>
          {copyError || props.error ? (
            <small role="alert">{copyError ?? props.error}</small>
          ) : (
            <small>Your harness will use your Polynet permissions and community access.</small>
          )}
        </div>
        <div className="community-onboarding-mcp-actions">
          <button type="button" onClick={props.onDismiss} disabled={isBusy}>
            Skip onboarding
          </button>
          <button
            ref={copyButtonRef}
            className="primary"
            type="button"
            onClick={() => void handleCopy()}
            disabled={isBusy}
          >
            <Copy aria-hidden="true" />
            {copyState === "copying"
              ? "Copying…"
              : copyState === "saving" || props.isPending
                ? "Finishing…"
                : copyState === "error"
                  ? "Try again"
                  : "Copy setup"}
          </button>
        </div>
      </section>
    </div>
  );
}
