import { SmilePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Quick-react set shown inline; full picker set in the popover. Shared so the feed and the
// workspace right panel render identical reaction controls.
export const QUICK_REACTIONS = ["👍", "❤️", "🔥"];
export const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "👀", "🙏", "🚀", "💯", "✅", "👏", "😮"];

export function EmojiPickerButton(props: {
  className: string;
  label: string;
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="community-interaction-emoji-picker" ref={ref}>
      <button
        type="button"
        className={props.className}
        aria-label={props.label}
        title={props.label}
        onClick={() => setOpen((value) => !value)}
      >
        <SmilePlus size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="community-interaction-emoji-popover" role="menu">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="community-interaction-emoji-option"
              onClick={() => {
                props.onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ReactionSummary(props: {
  rows: Array<{ emoji: string; count: number }>;
  viewerEmojis?: string[];
  onToggle?: (emoji: string) => void;
}) {
  if (props.rows.length === 0) return null;
  const viewer = new Set(props.viewerEmojis ?? []);
  return (
    <div className="community-interaction-reactions" aria-label="Reactions">
      {props.rows.map((row) => {
        const reactedByViewer = viewer.has(row.emoji);
        return (
          <button
            key={row.emoji}
            type="button"
            className={`community-interaction-reaction${reactedByViewer ? " is-mine" : ""}`}
            onClick={() => props.onToggle?.(row.emoji)}
            disabled={!props.onToggle}
            aria-pressed={reactedByViewer}
            aria-label={`${row.emoji} reaction, ${row.count} ${row.count === 1 ? "reaction" : "reactions"}${reactedByViewer ? ", reacted by you" : ""}`}
          >
            <span>{row.emoji}</span>
            <span>{row.count}</span>
          </button>
        );
      })}
    </div>
  );
}

// The thread/reply affordance — same markup/classes as the feed's reply pill so it reads identically.
export function ThreadReplyPill(props: {
  replyCount: number;
  lastReplyLabel?: string | null;
  unread?: boolean;
  onOpen: () => void;
}) {
  if (props.replyCount <= 0) return null;
  return (
    <div className="community-interaction-thread-row">
      <button
        type="button"
        className={`community-interaction-reply-pill${props.unread ? " is-unread" : ""}`}
        onClick={props.onOpen}
      >
        {props.unread ? <span className="community-interaction-unread-dot" aria-hidden="true" /> : null}
        {props.replyCount === 1 ? "1 reply" : `${props.replyCount} replies`}
      </button>
      {props.lastReplyLabel ? (
        <span className="community-interaction-thread-time">Last reply {props.lastReplyLabel}</span>
      ) : null}
    </div>
  );
}
