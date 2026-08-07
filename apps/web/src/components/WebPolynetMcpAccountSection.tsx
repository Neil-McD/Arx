import { useEffect, useState } from "react";
import { Copy } from "lucide-react";

import { tryCopyTextToClipboard } from "../../../../shared/chatUi";
import { buildPolynetMcpSetupForOrigin } from "../../../../shared/polynetMcpSetup";
import { DiscoverCatalogLogo } from "./DiscoverCatalogLogo";

export type WebPolynetMcpAccountSectionProps = {
  session: {
    user: {
      id: string;
      email?: string | null;
    };
  } | null;
};

export function WebPolynetMcpAccountSection(
  props: WebPolynetMcpAccountSectionProps,
) {
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
      const setup = buildPolynetMcpSetupForOrigin(window.location.origin);
      const copied = await tryCopyTextToClipboard(setup.setupBundle);
      setCopyState(copied ? "copied" : "error");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">External access</div>
      <div className="settings-section-desc">
        Connect an external AI harness through the official OAuth-protected
        Polynet MCP.
      </div>
      {props.session ? (
        <div className="integrations-app-list">
          <div className="integration-mounted-row polymcp-access-row">
            <div className="integration-mounted-top">
              <div className="integration-mounted-identity">
                <DiscoverCatalogLogo
                  name="Polynet"
                  logoUrl="/landing-polynet/logo.png"
                />
                <div className="integration-mounted-main">
                  <div className="integration-mounted-title-row">
                    <strong>Polynet MCP</strong>
                    <span className="integration-status-pill">
                      OAuth protected
                    </span>
                  </div>
                  <div className="integration-mounted-detail">
                    Copy one setup packet, paste it into Codex, Claude Code, or
                    another compatible harness, then sign in once.
                  </div>
                </div>
              </div>
              <div className="integration-mounted-rail polymcp-access-actions">
                <button
                  type="button"
                  className="settings-cta settings-primary-action polymcp-copy-action"
                  onClick={() => void handleCopySetup()}
                  aria-label="Copy Polynet setup"
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
          </div>
        </div>
      ) : (
        <div className="model-note">
          Sign in to connect an external harness to your authorized communities.
        </div>
      )}
    </div>
  );
}
