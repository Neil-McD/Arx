import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function useCommunityChatLightbox<ImageT>(): {
  isCommunityChatLightboxOpen: boolean;
  communityChatLightboxImages: ImageT[];
  communityChatLightboxIndex: number;
  setCommunityChatLightboxIndex: Dispatch<SetStateAction<number>>;
  openCommunityChatLightbox: (images: ImageT[], index: number) => void;
  closeCommunityChatLightbox: () => void;
} {
  const [isCommunityChatLightboxOpen, setIsCommunityChatLightboxOpen] = useState(false);
  const [communityChatLightboxImages, setCommunityChatLightboxImages] = useState<ImageT[]>([]);
  const [communityChatLightboxIndex, setCommunityChatLightboxIndex] = useState(0);

  const openCommunityChatLightbox = useCallback((images: ImageT[], index: number) => {
    if (!images || images.length === 0) return;
    const clamped = Math.min(Math.max(index, 0), images.length - 1);
    setCommunityChatLightboxImages(images);
    setCommunityChatLightboxIndex(clamped);
    setIsCommunityChatLightboxOpen(true);
  }, []);

  const closeCommunityChatLightbox = useCallback(() => {
    setIsCommunityChatLightboxOpen(false);
  }, []);

  useEffect(() => {
    if (!isCommunityChatLightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCommunityChatLightbox();
        return;
      }
      if (communityChatLightboxImages.length <= 1) return;
      if (event.key === "ArrowLeft") {
        setCommunityChatLightboxIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? communityChatLightboxImages.length - 1 : next;
        });
      }
      if (event.key === "ArrowRight") {
        setCommunityChatLightboxIndex((prev) => (prev + 1) % communityChatLightboxImages.length);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeCommunityChatLightbox, isCommunityChatLightboxOpen, communityChatLightboxImages.length]);

  return {
    isCommunityChatLightboxOpen,
    communityChatLightboxImages,
    communityChatLightboxIndex,
    setCommunityChatLightboxIndex,
    openCommunityChatLightbox,
    closeCommunityChatLightbox,
  };
}
