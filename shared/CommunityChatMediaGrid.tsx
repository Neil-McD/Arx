export type CommunityChatMediaImage = {
  url: string;
  name: string;
};

type CommunityChatMediaGridProps = {
  images: CommunityChatMediaImage[];
  onOpenImage: (images: CommunityChatMediaImage[], index: number) => void;
  className?: string;
  maxVisible?: number;
};

export function CommunityChatMediaGrid({
  images,
  onOpenImage,
  className = "",
  maxVisible = 4,
}: CommunityChatMediaGridProps) {
  if (!images || images.length === 0) return null;

  const clampedMaxVisible = Math.max(1, maxVisible);
  const visibleCount = Math.min(images.length, clampedMaxVisible);
  const rootClassName = `chat-media-grid count-${visibleCount}${className ? ` ${className}` : ""}`;
  const visibleImages = images.slice(0, clampedMaxVisible);

  return (
    <div className={rootClassName}>
      {visibleImages.map((img, idx) => (
        <button
          key={`${idx}-${img.url}`}
          type="button"
          className="chat-media-item"
          onClick={() => onOpenImage(images, idx)}
          title={img.name}
          aria-label={img.name}
        >
          <img src={img.url} alt={img.name} loading="lazy" />
          {idx === clampedMaxVisible - 1 && images.length > clampedMaxVisible && (
            <div className="chat-media-more">+{images.length - clampedMaxVisible}</div>
          )}
        </button>
      ))}
    </div>
  );
}
