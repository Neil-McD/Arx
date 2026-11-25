import { WebImageFrameEditorModal } from "./WebImageFrameEditorModal";

type WebUserAvatarEditorModalProps = {
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

export function WebUserAvatarEditorModal(props: WebUserAvatarEditorModalProps) {
  return (
    <WebImageFrameEditorModal
      isOpen={props.isOpen}
      imageUrl={props.avatarUrl}
      focusX={props.focusX}
      focusY={props.focusY}
      zoom={props.zoom}
      title={props.title ?? "Adjust profile photo"}
      imageAlt={props.imageAlt ?? "Profile photo preview"}
      hint={props.hint ?? "Drag the image to frame it inside your profile photo."}
      modalClassName="modal banner-focus-modal avatar-focus-modal user-avatar-focus-modal"
      viewportClassName="banner-editor-viewport avatar-editor-viewport user-avatar-editor-viewport"
      hintClassName="avatar-editor-hint"
      fieldClassName="avatar-editor-field banner-focus-field"
      onChangeFocusX={props.onChangeFocusX}
      onChangeFocusY={props.onChangeFocusY}
      onChangeZoom={props.onChangeZoom}
      onDirty={props.onDirty}
      onClose={props.onClose}
    />
  );
}
