import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type WebBlockingSetupModalProps = {
  titleId: string;
  descriptionId?: string;
  dismissible?: boolean;
  busy?: boolean;
  size?: "compact" | "wide";
  className?: string;
  onDismiss?: () => void;
  children: ReactNode;
};

function getTopmostModal(): Element | null {
  const dialogs = document.querySelectorAll(
    '[role="dialog"][aria-modal="true"]',
  );
  return dialogs.item(dialogs.length - 1);
}

/**
 * One presentation primitive for setup that must finish before the workspace
 * can be used. Product state and completion authority remain with the child.
 */
export function WebBlockingSetupModal(props: WebBlockingSetupModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dismissibleRef = useRef(Boolean(props.dismissible));
  const busyRef = useRef(Boolean(props.busy));
  const onDismissRef = useRef(props.onDismiss);
  dismissibleRef.current = Boolean(props.dismissible);
  busyRef.current = Boolean(props.busy);
  onDismissRef.current = props.onDismiss;

  useEffect(() => {
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousBodyOverflow = document.body.style.overflow;
    const appRoot = document.getElementById("root");
    const rootWasInert = appRoot?.inert ?? false;

    document.body.style.overflow = "hidden";
    if (appRoot) appRoot.inert = true;

    const focusFrame = window.requestAnimationFrame(() => {
      const autoFocusTarget =
        dialogRef.current?.querySelector<HTMLElement>("[autofocus]");
      const firstFocusable =
        dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (autoFocusTarget ?? firstFocusable ?? dialogRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || getTopmostModal() !== dialog) return;

      if (event.key === "Escape") {
        if (!dismissibleRef.current || busyRef.current) return;
        event.preventDefault();
        onDismissRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeElement = document.activeElement;
      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (appRoot) appRoot.inert = rootWasInert;
      previousActiveElement?.focus();
    };
  }, []);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.target !== event.currentTarget ||
      !props.dismissible ||
      props.busy
    )
      return;
    props.onDismiss?.();
  };

  return createPortal(
    <div
      className="blocking-setup-overlay"
      role="presentation"
      onMouseDown={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={`blocking-setup-modal blocking-setup-modal--${props.size ?? "compact"}${props.className ? ` ${props.className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.titleId}
        aria-describedby={props.descriptionId}
        aria-busy={props.busy || undefined}
        tabIndex={-1}
      >
        {props.children}
      </div>
    </div>,
    document.body,
  );
}
