import type { WebProjectModalHostProps } from "../controllers/useWebProjectUiController";
import { WebCreateProjectModal } from "./WebCreateProjectModal";
import { WebDeleteProjectModal } from "./WebDeleteProjectModal";

export function WebProjectModalHost(props: WebProjectModalHostProps) {
  const { createModal, editModal, deleteModal } = props;

  return (
    <>
      {createModal.isOpen ? (
        <WebCreateProjectModal
          isOpen={createModal.isOpen}
          title="New project"
          subtitle="Create a durable project workspace and optionally import a zipped repo or workspace folder."
          submitLabel="Create project"
          projectName={createModal.projectName}
          projectDescription={createModal.projectDescription}
          projectInstructions={createModal.projectInstructions}
          projectLinksText={createModal.projectLinksText}
          importFileName={createModal.importFileName}
          importHint="Upload a single .zip file. Workspace files like .env can be imported; personal credential material like SSH keys and cloud CLI creds is blocked."
          showImportSection
          isSubmitting={createModal.isSubmitting}
          error={createModal.error}
          onClose={createModal.onClose}
          onChangeName={createModal.onChangeName}
          onChangeDescription={createModal.onChangeDescription}
          onChangeInstructions={createModal.onChangeInstructions}
          onChangeLinksText={createModal.onChangeLinksText}
          onImportFilesChange={createModal.onImportFilesChange}
          onSubmit={createModal.onSubmit}
        />
      ) : null}

      {editModal.isOpen ? (
        <WebCreateProjectModal
          isOpen={editModal.isOpen}
          title="Edit project"
          subtitle="Update the project details and optionally import a zipped repo or workspace folder."
          submitLabel="Save project"
          projectName={editModal.projectName}
          projectDescription={editModal.projectDescription}
          projectInstructions={editModal.projectInstructions}
          projectLinksText={editModal.projectLinksText}
          importFileName={editModal.importFileName}
          importHint="Upload a single .zip file to merge it into this workspace. Personal credential material like SSH keys and cloud CLI creds is blocked."
          showImportSection
          isSubmitting={editModal.isSubmitting}
          error={editModal.error}
          onClose={editModal.onClose}
          onChangeName={editModal.onChangeName}
          onChangeDescription={editModal.onChangeDescription}
          onChangeInstructions={editModal.onChangeInstructions}
          onChangeLinksText={editModal.onChangeLinksText}
          onImportFilesChange={editModal.onImportFilesChange}
          onSubmit={editModal.onSubmit}
        />
      ) : null}

      {deleteModal.isOpen ? (
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
      ) : null}
    </>
  );
}
