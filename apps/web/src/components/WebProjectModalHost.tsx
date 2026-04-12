import { Suspense, lazy } from "react";

import type { WebProjectModalHostProps } from "../controllers/useWebProjectUiController";

const WebCreateProjectModal = lazy(() =>
  import("./WebCreateProjectModal").then((module) => ({
    default: module.WebCreateProjectModal,
  })),
);

const WebDeleteProjectModal = lazy(() =>
  import("./WebDeleteProjectModal").then((module) => ({
    default: module.WebDeleteProjectModal,
  })),
);

export function WebProjectModalHost(props: WebProjectModalHostProps) {
  const { createModal, editModal, deleteModal } = props;

  return (
    <>
      {createModal.isOpen ? (
        <Suspense fallback={null}>
          <WebCreateProjectModal
            isOpen={createModal.isOpen}
            title="New project"
            subtitle="Create a fresh project container and optionally import a zipped repo or project folder."
            submitLabel="Create project"
            projectName={createModal.projectName}
            projectDescription={createModal.projectDescription}
            importFileName={createModal.importFileName}
            importHint="Upload a single .zip file. Project files like .env can be imported; personal credential material like SSH keys and cloud CLI creds is blocked."
            showImportSection
            isSubmitting={createModal.isSubmitting}
            error={createModal.error}
            onClose={createModal.onClose}
            onChangeName={createModal.onChangeName}
            onChangeDescription={createModal.onChangeDescription}
            onImportFilesChange={createModal.onImportFilesChange}
            onSubmit={createModal.onSubmit}
          />
        </Suspense>
      ) : null}

      {editModal.isOpen ? (
        <Suspense fallback={null}>
          <WebCreateProjectModal
            isOpen={editModal.isOpen}
            title="Edit project"
            subtitle="Update the project details and optionally import a zipped repo or project folder into this workspace."
            submitLabel="Save project"
            projectName={editModal.projectName}
            projectDescription={editModal.projectDescription}
            importFileName={editModal.importFileName}
            importHint="Upload a single .zip file to merge it into this workspace. Personal credential material like SSH keys and cloud CLI creds is blocked."
            showImportSection
            isSubmitting={editModal.isSubmitting}
            error={editModal.error}
            onClose={editModal.onClose}
            onChangeName={editModal.onChangeName}
            onChangeDescription={editModal.onChangeDescription}
            onImportFilesChange={editModal.onImportFilesChange}
            onSubmit={editModal.onSubmit}
          />
        </Suspense>
      ) : null}

      {deleteModal.isOpen ? (
        <Suspense fallback={null}>
          <WebDeleteProjectModal
            isOpen={deleteModal.isOpen}
            projectName={deleteModal.projectName}
            confirmationValue={deleteModal.confirmationValue}
            error={deleteModal.error}
            isDeleting={deleteModal.isDeleting}
            onClose={deleteModal.onClose}
            onChangeConfirmationValue={deleteModal.onChangeConfirmationValue}
            onConfirm={deleteModal.onConfirm}
          />
        </Suspense>
      ) : null}
    </>
  );
}
