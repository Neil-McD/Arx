// The owner's switch: where this community's members spend time, Polynet's app
// or the site the owner built. Joining and the public page are the site's
// either way. Admins see the choice; only the owner changes it.
import { useEffect, useState } from "react";

import { setCloudCommunityMemberExperience } from "../../../../shared/cloudCommunityAdminGateway";

type Experience = "app" | "site";

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("community_custom_site_required")) return "Deploy your site first, then you can switch to it.";
  if (message.includes("community_owner_required")) return "Only the community's owner can change this.";
  return "That didn't save. Try again.";
}

export function CommunityMemberExperienceSection(props: {
  community: { id: string; members_use?: Experience; has_custom_site?: boolean; site_url?: string | null };
  canChange: boolean;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}) {
  const [current, setCurrent] = useState<Experience>(props.community.members_use === "site" ? "site" : "app");
  const [saving, setSaving] = useState<Experience | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setCurrent(props.community.members_use === "site" ? "site" : "app");
    setError(null);
  }, [props.community.id, props.community.members_use]);

  const choose = async (next: Experience) => {
    if (!props.canChange || saving || next === current) return;
    setSaving(next);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      setCurrent(await setCloudCommunityMemberExperience({ session, communityId: props.community.id, experience: next }));
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setSaving(null);
    }
  };

  const hasSite = Boolean(props.community.has_custom_site);
  const option = (value: Experience, title: string, detail: string, disabled: boolean) => (
    <label className={`community-member-experience-option${current === value ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}>
      <input
        type="radio"
        name={`member-experience-${props.community.id}`}
        checked={current === value}
        disabled={disabled || !props.canChange || Boolean(saving)}
        onChange={() => void choose(value)}
      />
      <span>
        <strong>{title}</strong>
        <span className="settings-section-desc">{detail}</span>
      </span>
    </label>
  );

  return (
    <div className="settings-section community-member-experience-section">
      <div className="settings-section-title">Where your members spend time</div>
      <div className="settings-section-desc">
        Your public page and joining work the same either way. Switching is instant, and you can switch back anytime.
      </div>
      <div className="community-member-experience-options" role="radiogroup" aria-label="Where your members spend time">
        {option("app", "Polynet's app", "Chat, courses, events, messages and your agent, ready to go.", false)}
        {option(
          "site",
          "Your custom site",
          hasSite ? "The site you built." : "Available once you've deployed your own site.",
          !hasSite,
        )}
      </div>
      {hasSite && props.community.site_url ? (
        <a className="settings-section-desc" href={props.community.site_url} target="_blank" rel="noreferrer">Preview your site</a>
      ) : null}
      {!props.canChange ? <div className="settings-section-desc">Only the owner can change this.</div> : null}
      {saving ? <div className="settings-section-desc">Saving…</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}
    </div>
  );
}
