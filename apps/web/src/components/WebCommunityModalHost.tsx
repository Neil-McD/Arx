import type { WebCommunityModalHostPropsShape } from "../controllers/useWebCommunityUiController";
import { WebCreateCommunityModal } from "./WebCreateCommunityModal";

type WebCommunityModalHostProps = {
  modalHostProps: WebCommunityModalHostPropsShape;
};

export function WebCommunityModalHost(props: WebCommunityModalHostProps) {
  const { createModal } = props.modalHostProps;

  return (
    <>
      {createModal.isOpen ? (
        <WebCreateCommunityModal
          isOpen={createModal.isOpen}
          hasSession={createModal.hasSession}
          createCommunityName={createModal.createCommunityName}
          createCommunitySlug={createModal.createCommunitySlug}
          createCommunityError={createModal.createCommunityError}
          isCreatingCommunity={createModal.isCreatingCommunity}
          onClose={createModal.onClose}
          onPrimaryAction={() => void createModal.onPrimaryAction()}
          onChangeName={createModal.onChangeName}
          onChangeSlug={createModal.onChangeSlug}
          onChangeSlugEdited={createModal.onChangeSlugEdited}
        />
      ) : null}
    </>
  );
}
