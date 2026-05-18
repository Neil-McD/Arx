import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

type LightboxImage = {
  id?: string;
  url: string;
  previewUrl?: string;
  fullUrl?: string;
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
  const total = images.length;

  useEffect(() => {
    if (!isOpen || total === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (total <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((prev) => (prev - 1 + total) % total);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((prev) => (prev + 1) % total);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, setIndex, total]);

  if (!isOpen || total === 0) return null;

  const activeIndex = Math.min(Math.max(index, 0), total - 1);
  const active =
    images[activeIndex] ?? null;
  if (!active) return null;
  const activeUrl = active.fullUrl || active.url;

  return (
    <div className="modal-overlay lightbox-overlay" onClick={onClose}>
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
              {activeIndex + 1}/{total}
            </div>
          </>
        )}
        <div className="lightbox-caption">
          <span>{active.name}</span>
        </div>
        <div className="lightbox-body">
          <img src={activeUrl} alt={active.name} />
        </div>
      </div>
    </div>
  );
}
