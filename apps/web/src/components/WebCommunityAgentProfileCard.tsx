import { ImageUp, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { announceCommunityAgentProfile } from "../../../../shared/CommunityAgentIcon";
import { useCommunityVisualIdentity } from "../../../../shared/CommunityVisualIdentityRegistry";
import {
  fetchCloudCommunityAgentProfile,
  saveCloudCommunityAgentProfile,
  type CloudCommunityAgentProfile,
} from "../../../../shared/cloudCommunityAgentGateway";

// Settings > Agent > Profile: the name and photo members see on every agent
// message, mention and the Ask AI button. Empty name = the community's name;
// no photo = the community's icon. Saves as you go, like General. Agents use
// community.agent.profile.save.
export function WebCommunityAgentProfileCard(props: {
  session: unknown;
  communityId: string;
  communityName: string;
}) {
  const identity = useCommunityVisualIdentity(props.communityId);
  const [profile, setProfile] = useState<CloudCommunityAgentProfile | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    fetchCloudCommunityAgentProfile(props.communityId)
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded);
        setNameDraft(loaded?.custom_name ?? "");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [props.communityId]);

  const save = async (change: { displayName?: string | null; photo?: File | null }) => {
    setStatus("saving");
    setError(null);
    try {
      const saved = await saveCloudCommunityAgentProfile(props.session, props.communityId, change);
      setProfile(saved);
      if (change.displayName !== undefined) setNameDraft(saved?.custom_name ?? "");
      announceCommunityAgentProfile(saved);
      setStatus("saved");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message.includes("name_too_long") ? "Keep the name to 60 characters." : "Couldn't save. Try again.");
      setStatus("error");
    }
  };

  const commitName = () => {
    const next = nameDraft.replace(/\s+/g, " ").trim();
    if (next === (profile?.custom_name ?? "")) return;
    void save({ displayName: next || null });
  };

  const photoUrl = profile?.avatar_url ?? null;
  const communityIcon = identity?.avatar.url ?? profile?.community_avatar_url ?? null;

  return (
    <section className="settings-section pn-settings-card pn-agent-profile" aria-labelledby="agent-profile-title">
      <header className="pn-settings-card-header">
        <h2 className="settings-section-title" id="agent-profile-title">Profile</h2>
        <p className="settings-section-desc">How the agent appears to members: on its messages, in mentions and on the Ask AI button.</p>
      </header>
      <div className="pn-settings-card-body">
        <div className="pn-settings-row">
          <div className="pn-settings-row-head">
            <div className="pn-settings-row-text">
              <span className="pn-settings-label">Photo</span>
              <span className="pn-settings-help">
                {photoUrl ? "Square works best. Click it to replace." : "Uses your community's icon until you add one."}
              </span>
            </div>
            <div className="pn-settings-row-control">
              <div className="pn-settings-logo">
                <label className="pn-settings-thumb is-logo is-agent-photo">
                  {photoUrl ? (
                    <img className="pn-settings-thumb-media" src={photoUrl} alt="" />
                  ) : identity?.avatar.url ? (
                    <CommunityAvatar className="pn-settings-thumb-media" communityId={props.communityId} name={props.communityName} alt="" />
                  ) : communityIcon ? (
                    <img className="pn-settings-thumb-media" src={communityIcon} alt="" />
                  ) : (
                    <span className="pn-settings-thumb-media pn-agent-profile-sparkles"><Sparkles size={22} strokeWidth={1.75} aria-hidden="true" /></span>
                  )}
                  <span className="pn-settings-thumb-overlay"><ImageUp size={16} strokeWidth={2} aria-hidden="true" /></span>
                  <input
                    type="file"
                    accept="image/*"
                    aria-label={photoUrl ? "Replace the agent's photo" : "Upload a photo for the agent"}
                    disabled={status === "saving"}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      if (file) void save({ photo: file });
                    }}
                  />
                </label>
                {photoUrl ? (
                  <div className="pn-settings-thumb-actions">
                    <button className="pn-settings-button" type="button" disabled={status === "saving"} onClick={() => void save({ photo: null })}>
                      Use community icon
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="pn-settings-row">
          <div className="pn-settings-row-head">
            <div className="pn-settings-row-text">
              <label className="pn-settings-label" htmlFor="agent-profile-name">Name</label>
              <span className="pn-settings-help">Leave it empty to use your community's name.</span>
            </div>
          </div>
          <div className="pn-settings-row-field">
            <input
              id="agent-profile-name"
              className="pn-settings-input"
              value={nameDraft}
              maxLength={60}
              placeholder={props.communityName || "Community agent"}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
            />
          </div>
        </div>
        {status === "saving" || status === "saved" ? (
          <span className={`pn-settings-save-pill is-${status}`} role="status" aria-live="polite">
            <span className="pn-settings-save-dot" aria-hidden="true" />
            {status === "saving" ? "Saving…" : "Saved"}
          </span>
        ) : null}
        {error ? <span className="pn-settings-inline-error" role="alert">{error}</span> : null}
      </div>
    </section>
  );
}
