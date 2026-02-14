type AttachmentChipButtonProps = {
  name: string;
  imageUrl?: string | null;
  onClick?: (() => void) | null;
  disabled?: boolean;
  className?: string;
};

export function AttachmentChipButton({
  name,
  imageUrl = null,
  onClick = null,
  disabled = false,
  className = "attachment-item attachment-chip",
}: AttachmentChipButtonProps) {
  const isImage = typeof imageUrl === "string" && imageUrl.startsWith("data:image/");
  const isDisabled = disabled || !onClick;

  return (
    <button
      type="button"
      className={className}
      onClick={onClick ?? undefined}
      disabled={isDisabled}
      title={name}
    >
      {isImage ? (
        <img src={imageUrl} alt={name} className="attachment-thumb" />
      ) : (
        <div className="attachment-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </svg>
        </div>
      )}
      <span className="attachment-name">{name}</span>
    </button>
  );
}
