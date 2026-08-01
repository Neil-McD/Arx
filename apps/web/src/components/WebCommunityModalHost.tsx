import type { WebCommunityModalHostPropsShape } from "../controllers/useWebCommunityUiController";
import { WebCreateCommunityModal } from "./WebCreateCommunityModal";

type WebCommunityModalHostProps = {
  modalHostProps: WebCommunityModalHostPropsShape<{ id: string }, { account_tier: string; max_communities: number }>;
};

export function WebCommunityModalHost(props: WebCommunityModalHostProps) {
  const { createModal } = props.modalHostProps;

  return (
    <>
      {createModal.isOpen ? (
        <WebCreateCommunityModal
          isOpen={createModal.isOpen}
          hasSession={createModal.hasSession}
          communities={createModal.communities}
          communityRoleById={createModal.communityRoleById}
          accountCommerceStatus={createModal.accountCommerceStatus}
          isCreateBannerDragOver={createModal.isCreateBannerDragOver}
          isCreateAvatarDragOver={createModal.isCreateAvatarDragOver}
          createCommunityBannerUrl={createModal.createCommunityBannerUrl}
          createCommunityAvatarUrl={createModal.createCommunityAvatarUrl}
          createCommunityName={createModal.createCommunityName}
          createCommunityOneLiner={createModal.createCommunityOneLiner}
          createCommunitySlug={createModal.createCommunitySlug}
          createCommunityError={createModal.createCommunityError}
          accountCommerceError={createModal.accountCommerceError}
          isCreatingCommunity={createModal.isCreatingCommunity}
          communityInitials={createModal.communityInitials}
          onClose={createModal.onClose}
          onPrimaryAction={() => void createModal.onPrimaryAction()}
          onSetBannerDragOver={createModal.onSetBannerDragOver}
          onSetAvatarDragOver={createModal.onSetAvatarDragOver}
          onBannerDrop={createModal.onBannerDrop}
          onAvatarDrop={createModal.onAvatarDrop}
          onUploadBanner={(file) => void createModal.onUploadBanner(file)}
          onUploadAvatar={(file) => void createModal.onUploadAvatar(file)}
          onRemoveBanner={createModal.onRemoveBanner}
          onRemoveAvatar={createModal.onRemoveAvatar}
          onChangeName={createModal.onChangeName}
          onChangeOneLiner={createModal.onChangeOneLiner}
          onChangeSlug={createModal.onChangeSlug}
          onChangeSlugEdited={createModal.onChangeSlugEdited}
        />
      ) : null}
    </>
  );
}
