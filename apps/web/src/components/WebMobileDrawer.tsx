import type { ReactNode } from "react";

type WebMobileDrawerProps = {
  isOpen: boolean;
  ariaLabel: string;
  title?: string;
  side?: "left" | "right";
  className?: string;
  hideHeader?: boolean;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

export function WebMobileDrawer({
  isOpen,
  ariaLabel,
  title,
  side = "left",
  className,
  hideHeader = false,
  footer,
  onClose,
  children,
}: WebMobileDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="mobile-drawer-shell" aria-hidden={!isOpen}>
      <button
        type="button"
        className="mobile-drawer-backdrop"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className={`mobile-drawer mobile-drawer-${side}${hideHeader ? " mobile-drawer-no-header" : ""}${className ? ` ${className}` : ""}`}
        aria-label={ariaLabel}
      >
        {!hideHeader ? (
          <div className="mobile-drawer-header">
            <div className="mobile-drawer-title">{title ?? ariaLabel}</div>
            <button type="button" className="mobile-drawer-close" aria-label="Close panel" onClick={onClose}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="mobile-drawer-body">{children}</div>
        {footer ? <div className="mobile-drawer-footer">{footer}</div> : null}
      </aside>
    </div>
  );
}
