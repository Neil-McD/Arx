// Global Personal Guide settings (Settings -> You -> Guide).
// Applies across every community the user belongs to: default Personal Soul,
// global "without asking" permissions, and global proactive check-in pause.
import { useEffect, useState } from "react";
import {
  getCloudMyGlobalGuideSettings,
  saveCloudMyGlobalGuideSettings,
  type UserGlobalGuideSettingsView,
} from "../../../../shared/cloudUserGuideSettingsGateway";
import { GUIDE_ALLOWED_MESSAGE_HELP, GUIDE_ALLOWED_MESSAGE_LABEL, GUIDE_ALLOWED_POST_HELP, GUIDE_ALLOWED_POST_LABEL } from "./GuideAllowedSettings";
import { SettingsButton, SettingsGroup, SettingsRow, SettingsSwitch } from "./SettingsRows";

export function WebPersonalGuideSettingsSection(props: { session: unknown | null }) {
  const [settings, setSettings] = useState<UserGlobalGuideSettingsView | null>(null);
  const [soulDraft, setSoulDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedSoul, setSavedSoul] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSettings(null);
    setError(null);
    setSavedSoul(false);
    if (!props.session) return;
    void (async () => {
      try {
        const loaded = await getCloudMyGlobalGuideSettings({ session: props.session });
        if (!cancelled) {
          setSettings(loaded);
          setSoulDraft(loaded.soul_md);
        }
      } catch {
        if (!cancelled) setError("Couldn't load your guide settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.session]);

  if (!props.session) {
    return (
      <SettingsGroup label="Your guide">
        <SettingsRow label="Sign in required" help="Sign in to customize how your guide works with you across communities." />
      </SettingsGroup>
    );
  }

  const update = async (patch: {
    soulMd?: string | null;
    allowPost?: boolean;
    allowMessage?: boolean;
    coachMuted?: boolean;
  }) => {
    if (busy || !props.session) return;
    setBusy(true);
    setError(null);
    setSavedSoul(false);
    try {
      const updated = await saveCloudMyGlobalGuideSettings({
        session: props.session,
        ...patch,
      });
      setSettings(updated);
      if (patch.soulMd !== undefined) {
        setSoulDraft(updated.soul_md);
        setSavedSoul(true);
      }
    } catch (failure) {
      const msg = String((failure as Error)?.message ?? "");
      setError(
        msg.includes("soul_too_long")
          ? `Keep Soul under ${settings?.soul_max_chars ?? 1_600} characters.`
          : "That didn't save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const maxChars = settings?.soul_max_chars ?? 1_600;
  const soulDirty = Boolean(settings && soulDraft.trim() !== settings.soul_md.trim());

  return (
    <>
      <SettingsGroup label="Your default Soul">
        <SettingsRow
          label="How should your guide work with you?"
          htmlFor="personal-global-soul"
          stacked
          help={
            error ? (
              <span className="settings-v1-error" role="alert">{error}</span>
            ) : (
              "Applies across every community you join unless you customize your Soul inside a specific community's chat. Your memories stay separate inside each community."
            )
          }
        >
          <textarea
            id="personal-global-soul"
            className="settings-v1-input"
            rows={7}
            maxLength={maxChars}
            value={soulDraft}
            disabled={!settings || busy}
            onChange={(event) => {
              setSoulDraft(event.target.value);
              setSavedSoul(false);
            }}
          />
        </SettingsRow>
        <SettingsRow
          label=""
          help={
            <span role="status">
              {!settings
                ? "Loading…"
                : savedSoul && !soulDirty
                  ? "Saved across all your communities."
                  : `${soulDraft.length}/${maxChars} characters.`}
            </span>
          }
        >
          {settings && !settings.soul_is_default ? (
            <SettingsButton disabled={busy} onClick={() => void update({ soulMd: null })}>
              Reset
            </SettingsButton>
          ) : null}
          <SettingsButton
            variant="primary"
            disabled={!settings || busy || !soulDraft.trim() || !soulDirty}
            onClick={() => void update({ soulMd: soulDraft })}
          >
            {busy ? "Saving…" : "Save Soul"}
          </SettingsButton>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup label="What your guide does for you">
        <SettingsRow
          label={GUIDE_ALLOWED_POST_LABEL}
          help={`${GUIDE_ALLOWED_POST_HELP} Applies across every community.`}
        >
          <SettingsSwitch
            label={GUIDE_ALLOWED_POST_LABEL}
            checked={Boolean(settings?.allow_post)}
            disabled={!settings || busy}
            onChange={(checked) => void update({ allowPost: checked })}
          />
        </SettingsRow>
        <SettingsRow
          label={GUIDE_ALLOWED_MESSAGE_LABEL}
          help={`${GUIDE_ALLOWED_MESSAGE_HELP} Applies across every community.`}
        >
          <SettingsSwitch
            label={GUIDE_ALLOWED_MESSAGE_LABEL}
            checked={Boolean(settings?.allow_message)}
            disabled={!settings || busy}
            onChange={(checked) => void update({ allowMessage: checked })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup label="Proactive check-ins">
        <SettingsRow
          label="Pause guide check-ins everywhere"
          help="Stop community guides from starting unsolicited private check-in messages with you across all communities. You can still message any guide anytime."
        >
          <SettingsSwitch
            label="Pause guide check-ins everywhere"
            checked={Boolean(settings?.coach_muted)}
            disabled={!settings || busy}
            onChange={(checked) => void update({ coachMuted: checked })}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
