import { useEffect, useState } from "react";

import { tryCopyTextToClipboard } from "../../../../shared/chatUi";
import { buildPolynetMcpSetupForOrigin } from "../../../../shared/polynetMcpSetup";
import { KitAiHarnessLogos } from "../v1/KitAiHarnessLogos";
import { SettingsGroup, SettingsRow } from "./SettingsRows";

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
    <SettingsGroup label="Your AI">
      <SettingsRow
        label="Connect your AI"
        help={
          props.session ? (
            <>
              <span>Paste one universal prompt into your AI tool, then sign in once. It sees only communities you&apos;re in.</span>
              <KitAiHarnessLogos compact />
            </>
          ) : (
            "Sign in to connect your AI."
          )
        }
      >
        {props.session ? (
          <button
            className="settings-v1-button"
            type="button"
            onClick={() => void handleCopySetup()}
          >
            {copyState === "copied"
              ? "Copied"
              : copyState === "error"
                ? "Copy failed"
                : "Copy setup"}
          </button>
        ) : null}
      </SettingsRow>
    </SettingsGroup>
  );
}
