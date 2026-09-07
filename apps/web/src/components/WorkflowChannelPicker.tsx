import { Check, ChevronDown, Hash, LockKeyhole } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { workflowChannelLabel } from "./workflowMilestoneDraft";

type Props = {
  channels: CloudCommunityChannel[];
  channelId?: string;
  unavailable: boolean;
  disabled: boolean;
  label: string;
  emptyLabel?: string;
  onChange: (channelId: string | undefined) => void;
};

// A single community-channel selection, not a new integration or permission surface.
// The popup stays inside the dialog, reusing its focus boundary and menu styles.
export function WorkflowChannelPicker(props: Props) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<CSSProperties>({ top: "calc(100% + 6px)", maxHeight: 224 });
  const disabled = props.disabled || props.unavailable;
  const options = [
    { value: undefined, label: props.emptyLabel ?? "Any channel", private: false },
    ...props.channels.map((channel) => ({ value: channel.id, label: `#${channel.name}`, private: channel.access_mode === "restricted" })),
  ];
  const selectedIndex = options.findIndex((option) => option.value === props.channelId);
  const selectedChannel = props.channels.find((channel) => channel.id === props.channelId);
  const selectedLabel = props.channelId === undefined && props.emptyLabel
    ? props.emptyLabel : workflowChannelLabel(props.channelId, props.channels, props.unavailable);
  const active = Math.min(activeIndex, options.length - 1);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const show = () => {
    if (disabled) return;
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  };
  const choose = (index: number) => {
    if (disabled || !options[index]) return;
    props.onChange(options[index].value);
    close();
  };

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const bounds = trigger.closest(".modal-body")?.getBoundingClientRect();
      const rect = trigger.getBoundingClientRect();
      const above = rect.top - Math.max(0, bounds?.top ?? 0);
      const below = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight) - rect.bottom;
      const upwards = below < Math.min(224, options.length * 44 + 12) && above > below;
      setPlacement({
        ...(upwards ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }),
        maxHeight: Math.max(40, Math.min(224, (upwards ? above : below) - 8)),
      });
    };
    position();
    listRef.current?.focus({ preventScroll: true });
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      // Return to the trigger before the browser advances to the next field.
      close();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const start = active + 1;
      const match = options.map((_, offset) => (start + offset) % options.length)
        .find((index) => options[index].label.replace(/^#/, "").toLowerCase().startsWith(event.key.toLowerCase()));
      if (match !== undefined) {
        event.preventDefault();
        setActiveIndex(match);
      }
    }
  };

  return (
    <div className="workflow-channel-picker" ref={rootRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button ref={triggerRef} type="button" className="workflow-channel-trigger" data-workflow-rule-start
        disabled={disabled} aria-label={`${props.label}: ${selectedLabel}`}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => open ? close() : show()} onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); }
        }}>
        {selectedChannel?.access_mode === "restricted" ? <LockKeyhole size={16} aria-hidden="true" /> : <Hash size={16} aria-hidden="true" />}
        <span>{selectedLabel}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && !disabled ? (
        <ul ref={listRef} id={id} role="listbox" tabIndex={-1} aria-label={props.label}
          aria-activedescendant={`${id}-${active}`} className="web-floating-menu workflow-channel-options"
          style={placement} onKeyDown={onListKeyDown}>
          {options.map((option, index) => (
            <li key={option.value ?? "any"} id={`${id}-${index}`} role="option"
              aria-label={`${option.label}${option.private ? " (private)" : ""}`}
              aria-selected={option.value === props.channelId} data-active={active === index}
              className="web-floating-menu-item workflow-channel-option"
              onPointerMove={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
              {option.private ? <LockKeyhole aria-hidden="true" /> : <Hash aria-hidden="true" />}
              <span>{option.label}</span>
              {option.value === props.channelId ? <Check aria-hidden="true" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
