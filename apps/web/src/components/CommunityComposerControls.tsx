import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
  Bold,
  Code2,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  Plus,
  Quote,
  SmilePlus,
  Strikethrough,
} from "lucide-react";
import { QUICK_EMOJIS } from "./communityInteractionRowParts";

export type CommunityComposerFormattingAction =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "link"
  | "bullet"
  | "ordered"
  | "quote"
  | "indent"
  | "outdent";

type CommunityComposerControlsProps = {
  contextKey: string;
  groupLabel: string;
  attachLabel: string;
  mentionLabel: string;
  mentionMenuId: string;
  mentionMenuOpen: boolean;
  toolsDisabled: boolean;
  attachDisabled: boolean;
  formattingDisabled?: boolean;
  onAttach: () => void;
  onMention: () => void;
  onEmoji: (emoji: string) => void;
  onFormat: (action: CommunityComposerFormattingAction) => void;
  voiceControl: ReactNode;
  sendControl: ReactNode;
};

const FORMATTING_ACTIONS: Array<{
  action: CommunityComposerFormattingAction;
  label: string;
  icon: ReactNode;
}> = [
  { action: "bold", label: "Bold", icon: <Bold size={16} aria-hidden="true" /> },
  { action: "italic", label: "Italic", icon: <Italic size={16} aria-hidden="true" /> },
  { action: "strike", label: "Strikethrough", icon: <Strikethrough size={16} aria-hidden="true" /> },
  { action: "code", label: "Inline code", icon: <Code2 size={16} aria-hidden="true" /> },
  { action: "link", label: "Add link", icon: <Link size={16} aria-hidden="true" /> },
  { action: "bullet", label: "Bulleted list", icon: <List size={16} aria-hidden="true" /> },
  { action: "ordered", label: "Numbered list", icon: <ListOrdered size={16} aria-hidden="true" /> },
  { action: "quote", label: "Blockquote", icon: <Quote size={16} aria-hidden="true" /> },
  { action: "outdent", label: "Outdent list", icon: <IndentDecrease size={16} aria-hidden="true" /> },
  { action: "indent", label: "Indent list", icon: <IndentIncrease size={16} aria-hidden="true" /> },
];

export function CommunityComposerControls(props: CommunityComposerControlsProps) {
  const [formattingOpen, setFormattingOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const formattingRailId = useId();

  useEffect(() => {
    setFormattingOpen(false);
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
    <>
      {formattingOpen ? (
        <div
          className="community-composer-formatting-rail"
          id={formattingRailId}
          role="toolbar"
          aria-label="Message formatting"
        >
          {FORMATTING_ACTIONS.map(({ action, label, icon }) => (
            <button
              key={action}
              type="button"
              className="community-composer-format-btn"
              aria-label={label}
              title={label}
              disabled={props.toolsDisabled || props.formattingDisabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.onFormat(action)}
            >
              {icon}
            </button>
          ))}
        </div>
      ) : null}

      <div className="community-composer-toolbar">
        <div className="community-composer-tools" role="group" aria-label={props.groupLabel}>
          <button
            className="ask-icon-btn community-composer-add"
            type="button"
            onClick={props.onAttach}
            disabled={props.attachDisabled}
            aria-label={props.attachLabel}
            title={props.attachLabel}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
          <button
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
            <span className="community-composer-mention-glyph" aria-hidden="true">@</span>
          </button>
          <div className="community-composer-emoji-picker" ref={emojiPickerRef}>
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
              <SmilePlus size={17} aria-hidden="true" />
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
                      props.onEmoji(emoji);
                      setEmojiOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            className={`ask-icon-btn community-composer-format-toggle${formattingOpen ? " is-active" : ""}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setFormattingOpen((open) => !open)}
            disabled={props.toolsDisabled || props.formattingDisabled}
            aria-label="Formatting options"
            aria-expanded={formattingOpen}
            aria-controls={formattingRailId}
            title="Formatting options"
          >
            <span aria-hidden="true">Aa</span>
          </button>
        </div>
        <div className="community-composer-submit-tools" role="group" aria-label="Voice and send">
          {props.voiceControl}
          {props.sendControl}
        </div>
      </div>
    </>
  );
}
