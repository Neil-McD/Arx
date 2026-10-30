import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AtSign, Smile } from "lucide-react";
import { QUICK_EMOJIS } from "./communityInteractionRowParts";
import { ComposerAddMenu } from "./CommunityPostCard";

type CommunityComposerControlsProps = {
  contextKey: string;
  groupLabel: string;
  attachLabel: string;
  mentionLabel?: string;
  mentionMenuId?: string;
  mentionMenuOpen?: boolean;
  toolsDisabled: boolean;
  attachDisabled: boolean;
  onAttach: () => void;
  /** The "+" also starts a poll, and for the community's team shares a Form. */
  onPoll?: () => void;
  onForm?: () => void;
  onMention?: () => void;
  onEmoji?: (emoji: string) => void;
  voiceControl: ReactNode;
  sendControl: ReactNode;
};

export function CommunityComposerControls(props: CommunityComposerControlsProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEmojiOpen(false);
  }, [props.contextKey]);

  useEffect(() => {
    if (!emojiOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setEmojiOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [emojiOpen]);

  return (
    <div className="community-composer-toolbar">
      <div className="community-composer-tools" role="group" aria-label={props.groupLabel}>
        <ComposerAddMenu
          disabled={props.toolsDisabled}
          attachDisabled={props.attachDisabled}
          attachLabel={props.attachLabel}
          onAttach={props.onAttach}
          onPoll={props.onPoll}
          onForm={props.onForm}
        />
        {props.onMention ? <button
          className="ask-icon-btn ask-mention"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={props.onMention}
          disabled={props.toolsDisabled}
          aria-label={props.mentionLabel}
          aria-haspopup="listbox"
          aria-expanded={props.mentionMenuOpen}
          aria-controls={props.mentionMenuId}
          title={props.mentionLabel}
        >
          <AtSign size={17} strokeWidth={1.8} aria-hidden="true" />
        </button> : null}
        {props.onEmoji ? <div className="community-composer-emoji-picker" ref={emojiPickerRef}>
          <button
            className={`ask-icon-btn community-composer-emoji${emojiOpen ? " is-active" : ""}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setEmojiOpen((open) => !open)}
            disabled={props.toolsDisabled}
            aria-label="Add emoji"
            aria-haspopup="menu"
            aria-expanded={emojiOpen}
            title="Add emoji"
          >
            <Smile size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {emojiOpen ? (
            <div className="community-composer-emoji-popover" role="menu" aria-label="Choose an emoji">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="community-composer-emoji-option"
                  role="menuitem"
                  aria-label={`Insert ${emoji}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    props.onEmoji?.(emoji);
                    setEmojiOpen(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div> : null}
      </div>
      <div className="community-composer-submit-tools" role="group" aria-label="Voice and send">
        {props.voiceControl}
        {props.sendControl}
      </div>
    </div>
  );
}
