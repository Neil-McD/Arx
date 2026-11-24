// Owner-only Settings -> Guide controls for Proactive Member Coach
// (docs/specs/proactive-community-agent-v0.md, slice 1). Loaded on demand for
// community owners only so members never download it.
import { useEffect, useState } from "react";
import {
  MEMBER_COACH_REASONS,
  MEMBER_COACH_REASON_LABELS,
  type MemberCoachReason,
  type MemberCoachSettingsView,
} from "../../../../shared/communityMemberCoachTypes";
import {
  getCloudMemberCoachSettings,
  setCloudMemberCoachSettings,
} from "../../../../shared/cloudCommunityMemberCoachGateway";
import { SettingsGroup, SettingsRow, SettingsSwitch } from "./SettingsRows";

export function CommunityMemberCoachSettingsSection(props: {
  communityId: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}) {
  const [settings, setSettings] = useState<MemberCoachSettingsView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSettings(null);
    setError(null);
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        const loaded = session ? await getCloudMemberCoachSettings({ session, communityId: props.communityId }) : null;
        if (!cancelled) setSettings(loaded);
      } catch {
        if (!cancelled) setError("Couldn't load member check-in settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communityId]);

  const save = async (next: { enabled: boolean; autoReasons: MemberCoachReason[]; autoReplyEnabled: boolean }) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      setSettings(
        await setCloudMemberCoachSettings({
          session,
          communityId: props.communityId,
          enabled: next.enabled,
          autoReasons: next.autoReasons,
          autoReplyEnabled: next.autoReplyEnabled,
        }),
      );
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const enabled = settings ? settings.enabled : true;
  const autoReasons = settings?.auto_reasons ?? [];
  const autoReplyEnabled = Boolean(settings?.auto_reply_enabled);
  const toggleAutoReason = (reason: MemberCoachReason, checked: boolean) => {
    const next = checked
      ? [...new Set<MemberCoachReason>([...autoReasons, reason])]
      : autoReasons.filter((item) => item !== reason);
    void save({ enabled, autoReasons: next, autoReplyEnabled });
  };

  const statusNote = settings && settings.sent_this_week > 0
    ? ` ${settings.sent_this_week} sent this week.`
    : "";

  return (
    <SettingsGroup label="Proactive guide">
      <SettingsRow
        label="Auto-reply to unanswered questions"
        help={
          autoReplyEnabled
            ? "Cited replies from lessons and community or pod notes post automatically during daytime hours (up to 3 per day community-wide, 1 per pod)."
            : 'Drafts wait in "Your guide suggests" on Home until you post them. Turn on to post cited replies automatically during daytime hours.'
        }
      >
        <SettingsSwitch
          label="Auto-reply to unanswered questions"
          checked={autoReplyEnabled}
          disabled={!settings || saving}
          onChange={(checked) => void save({ enabled, autoReasons, autoReplyEnabled: checked })}
        />
      </SettingsRow>
      <SettingsRow
        label="Prepare member check-ins"
        help={
          error ? (
            <span className="settings-v1-error" role="alert">{error}</span>
          ) : (
            `Your guide spots quiet newcomers, stalled learners, and quiet members before an event, and puts private check-in drafts in "Your guide suggests" on Home. At most 2 messages per member per week, 48 hours apart, never during quiet hours or active chats.${statusNote}`
          )
        }
      >
        <SettingsSwitch
          label="Prepare member check-ins"
          checked={enabled}
          disabled={!settings || saving}
          onChange={(checked) => void save({ enabled: checked, autoReasons, autoReplyEnabled })}
        />
      </SettingsRow>
      {enabled ? (
        <>
          {MEMBER_COACH_REASONS.map((reason) => {
            const copy = MEMBER_COACH_REASON_LABELS[reason];
            const isAuto = autoReasons.includes(reason);
            return (
              <SettingsRow
                key={reason}
                label={`${copy.label} automatically`}
                help={`${copy.description} ${isAuto ? "Sends automatically during daytime hours." : "Waits for your approval on Home first."}`}
              >
                <SettingsSwitch
                  label={`${copy.label} automatically`}
                  checked={isAuto}
                  disabled={!settings || saving}
                  onChange={(checked) => toggleAutoReason(reason, checked)}
                />
              </SettingsRow>
            );
          })}
        </>
      ) : null}
    </SettingsGroup>
  );
}
