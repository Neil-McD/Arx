import { useCallback, useState } from "react";

import { formatProjectOperationErrorMessage } from "../../../../shared/appErrorMappings";
import {
  createMappedDaytonaCloudProject,
  deleteMappedDaytonaCloudProject,
  importMappedDaytonaCloudProjectZip,
  updateMappedDaytonaCloudProject,
} from "../../../../shared/daytonaCloudProjects";
import { normalizeComputerDisplayName } from "../../../../shared/projectNaming";

export type WebCloudProjectRecord = {
  id: string;
  name: string | null;
  description: string | null;
  slug: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  root_path: string;
};

type CreateProjectModalState = {
  isOpen: boolean;
  projectName: string;
  projectDescription: string;
  importFileName: string | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onImportFilesChange: (files: FileList | null) => void;
  onSubmit: () => void | Promise<void>;
};

type EditProjectModalState = {
  isOpen: boolean;
  projectName: string;
  projectDescription: string;
  importFileName: string | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onImportFilesChange: (files: FileList | null) => void;
  onSubmit: () => void | Promise<void>;
};

type DeleteProjectModalState = {
  isOpen: boolean;
  projectName: string;
  confirmationValue: string;
  error: string | null;
  isDeleting: boolean;
  onClose: () => void;
  onChangeConfirmationValue: (value: string) => void;
  onConfirm: () => void | Promise<void>;
};

export type WebProjectModalHostProps = {
  createModal: CreateProjectModalState;
  editModal: EditProjectModalState;
  deleteModal: DeleteProjectModalState;
};

type UseWebProjectUiControllerParams<TSession> = {
  session: TSession | null;
  cloudProjects: WebCloudProjectRecord[];
  ensureSession: (session: TSession) => Promise<TSession | null>;
  requireSignIn: () => void;
  showAppToastMessage: (message: string) => void;
  onProjectCreated: (project: WebCloudProjectRecord) => void;
  onProjectUpdated: (project: WebCloudProjectRecord) => void;
  onProjectDeleted: (project: WebCloudProjectRecord) => void;
  onStartDraftInProject: (projectId: string) => void;
};

const ACCOUNT_MAX_PROJECTS = 5;
const PROJECT_IMPORT_MAX_BYTES = 150 * 1024 * 1024;
const PROJECT_IMPORT_MAX_FILES = 25_000;
const PROJECT_IMPORT_MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;
const PROJECT_ERROR_MESSAGE_OPTIONS = {
  maxProjects: ACCOUNT_MAX_PROJECTS,
  maxImportFiles: PROJECT_IMPORT_MAX_FILES,
  maxExtractedBytes: PROJECT_IMPORT_MAX_EXTRACTED_BYTES,
} as const;

function toSelectedFile(files: FileList | null): File | null {
  return files?.[0] ?? null;
}

function getProjectImportFileError(file: File | null): string | null {
  if (!file) return null;
  const fileName = String(file.name ?? "").trim().toLowerCase();
  const mimeType = String(file.type ?? "").trim().toLowerCase();
  const isZip =
    fileName.endsWith(".zip") ||
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed";
  if (!isZip) {
    return "Upload a single .zip file.";
  }
  if (file.size > PROJECT_IMPORT_MAX_BYTES) {
    return "Computer imports are limited to 150 MB zipped.";
  }
  return null;
}

function formatProjectImportSummary(params: {
  importedFiles: number;
  skippedFiles: number;
  blockedFiles: number;
  commonRootStripped: boolean;
}): string {
  const parts: string[] = [];
  parts.push(params.importedFiles === 1 ? "Imported 1 file." : `Imported ${params.importedFiles} files.`);
  if (params.commonRootStripped) {
    parts.push("Stripped the archive's top-level folder.");
  }
  if (params.skippedFiles > 0) {
    parts.push(
      params.skippedFiles === 1
        ? "Skipped 1 generated or bulky path."
        : `Skipped ${params.skippedFiles} generated or bulky paths.`,
    );
  }
  if (params.blockedFiles > 0) {
    parts.push(
      params.blockedFiles === 1
        ? "Blocked 1 sensitive file."
        : `Blocked ${params.blockedFiles} sensitive files.`,
    );
  }
  return parts.join(" ");
}

