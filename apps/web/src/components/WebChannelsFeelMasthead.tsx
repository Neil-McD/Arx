import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { communityJoinUrl, useWebCommunityFrame } from "../controllers/useWebCommunityFrame";

// DRAFT EXPERIMENT: the "Publication" Channels look puts a masthead above each
// community page, the way a Substack publication heads its site: the
// community's mark and name side by side on one line, its one-liner, and one
// invite action. Chat gets the slim version: one bar as tall as the side
// column's title row, with the mark and name starting where the channel title
// below them starts, so the rows line up and the conversation keeps its height.

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}

// The full masthead heads the community's home page only; Knowledge, Events
// and the rest carry their own title row, so the content starts at the top
//. Chat keeps the slim bar wherever it sits.
export function WebChannelsFeelMasthead(props: { tab: CommunityTab; home: CommunityTab }) {
  const frame = useWebCommunityFrame();
  const [copied, setCopied] = useState(false);
  const community = frame.community;
  if (!community) return null;
  if (props.tab !== "chat" && props.tab !== props.home) return null;
  if (props.tab !== "chat" && props.tab !== "resources" && props.tab !== "events") return null;
  const joinUrl = communityJoinUrl(community.slug);
  const canInvite = frame.canInvite && joinUrl && frame.onCopyJoinLink;
  const invite = async () => {
    if (!joinUrl || !frame.onCopyJoinLink) return;
    await frame.onCopyJoinLink(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const slim = props.tab === "chat";
  return (
    <header className={`channels-feel-masthead${slim ? " is-slim" : ""}`}>
      <div className="channels-feel-masthead-inner">
        <div className="channels-feel-masthead-title">
          <UserAvatar
            className="channels-feel-masthead-mark"
            readyClassName="has-image"
            imageClassName="channels-feel-masthead-mark-image"
            fallbackClassName="channels-feel-masthead-mark-fallback"
            name={community.name}
            imageUrl={community.avatar_url}
            focusX={community.avatar_focus_x ?? 0.5}
            focusY={community.avatar_focus_y ?? 0.5}
            zoom={community.avatar_zoom ?? 1}
            fallback={<span>{initials(community.name)}</span>}
            alt=""
            aria-hidden={true}
          />
          <p className="channels-feel-masthead-name">{community.name}</p>
        </div>
        {!slim && (community.one_liner || typeof frame.memberCount === "number") ? (
          <div className="channels-feel-masthead-text">
            {community.one_liner ? <p className="channels-feel-masthead-line">{community.one_liner}</p> : null}
            {typeof frame.memberCount === "number" ? (
              <p className="channels-feel-masthead-meta">
                {frame.memberCount.toLocaleString()} {frame.memberCount === 1 ? "member" : "members"}
              </p>
            ) : null}
          </div>
        ) : null}
        {/* The slim bar shares its row with the top-right icons (messages,
            docs, settings); the side column's "Invite people" covers chat. */}
        {canInvite && !slim ? (
          <button type="button" className="channels-feel-masthead-invite" onClick={() => void invite()}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
            {copied ? "Link copied" : "Invite"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
