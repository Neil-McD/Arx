import type { Dispatch, SetStateAction } from "react";

type LightboxImage = {
  url: string;
  name: string;
};

type WebCommunityChatLightboxModalProps = {
  isOpen: boolean;
  images: LightboxImage[];
  index: number;
  setIndex: Dispatch<SetStateAction<number>>;
  onClose: () => void;
};

export function WebCommunityChatLightboxModal(props: WebCommunityChatLightboxModalProps) {
  const { isOpen, images, index, setIndex, onClose } = props;

  if (!isOpen || images.length === 0) return null;

  const active =
    images[
      Math.min(
        Math.max(index, 0),
        images.length - 1,
      )
    ] ?? null;
  if (!active) return null;
  const total = images.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal lightbox-modal" onClick={(event) => event.stopPropagation()}>
        <button
          className="lightbox-close"
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close"
        >
          ×
        </button>
        {total > 1 && (
          <>
            <button
              className="lightbox-nav prev"
              type="button"
              onClick={() => setIndex((prev) => (prev - 1 + total) % total)}
              title="Previous"
              aria-label="Previous"
            >
              ‹
            </button>
            <button
              className="lightbox-nav next"
              type="button"
              onClick={() => setIndex((prev) => (prev + 1) % total)}
              title="Next"
              aria-label="Next"
            >
              ›
            </button>
            <div className="lightbox-counter" aria-hidden="true">
              {index + 1}/{total}
            </div>
          </>
        )}
        <div className="lightbox-body">
          <img src={active.url} alt={active.name} />
        </div>
      </div>
    </div>
  );
}
