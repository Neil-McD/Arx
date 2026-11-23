// Design system v1: the right column beside a channel. A channel is where
// the conversation is read as it was said, so the panel carries no summary
// (Neil, Nov 15): what the channel is for, its pinned post, and who is here.
// The pinned post lives here on a wide window, not at the top of the feed;
// where there is no right column (a narrow window, a phone) the feed keeps it.
// Notes are the guide's memory, kept by builders in Knowledge, not listed here.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Pin } from "lucide-react";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { getAvatarColor, getInitials } from "../../../../shared/chatUi";
import { ChatBlockMarkdown } from "../../../../shared/chatBlockMarkdownUi";
import { renderChatInlineMarkdown } from "../../../../shared/chatInlineMarkdownUi";
import { KitApp, Rail, cx } from "./kit";
import { learnedWhen } from "./KitBrain";
import { PanelAction, PanelPart } from "./KitPanel";

export type ChannelPinned = {
  // Who posted it, when, and how it starts.
  author: string;
  at: string | null;
  title: string | null;
  excerpt: string;
  // Formatted post preview matching the feed (falls back to rendering excerpt as markdown).
  body?: ReactNode;
  onOpen: () => void;
  // The people who run the channel can take the pin off.
  onUnpin?: () => void;
  unpinning?: boolean;
};

// A host changing the description in the channel's menu tells the panel,
// which otherwise shows what the page was loaded with.
const DESCRIPTION_EVENT = "polynet:channel-description";
export function announceChannelDescription(channelId: string, description: string): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DESCRIPTION_EVENT, { detail: { channelId, description } }));
}

// Hears that change; returns how to stop listening.
export function onChannelDescription(listener: (change: { channelId: string; description: string }) => void): () => void {
  const onChange = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.channelId) listener(detail); };
  window.addEventListener(DESCRIPTION_EVENT, onChange);
  return () => window.removeEventListener(DESCRIPTION_EVENT, onChange);
}

export function KitChannelRail(props: {
  communityId: string | null;
  session: unknown;
  channelId?: string | null;
  description?: string | null;
  pinned?: ChannelPinned | null;
  presenceSummary?: CommunityPresenceSummary | null;
  onOpenMembers?: () => void;
  onOpenKnowledge?: () => void;
}) {
  const summary = props.presenceSummary;
  const faces = (summary?.online_faces ?? []).slice(0, 5);
  const hereNow = summary?.online_count;
  const members = summary?.member_count;
  const [now] = useState(() => Date.now());
  // The page hands in the description as it stands (it hears a host's change too).
  const description = (props.description ?? "").trim();
  const { pinned } = props;
  const pinnedBodyRef = useRef<HTMLDivElement | null>(null);
  const [pinnedOverflow, setPinnedOverflow] = useState(false);

  const pinnedContent: ReactNode = pinned
    ? (pinned.body ??
      (pinned.excerpt ? (
        <div className="community-interaction-body community-interaction-chat-markdown">
          <ChatBlockMarkdown
            text={pinned.excerpt}
            renderInline={(segment) => renderChatInlineMarkdown(segment, { allowLabeledLinks: true })}
          />
        </div>
      ) : null))
    : null;

  useLayoutEffect(() => {
    const el = pinnedBodyRef.current;
    if (!el) {
      setPinnedOverflow(false);
      return;
    }
    el.setAttribute("inert", "");
    const measure = () => {
      const next = el.scrollHeight > el.clientHeight + 1;
      setPinnedOverflow((current) => (current === next ? current : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pinned?.excerpt, pinned?.body]);

  return (
    <KitApp view="wins" part="rail" className={pinned ? "kit-channel-rail has-pinned" : "kit-channel-rail"}>
      <Rail index={1} label="About this channel">
        {description ? (
          <PanelPart label="About"><p className={cx("chabout")}>{description}</p></PanelPart>
        ) : null}
        {pinned ? (
          <PanelPart label="Pinned" action={pinned.onUnpin ? <PanelAction disabled={pinned.unpinning} onClick={pinned.onUnpin}>{pinned.unpinning ? "Unpinning…" : "Unpin"}</PanelAction> : null}>
            <div className={cx("chpin")}>
              <button
                type="button"
                className={cx("chpin-hit")}
                onClick={pinned.onOpen}
                aria-label={`Open the pinned post by ${pinned.author}`}
              />
              <span className={cx("chpin-by")} aria-hidden="true"><Pin size={13} aria-hidden="true" /><b>{pinned.author}</b>{pinned.at ? <em>{learnedWhen(pinned.at, now)}</em> : null}</span>
              {pinned.title ? <strong className={cx("chpin-title")} aria-hidden="true">{pinned.title}</strong> : null}
              {pinnedContent ? (
                <div ref={pinnedBodyRef} className={cx("chpin-body", pinnedOverflow && "over")} aria-hidden="true">
                  {pinnedContent}
                </div>
              ) : null}
            </div>
          </PanelPart>
        ) : null}
        <PanelPart label="Here" fact={typeof members === "number" && members > 0 ? `${members} ${members === 1 ? "member" : "members"}` : null}
          action={props.onOpenMembers ? <PanelAction onClick={props.onOpenMembers}>Everyone</PanelAction> : null}>
          <div className={cx("ln")}>
            {faces.length ? (
              <span className={cx("stack")}>
                {faces.map((face) => {
                  const name = String(face.display_name ?? "Member");
                  return (
                    <span key={face.user_id} className={cx("av s")} title={name}>
                      <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={name} imageUrl={face.avatar_url} alt=""
                        fallback={<span>{getInitials(name)}</span>} fallbackStyle={{ backgroundColor: getAvatarColor(face.user_id) }} />
                    </span>
                  );
                })}
              </span>
            ) : null}
            <span className={cx("t")}>{typeof hereNow === "number" ? `${hereNow}${summary?.online_count_capped ? "+" : ""} here now` : "Nobody here right now"}</span>
          </div>
        </PanelPart>
      </Rail>
    </KitApp>
  );
}
