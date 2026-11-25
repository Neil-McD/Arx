import { WebImageFrameEditorModal } from "./WebImageFrameEditorModal";

type WebCommunityBannerEditorModalProps = {
  isOpen: boolean;
  bannerUrl: string | null;
  focusX: number;
  focusY: number;
  zoom: number;
  title?: string;
  imageAlt?: string;
  hint?: string;
  aspectRatio?: string;
  onChangeFocusX: (value: number) => void;
  onChangeFocusY: (value: number) => void;
  onChangeZoom: (value: number) => void;
  onDirty: () => void;
  onClose: () => void;
};

export function WebCommunityBannerEditorModal(props: WebCommunityBannerEditorModalProps) {
  return (
    <WebImageFrameEditorModal
      isOpen={props.isOpen}
      imageUrl={props.bannerUrl}
      focusX={props.focusX}
      focusY={props.focusY}
      zoom={props.zoom}
      title={props.title ?? "Adjust banner framing"}
      imageAlt={props.imageAlt ?? "Community banner preview"}
      hint={props.hint ?? "Drag the image to frame it inside the banner."}
      aspectRatio={props.aspectRatio}
      usePortal
      onChangeFocusX={props.onChangeFocusX}
      onChangeFocusY={props.onChangeFocusY}
      onChangeZoom={props.onChangeZoom}
      onDirty={props.onDirty}
      onClose={props.onClose}
    />
  );
}
