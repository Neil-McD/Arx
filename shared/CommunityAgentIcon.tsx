import { Sparkles } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CommunityAvatar } from "./CommunityAvatar";
import { useCommunityVisualIdentity } from "./CommunityVisualIdentityRegistry";
import { fetchCloudCommunityAgentProfile, type CloudCommunityAgentProfile } from "./cloudCommunityAgentGateway";

// The community agent's face and name: the owner can set
// both in Settings > Agent. With no photo it wears its community's icon, and
// with no icon the Sparkles; with no name it goes by the community's name.
// Chat messages, mentions, the Ask AI button and the agent panel all read it
// from here.
type AgentCommunityValue = { communityId: string | null; profile: CloudCommunityAgentProfile | null };

const AgentCommunityContext = createContext<AgentCommunityValue>({ communityId: null, profile: null });

const PROFILE_SAVED_EVENT = "polynet:community-agent-profile";

/** Call after a save so every agent face and name updates without a reload. */
export function announceCommunityAgentProfile(profile: CloudCommunityAgentProfile | null) {
  if (profile && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROFILE_SAVED_EVENT, { detail: profile }));
  }
}

export function AgentCommunityProvider(props: { communityId: string | null; children: ReactNode }) {
  const [profile, setProfile] = useState<CloudCommunityAgentProfile | null>(null);
  useEffect(() => {
    setProfile(null);
    if (!props.communityId) return;
    let cancelled = false;
    fetchCloudCommunityAgentProfile(props.communityId)
      .then((loaded) => { if (!cancelled) setProfile(loaded); })
      .catch(() => {});
    const onSaved = (event: Event) => {
      const saved = (event as CustomEvent<CloudCommunityAgentProfile>).detail;
      if (saved?.community_id === props.communityId) setProfile(saved);
    };
    window.addEventListener(PROFILE_SAVED_EVENT, onSaved);
    return () => { cancelled = true; window.removeEventListener(PROFILE_SAVED_EVENT, onSaved); };
  }, [props.communityId]);
  return (
    <AgentCommunityContext.Provider value={{ communityId: props.communityId, profile }}>
      {props.children}
    </AgentCommunityContext.Provider>
  );
}

export function useCommunityAgentProfile(): CloudCommunityAgentProfile | null {
  return useContext(AgentCommunityContext).profile;
}

/** The owner's name for the agent, else `fallback` (usually the community's name). */
export function useCommunityAgentName(fallback: string | null | undefined): string {
  const profile = useContext(AgentCommunityContext).profile;
  return profile?.custom_name || String(fallback ?? "").trim() || profile?.name || "";
}

export function CommunityAgentIcon(props: { size?: number; strokeWidth?: number; communityId?: string | null }) {
  const context = useContext(AgentCommunityContext);
  const communityId = props.communityId ?? context.communityId;
  const identity = useCommunityVisualIdentity(communityId);
  const style = props.size ? { width: props.size, height: props.size } : undefined;
  const profile = communityId === context.communityId ? context.profile : null;
  // The owner's photo; else the community's icon (the profile carries its URL
  // for screens where the icon registry hasn't loaded this community yet).
  const photo = profile?.avatar_url || (identity?.avatar.url ? null : profile?.community_avatar_url) || null;
  if (photo) {
    return <img className="community-agent-face community-agent-photo" src={photo} style={style} alt="" aria-hidden="true" />;
  }
  if (!communityId || !identity?.avatar.url) {
    return <Sparkles size={props.size} strokeWidth={props.strokeWidth} aria-hidden="true" />;
  }
  return <CommunityAvatar communityId={communityId} name={identity.name} className="community-agent-face"
    style={style} alt="" aria-hidden={true} />;
}