export function useWebProjectUiController<TSession>(
  params: UseWebProjectUiControllerParams<TSession>,
): {
  maxProjects: number;
  canCreateAdditionalCloudProjects: boolean;
  projectQuotaReached: boolean;
  isCreatingProject: boolean;
  openCreateProjectModal: () => void;
  openEditProjectModal: (project: WebCloudProjectRecord) => void;
  openDeleteProjectModal: (project: WebCloudProjectRecord) => void;
  modalHostProps: WebProjectModalHostProps;
} {
  const {
    session,
    cloudProjects,
    ensureSession,
    requireSignIn,
    showAppToastMessage,
    onProjectCreated,
    onProjectUpdated,
    onProjectDeleted,
    onStartDraftInProject,
  } = params;

  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [isDeleteProjectModalOpen, setIsDeleteProjectModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [createProjectName, setCreateProjectName] = useState("");
  const [createProjectDescription, setCreateProjectDescription] = useState("");
  const [createProjectImportFile, setCreateProjectImportFile] = useState<File | null>(null);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDescription, setEditProjectDescription] = useState("");
  const [editProjectImportFile, setEditProjectImportFile] = useState<File | null>(null);
  const [editProjectError, setEditProjectError] = useState<string | null>(null);
  const [deleteProjectConfirmationValue, setDeleteProjectConfirmationValue] = useState("");
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);

  const canCreateAdditionalCloudProjects = Boolean(session);
  const projectQuotaReached = cloudProjects.length >= ACCOUNT_MAX_PROJECTS;
  const deletingProject = deletingProjectId
    ? cloudProjects.find((project) => project.id === deletingProjectId) ?? null
    : null;

  const resetCreateProjectModal = useCallback(() => {
    setIsCreateProjectModalOpen(false);
    setCreateProjectName("");
    setCreateProjectDescription("");
    setCreateProjectImportFile(null);
    setCreateProjectError(null);
  }, []);

  const resetEditProjectModal = useCallback(() => {
    setIsEditProjectModalOpen(false);
    setEditingProjectId(null);
    setEditProjectName("");
    setEditProjectDescription("");
    setEditProjectImportFile(null);
    setEditProjectError(null);
  }, []);

  const resetDeleteProjectModal = useCallback(() => {
    setIsDeleteProjectModalOpen(false);
    setDeletingProjectId(null);
    setDeleteProjectConfirmationValue("");
    setDeleteProjectError(null);
  }, []);

  const closeCreateProjectModal = useCallback(() => {
    if (isCreatingProject) return;
    resetCreateProjectModal();
  }, [isCreatingProject, resetCreateProjectModal]);

  const closeEditProjectModal = useCallback(() => {
    if (isUpdatingProject || isDeletingProject) return;
    resetEditProjectModal();
  }, [isDeletingProject, isUpdatingProject, resetEditProjectModal]);

  const closeDeleteProjectModal = useCallback(() => {
    if (isDeletingProject) return;
    resetDeleteProjectModal();
  }, [isDeletingProject, resetDeleteProjectModal]);

  const openCreateProjectModal = useCallback(() => {
    if (!session) {
      requireSignIn();
      return;
    }
    setCreateProjectError(null);
    setCreateProjectImportFile(null);
    setIsCreateProjectModalOpen(true);
  }, [requireSignIn, session]);

  const openEditProjectModal = useCallback((project: WebCloudProjectRecord) => {
    setEditingProjectId(project.id);
    setEditProjectName(normalizeComputerDisplayName(project.name));
    setEditProjectDescription(project.description ?? "");
    setEditProjectImportFile(null);
    setEditProjectError(null);
    setIsEditProjectModalOpen(true);
  }, []);

  const openDeleteProjectModal = useCallback((project: WebCloudProjectRecord) => {
    setDeletingProjectId(project.id);
    setDeleteProjectConfirmationValue("");
    setDeleteProjectError(null);
    setIsDeleteProjectModalOpen(true);
  }, []);

  const handleCreateProject = useCallback(async (): Promise<void> => {
    if (!session) {
      requireSignIn();
      return;
    }
    const usableSession = await ensureSession(session);
    if (!usableSession) return;
    if (cloudProjects.length >= ACCOUNT_MAX_PROJECTS || isCreatingProject) {
      return;
    }
    const importFileError = getProjectImportFileError(createProjectImportFile);
    if (importFileError) {
      setCreateProjectError(importFileError);
      return;
    }
    setCreateProjectError(null);
    setIsCreatingProject(true);
    let createdProject: WebCloudProjectRecord | null = null;
    try {
      const created = await createMappedDaytonaCloudProject({
        session: usableSession,
        name: createProjectName.trim() || undefined,
        description: createProjectDescription.trim() || undefined,
      });
      const nextProject: WebCloudProjectRecord = {
        id: created.id,
        name: created.name,
        description: created.description,
        slug: created.slug,
        status: created.status,
        created_at: created.created_at,
        updated_at: created.updated_at,
        root_path: created.root_path,
      };
      createdProject = nextProject;
      if (createProjectImportFile) {
        const importResult = await importMappedDaytonaCloudProjectZip({
          session: usableSession,
          projectId: nextProject.id,
          file: createProjectImportFile,
        });
        showAppToastMessage(formatProjectImportSummary(importResult));
      }
      onProjectCreated(nextProject);
      resetCreateProjectModal();
      onStartDraftInProject(nextProject.id);
    } catch (error) {
      console.warn("Failed to create cloud project:", error);
      if (createdProject) {
        onProjectCreated(createdProject);
        resetCreateProjectModal();
        setEditingProjectId(createdProject.id);
        setEditProjectName(normalizeComputerDisplayName(createdProject.name));
        setEditProjectDescription(createdProject.description ?? "");
        setEditProjectImportFile(createProjectImportFile);
        setEditProjectError("Computer created, but the zip import failed. You can try the import again here.");
        setIsEditProjectModalOpen(true);
      } else {
        setCreateProjectError(
          formatProjectOperationErrorMessage(error, {
            operation: "create",
            ...PROJECT_ERROR_MESSAGE_OPTIONS,
          }),
        );
      }
    } finally {
      setIsCreatingProject(false);
    }
  }, [
    cloudProjects.length,
    session,
    createProjectDescription,
    createProjectImportFile,
    createProjectName,
    ensureSession,
    isCreatingProject,
    onProjectCreated,
    onStartDraftInProject,
    requireSignIn,
    resetCreateProjectModal,
    showAppToastMessage,
  ]);

  const handleUpdateProject = useCallback(async (): Promise<void> => {
    if (!session || !editingProjectId || isUpdatingProject) return;
    const usableSession = await ensureSession(session);
    if (!usableSession) return;
    const importFileError = getProjectImportFileError(editProjectImportFile);
    if (importFileError) {
      setEditProjectError(importFileError);
      return;
    }
    setEditProjectError(null);
    setIsUpdatingProject(true);
    let metadataUpdated = false;
    try {
      const updated = await updateMappedDaytonaCloudProject({
        session: usableSession,
        projectId: editingProjectId,
        name: editProjectName.trim(),
        description: editProjectDescription.trim(),
      });
      metadataUpdated = true;
      onProjectUpdated(updated);
      if (editProjectImportFile) {
        const importResult = await importMappedDaytonaCloudProjectZip({
          session: usableSession,
          projectId: editingProjectId,
          file: editProjectImportFile,
        });
        showAppToastMessage(formatProjectImportSummary(importResult));
      }
      resetEditProjectModal();
    } catch (error) {
      console.warn("Failed to update cloud project:", error);
      setEditProjectError(
        metadataUpdated && editProjectImportFile
          ? "Computer details were saved, but the zip import failed."
          : formatProjectOperationErrorMessage(error, {
              operation: "update",
              ...PROJECT_ERROR_MESSAGE_OPTIONS,
            }),
      );
    } finally {
      setIsUpdatingProject(false);
    }
  }, [
    session,
    editProjectDescription,
    editProjectImportFile,
    editProjectName,
    editingProjectId,
    ensureSession,
    isUpdatingProject,
    onProjectUpdated,
    resetEditProjectModal,
    showAppToastMessage,
  ]);

  const handleDeleteProject = useCallback(async (): Promise<void> => {
    if (!session || !deletingProjectId || isDeletingProject) return;
    const project = cloudProjects.find((entry) => entry.id === deletingProjectId) ?? null;
    if (!project) {
      setDeleteProjectError("Computer no longer exists.");
      return;
    }
    const expectedName = normalizeComputerDisplayName(project.name);
    if (!expectedName || deleteProjectConfirmationValue.trim() !== expectedName) {
      setDeleteProjectError("Type the exact computer name to confirm deletion.");
      return;
    }
    const usableSession = await ensureSession(session);
    if (!usableSession) return;
    setIsDeletingProject(true);
    setDeleteProjectError(null);
    try {
      await deleteMappedDaytonaCloudProject({
        session: usableSession,
        projectId: project.id,
      });
      onProjectDeleted(project);
      if (editingProjectId === project.id) {
        resetEditProjectModal();
      }
      resetDeleteProjectModal();
    } catch (error) {
      console.warn("Failed to delete cloud project:", error);
      setDeleteProjectError(
        formatProjectOperationErrorMessage(error, {
          operation: "delete",
          ...PROJECT_ERROR_MESSAGE_OPTIONS,
        }),
      );
    } finally {
      setIsDeletingProject(false);
    }
  }, [
    cloudProjects,
    session,
    deleteProjectConfirmationValue,
    deletingProjectId,
    editingProjectId,
    ensureSession,
    isDeletingProject,
    onProjectDeleted,
    resetDeleteProjectModal,
    resetEditProjectModal,
  ]);

  return {
    maxProjects: ACCOUNT_MAX_PROJECTS,
    canCreateAdditionalCloudProjects,
    projectQuotaReached,
    isCreatingProject,
    openCreateProjectModal,
    openEditProjectModal,
    openDeleteProjectModal,
    modalHostProps: {
      createModal: {
        isOpen: isCreateProjectModalOpen,
        projectName: createProjectName,
        projectDescription: createProjectDescription,
        importFileName: createProjectImportFile?.name ?? null,
        isSubmitting: isCreatingProject,
        error: createProjectError,
        onClose: closeCreateProjectModal,
        onChangeName: setCreateProjectName,
        onChangeDescription: setCreateProjectDescription,
        onImportFilesChange: (files) => {
          setCreateProjectImportFile(toSelectedFile(files));
          if (createProjectError) setCreateProjectError(null);
        },
        onSubmit: handleCreateProject,
      },
      editModal: {
        isOpen: isEditProjectModalOpen,
        projectName: editProjectName,
        projectDescription: editProjectDescription,
        importFileName: editProjectImportFile?.name ?? null,
        isSubmitting: isUpdatingProject || isDeletingProject,
        error: editProjectError,
        onClose: closeEditProjectModal,
        onChangeName: setEditProjectName,
        onChangeDescription: setEditProjectDescription,
        onImportFilesChange: (files) => {
          setEditProjectImportFile(toSelectedFile(files));
          if (editProjectError) setEditProjectError(null);
        },
        onSubmit: handleUpdateProject,
      },
      deleteModal: {
        isOpen: isDeleteProjectModalOpen,
        projectName: deletingProject ? normalizeComputerDisplayName(deletingProject.name) : "",
        confirmationValue: deleteProjectConfirmationValue,
        error: deleteProjectError,
        isDeleting: isDeletingProject,
        onClose: closeDeleteProjectModal,
        onChangeConfirmationValue: (value) => {
          setDeleteProjectConfirmationValue(value);
          if (deleteProjectError) setDeleteProjectError(null);
        },
        onConfirm: handleDeleteProject,
      },
    },
  };
}
