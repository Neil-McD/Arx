import type { ReactNode } from "react";

type MessageFooterProps = {
  children?: ReactNode;
  metaLabel?: string | null;
};

type MessageFooterActionProps = {
  onClick: () => void;
  title: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

type MessageCopyActionProps = MessageFooterActionProps & {
  copied?: boolean;
};

function MessageFooterActionButton({
  children,
  onClick,
  title,
  ariaLabel,
  disabled = false,
  className = "message-copy-btn",
}: MessageFooterActionProps & { children: ReactNode }) {
  return (
    <button
      className={className}
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function MessageFooter({ children, metaLabel }: MessageFooterProps) {
  if (!children && !metaLabel) return null;
  return (
    <div className="message-footer">
      {children}
      {metaLabel ? <span className="message-meta">{metaLabel}</span> : null}
    </div>
  );
}

export function MessageCopyAction({
  copied = false,
  onClick,
  title = "Copy",
  ariaLabel,
  disabled = false,
  className,
}: MessageCopyActionProps) {
  const resolvedClassName = className ?? `message-copy-btn${copied ? " copied" : ""}`;
  return (
    <MessageFooterActionButton
      className={resolvedClassName}
      onClick={onClick}
      title={title}
      ariaLabel={ariaLabel}
      disabled={disabled}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {copied ? (
          <polyline points="20 6 9 17 4 12" />
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
    </MessageFooterActionButton>
  );
}

export function MessageSourcesAction({
  onClick,
  title = "Sources used",
  ariaLabel,
  disabled = false,
  className,
}: MessageFooterActionProps) {
  return (
    <MessageFooterActionButton
      className={className}
      onClick={onClick}
      title={title}
      ariaLabel={ariaLabel}
      disabled={disabled}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 0 4 19.5z" />
      </svg>
    </MessageFooterActionButton>
  );
}
