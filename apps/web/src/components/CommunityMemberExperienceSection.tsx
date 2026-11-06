// The owner's switch: where this community's members spend time, Polynet's app
// or the site the owner built. Joining and the public page are the site's
// either way. Admins see the choice; only the owner changes it. A change the
// owner's AI asked for waits here for the owner's Approve or Decline.
import { useEffect, useState } from "react";

import {
  decideCloudMemberExperienceRequest,
  getCloudPendingMemberExperienceRequest,
  setCloudCommunityMemberExperience,
  type CloudMemberExperienceRequest,
} from "../../../../shared/cloudCommunityAdminGateway";

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
  // Keeps Studio's copy of the community in step, so reopening Settings shows the saved choice.
  onSaved: (communityId: string, experience: Experience) => void;
}) {
  const [current, setCurrent] = useState<Experience>(props.community.members_use === "site" ? "site" : "app");
  const [saving, setSaving] = useState<Experience | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<CloudMemberExperienceRequest | null>(null);
  const [deciding, setDeciding] = useState(false);
  useEffect(() => {
    setCurrent(props.community.members_use === "site" ? "site" : "app");
    setError(null);
  }, [props.community.id, props.community.members_use]);
  // Only the owner sees (and decides) what their AI asked for.
  useEffect(() => {
    if (!props.canChange) return setRequest(null);
    let cancelled = false;
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        const waiting = session ? await getCloudPendingMemberExperienceRequest({ session, communityId: props.community.id }) : null;
        if (!cancelled) setRequest(waiting);
      } catch {
        if (!cancelled) setRequest(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.community.id, props.canChange]);

  const decide = async (decision: "approve" | "decline") => {
    if (!request || deciding) return;
    setDeciding(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      const answer = await decideCloudMemberExperienceRequest({ session, communityId: props.community.id, requestId: request.request_id, decision });
      setRequest(null);
      setCurrent(answer.members_use);
      props.onSaved(props.community.id, answer.members_use);
      if (answer.status === "expired") setError("That request expired. Ask your AI again, or use the switch below.");
      if (answer.status === "stale") setError("Members already moved since your AI asked, so nothing changed.");
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setDeciding(false);
    }
  };

  const choose = async (next: Experience) => {
    if (!props.canChange || saving || next === current) return;
    setSaving(next);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      const saved = await setCloudCommunityMemberExperience({ session, communityId: props.community.id, experience: next });
      setCurrent(saved);
      props.onSaved(props.community.id, saved);
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
      {request ? (
        <div className="community-member-experience-request" role="status">
          <div>
            Your AI asked to move your members to <strong>{request.to === "site" ? "your custom site" : "Polynet's app"}</strong>.
          </div>
          <div className="community-member-experience-request-actions">
            <button type="button" className="primary" disabled={deciding} onClick={() => void decide("approve")}>Approve</button>
            <button type="button" className="secondary" disabled={deciding} onClick={() => void decide("decline")}>Decline</button>
          </div>
        </div>
      ) : null}
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
