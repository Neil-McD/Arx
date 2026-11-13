// The owner's daily brief: each morning the community agent sums up the last
// day (new people, unanswered posts, quiet newcomers, what's coming up) in the
// owner's agent conversation and by email. Only the owner sees this switch.
import { useEffect, useState } from "react";

import {
  getCloudFounderBriefSettings,
  setCloudFounderBriefSettings,
  type CloudFounderBriefSettings,
} from "../../../../shared/cloudCommunityAdminGateway";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function CommunityFounderBriefSection(props: {
  communityId: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}) {
  const [settings, setSettings] = useState<CloudFounderBriefSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSettings(null);
    setError(null);
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        const loaded = session ? await getCloudFounderBriefSettings({ session, communityId: props.communityId }) : null;
        if (!cancelled) setSettings(loaded);
      } catch {
        if (!cancelled) setError("Couldn't load your brief settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communityId]);

  const save = async (next: { enabled: boolean; localHour: number }) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      setSettings(await setCloudFounderBriefSettings({
        session,
        communityId: props.communityId,
        enabled: next.enabled,
        localHour: next.localHour,
        // A brief already set keeps its time zone; a new one takes this browser's.
        timeZone: settings?.time_zone ?? browserTimeZone(),
      }));
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const enabled = Boolean(settings?.enabled);
  const localHour = settings?.local_hour ?? 8;
  return (
    <div className="settings-section community-founder-brief-section">
      <div className="settings-section-title">Daily brief</div>
      <div className="settings-section-desc">
        Each morning your agent sums up the last day: who joined, posts nobody has answered, newcomers who've gone quiet
        and what's coming up. It arrives in your agent conversation and by email, and it never messages your members.
      </div>
      <label className={`community-member-experience-option${enabled ? " is-selected" : ""}`}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!settings || saving}
          onChange={(event) => void save({ enabled: event.target.checked, localHour })}
        />
        <span>
          <strong>Send me a daily brief</strong>
          <span className="settings-section-desc">
            {settings?.time_zone ? `At ${hourLabel(localHour)}, ${settings.time_zone} time.` : `At ${hourLabel(localHour)} your time.`}
          </span>
        </span>
      </label>
      {enabled ? (
        <label className="create-community-field" style={{ marginTop: 10 }}>
          <span>Time</span>
          <select
            className="select-styled"
            value={localHour}
            disabled={saving}
            onChange={(event) => void save({ enabled: true, localHour: Number(event.target.value) })}
          >
            {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
          </select>
        </label>
      ) : null}
      {error ? <div className="settings-section-desc" role="alert">{error}</div> : null}
    </div>
  );
}
