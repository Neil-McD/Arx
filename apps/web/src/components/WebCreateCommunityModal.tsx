import type { DragEvent } from "react";

import { WebBlockingSetupModal } from "./WebBlockingSetupModal";
import { KitStartCommunity } from "../v1/KitStartCommunity";

type WebCreateCommunityModalProps = {
  isOpen: boolean;
  isDismissible: boolean;
  isPaidSetup: boolean;
  hasSession: boolean;
  createCommunityName: string;
  createCommunityOneLiner: string;
  createCommunitySlug: string;
  createCommunityAvatarUrl: string | null;
  createCommunityBannerUrl: string | null;
  createCommunityError: string | null;
  isCreatingCommunity: boolean;
  isCreateAvatarDragOver: boolean;
  isCreateBannerDragOver: boolean;
  isProcessingCreateAvatar: boolean;
  isProcessingCreateBanner: boolean;
  onClose: () => void;
  onPrimaryAction: () => Promise<void> | void;
  onSetAvatarDragOver: (value: boolean) => void;
  onSetBannerDragOver: (value: boolean) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  onUploadAvatar: (file: File | null) => Promise<void> | void;
  onUploadBanner: (file: File | null) => Promise<void> | void;
  onRemoveAvatar: () => void;
  onRemoveBanner: () => void;
  onChangeName: (value: string) => void;
  onChangeOneLiner: (value: string) => void;
  onChangeSlug: (value: string) => void;
  onChangeSlugEdited: (value: boolean) => void;
  hostName?: string | null;
  hostAvatarUrl?: string | null;
  hostAvatarFocusX?: number | null;
  hostAvatarFocusY?: number | null;
  hostAvatarZoom?: number | null;
};

export function WebCreateCommunityModal(props: WebCreateCommunityModalProps) {
  if (!props.isOpen) return null;

  return (
    <WebBlockingSetupModal
      titleId="builder-create-title"
      dismissible={props.isDismissible}
      busy={props.isCreatingCommunity}
      size="wide"
      className="create-community-modal builder-create-modal is-kit-start"
      onDismiss={props.onClose}
    >
      <KitStartCommunity
        titleId="builder-create-title"
        hostName={props.hostName ?? null}
        hostAvatarUrl={props.hostAvatarUrl ?? null}
        hostAvatarFocusX={props.hostAvatarFocusX ?? null}
        hostAvatarFocusY={props.hostAvatarFocusY ?? null}
        hostAvatarZoom={props.hostAvatarZoom ?? null}
        isPaidSetup={props.isPaidSetup}
        hasSession={props.hasSession}
        isDismissible={props.isDismissible}
        name={props.createCommunityName}
        oneLiner={props.createCommunityOneLiner}
        slug={props.createCommunitySlug}
        avatarUrl={props.createCommunityAvatarUrl}
        bannerUrl={props.createCommunityBannerUrl}
        error={props.createCommunityError}
        isCreating={props.isCreatingCommunity}
        isProcessingAvatar={props.isProcessingCreateAvatar}
        isProcessingBanner={props.isProcessingCreateBanner}
        onClose={props.onClose}
        onCreate={props.onPrimaryAction}
        onUploadAvatar={props.onUploadAvatar}
        onUploadBanner={props.onUploadBanner}
        onRemoveAvatar={props.onRemoveAvatar}
        onRemoveBanner={props.onRemoveBanner}
        onChangeName={props.onChangeName}
        onChangeOneLiner={props.onChangeOneLiner}
        onChangeSlug={props.onChangeSlug}
        onChangeSlugEdited={props.onChangeSlugEdited}
      />
    </WebBlockingSetupModal>
  );
}
