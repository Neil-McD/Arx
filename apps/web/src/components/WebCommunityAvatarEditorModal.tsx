import { WebImageFrameEditorModal } from "./WebImageFrameEditorModal";

type WebCommunityAvatarEditorModalProps = {
  isOpen: boolean;
  avatarUrl: string | null;
  focusX: number;
  focusY: number;
  zoom: number;
  title?: string;
  imageAlt?: string;
  hint?: string;
  onChangeFocusX: (value: number) => void;
  onChangeFocusY: (value: number) => void;
  onChangeZoom: (value: number) => void;
  onDirty: () => void;
  onClose: () => void;
};

export function WebCommunityAvatarEditorModal(props: WebCommunityAvatarEditorModalProps) {
  return (
    <WebImageFrameEditorModal
      isOpen={props.isOpen}
      imageUrl={props.avatarUrl}
      focusX={props.focusX}
      focusY={props.focusY}
      zoom={props.zoom}
      title={props.title ?? "Adjust logo framing"}
      imageAlt={props.imageAlt ?? "Community avatar preview"}
      hint={props.hint ?? "Drag the image to frame it inside the logo."}
      modalClassName="modal banner-focus-modal avatar-focus-modal"
      viewportClassName="banner-editor-viewport avatar-editor-viewport"
      onChangeFocusX={props.onChangeFocusX}
      onChangeFocusY={props.onChangeFocusY}
      onChangeZoom={props.onChangeZoom}
      onDirty={props.onDirty}
      onClose={props.onClose}
    />
  );
}
