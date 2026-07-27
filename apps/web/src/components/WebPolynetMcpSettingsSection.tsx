import { useEffect, useState } from "react";
import { Copy } from "lucide-react";

import { tryCopyTextToClipboard } from "../../../../shared/chatUi";
import { POLYNET_MCP_SETUP_BUNDLE } from "../../../../shared/polynetMcpSetup";

export function WebPolynetMcpSettingsSection() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const handleCopySetup = async () => {
    try {
      const copied = await tryCopyTextToClipboard(POLYNET_MCP_SETUP_BUNDLE);
      setCopyState(copied ? "copied" : "error");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <>
      <div className="panel-title">Polynet MCP</div>
      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24">
            <rect x="7" y="7" width="10" height="10" rx="2" />
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          </svg>
          Connect an AI harness
        </div>
        <div className="settings-section-desc">
          Give Codex, Claude Code, Cursor, or another compatible client
          authorized access to your Polynet communities and resources.
        </div>
        <div className="account-row">
          <div className="account-identity">
            <span>Connection</span>
            <strong>OAuth protected · Community-scoped</strong>
          </div>
          <div className="auth-actions">
            <button
              type="button"
              className="settings-cta"
              onClick={() => void handleCopySetup()}
              aria-label="Copy Polynet MCP setup"
            >
              <Copy aria-hidden="true" />
              {copyState === "copied"
                ? "Copied"
                : copyState === "error"
                  ? "Copy failed"
                  : "Copy setup"}
            </button>
          </div>
        </div>
        <div className="model-note">
          Paste the setup packet into your AI client. The client will guide you
          through Polynet sign-in and verify the connection.
        </div>
      </div>
    </>
  );
}
