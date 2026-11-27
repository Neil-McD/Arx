// The owner's daily brief: each morning the community agent sums up the last
// day (new people, unanswered posts, quiet newcomers, what's coming up) in the
// owner's agent conversation and by email. Only the owner sees this switch.
import { useEffect, useState } from "react";

import {
  getCloudFounderBriefSettings,
  setCloudFounderBriefSettings,
  type CloudFounderBriefSettings,
} from "../../../../shared/cloudCommunityAdminGateway";
import type { FounderPlanTier } from "../../../../shared/founderPlan";
import { SettingsButton, SettingsGroup, SettingsRow, SettingsSelect, SettingsSwitch } from "./SettingsRows";

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
  planTier?: FounderPlanTier | null;
  isUpgradingPlan?: boolean;
  onUpgradeToChiefOfStaff?: () => void;
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
  }, [props.communityId, props.planTier]);

  const save = async (next: { localHour: number; emailEnabled: boolean }) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      setSettings(await setCloudFounderBriefSettings({
        session,
        communityId: props.communityId,
        enabled: true,
        emailEnabled: next.emailEnabled,
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

  if (props.planTier === "guide") {
    return (
      <SettingsGroup label="Morning brief">
        <SettingsRow
          label="Daily founder brief"
          help="Included on Chief of Staff ($100/month with 20,000 AI credits included). Each morning on Home, in your guide chat, and optionally by email: what needs you, what your guide handled, and key member signals."
        >
          {props.onUpgradeToChiefOfStaff ? (
            <SettingsButton
              variant="primary"
              disabled={props.isUpgradingPlan}
              onClick={props.onUpgradeToChiefOfStaff}
            >
              {props.isUpgradingPlan ? "Upgrading…" : "Upgrade to Chief of Staff"}
            </SettingsButton>
          ) : (
            <span className="settings-v1-value">Chief of Staff</span>
          )}
        </SettingsRow>
      </SettingsGroup>
    );
  }

  const emailEnabled = settings ? settings.email_enabled : true;
  const localHour = settings?.local_hour ?? 8;
  return (
    <SettingsGroup label="Morning brief">
      <SettingsRow
        label="Morning brief time"
        htmlFor="brief-hour"
        help={
          error ? (
            <span className="settings-v1-error" role="alert">{error}</span>
          ) : (
            `Always on for Chief of Staff — appears on Home and in your guide chat each morning (${settings?.time_zone ? `${settings.time_zone} time` : "your local time"}).`
          )
        }
      >
        <SettingsSelect
          id="brief-hour"
          value={localHour}
          disabled={!settings || saving}
          onChange={(event) => void save({ localHour: Number(event.target.value), emailEnabled })}
        >
          {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
        </SettingsSelect>
      </SettingsRow>
      <SettingsRow
        label="Also send by email"
        help="Get a morning copy in your inbox in addition to Home and your guide chat."
      >
        <SettingsSwitch
          label="Also send by email"
          checked={emailEnabled}
          disabled={!settings || saving}
          onChange={(checked) => void save({ localHour, emailEnabled: checked })}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
