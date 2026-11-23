import { lazy, Suspense } from "react";
import type { WebCommunityModalHostPropsShape } from "../controllers/useWebCommunityUiController";

const WebCreateCommunityModal = lazy(() =>
  import("./WebCreateCommunityModal").then((module) => ({
    default: module.WebCreateCommunityModal,
  })),
);

type WebCommunityModalHostProps = {
  modalHostProps: WebCommunityModalHostPropsShape;
};

export function WebCommunityModalHost(props: WebCommunityModalHostProps) {
  const { createModal } = props.modalHostProps;

  return (
    <>
      {createModal.isOpen ? (
        <Suspense fallback={null}>
          <WebCreateCommunityModal {...createModal} />
        </Suspense>
      ) : null}
    </>
  );
}
