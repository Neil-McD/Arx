import { SmilePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ReactorsHover } from "./CommunityPostCard";

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
  /** The post or reply, so hovering a reaction can show who reacted. */
  target?: { type: "root" | "reply"; id: string };
  /** Channels list names on hover; Classroom shows pictures and names. */
  whoVariant?: "names" | "faces";
}) {
  if (props.rows.length === 0) return null;
  const viewer = new Set(props.viewerEmojis ?? []);
  const signature = props.rows.map((row) => `${row.emoji}${row.count}`).join(",");
  return (
    <div className="community-interaction-reactions" aria-label="Reactions">
      {props.rows.map((row) => {
        const reactedByViewer = viewer.has(row.emoji);
        return (
          <ReactorsHover key={row.emoji} target={props.target ?? null} emoji={row.emoji} count={row.count}
            signature={signature} variant={props.whoVariant ?? "names"}>
          <button
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
          </ReactorsHover>
        );
      })}
    </div>
  );
}
