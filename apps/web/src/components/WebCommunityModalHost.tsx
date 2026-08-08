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
        <WebCreateCommunityModal {...createModal} />
      ) : null}
    </>
  );
}
