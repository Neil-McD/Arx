import { useCallback, useMemo, useState } from "react";

import { formatProjectOperationErrorMessage } from "../../../../shared/appErrorMappings";
import {
  type CloudProjectRecord,
  createMappedCloudProject,
  deleteMappedCloudProject,
  importMappedCloudProjectZip,
  updateMappedCloudProject,
} from "../../../../shared/cloudProjectsGateway";
import type { WorkspaceStorageBillingAction } from "../../../../shared/paidUsageBilling";
import {
  formatProjectContextLinksText,
  parseProjectContextLinksText,
} from "../../../../shared/projectContext";
import { normalizeProjectDisplayName } from "../../../../shared/projectNaming";
import {
  countWorkspaceProjectsForAdmission,
  getWorkspaceProjectVolumeLimitForTier,
} from "../../../../shared/workspaceResourceAdmission";

export type WebCloudProjectRecord = CloudProjectRecord;

type CreateProjectModalState = {
  isOpen: boolean;
  projectName: string;
  projectDescription: string;
  projectInstructions: string;
  projectLinksText: string;
  importFileName: string | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeInstructions: (value: string) => void;
  onChangeLinksText: (value: string) => void;
  onImportFilesChange: (files: FileList | null) => void;
  onSubmit: () => void | Promise<void>;
};

type EditProjectModalState = {
  isOpen: boolean;
  projectName: string;
  projectDescription: string;
  projectInstructions: string;
  projectLinksText: string;
  importFileName: string | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeInstructions: (value: string) => void;
  onChangeLinksText: (value: string) => void;
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
  hasWorkspaceCardOnFile?: boolean | null;
  ensureSession: (session: TSession) => Promise<TSession | null>;
  requireSignIn: () => void;
  showAppToastMessage: (message: string) => void;
  onWorkspaceBillingRequired?: (params: {
    action: WorkspaceStorageBillingAction;
    message?: string | null;
  }) => void;
  onProjectCreated: (project: WebCloudProjectRecord) => void;
  onProjectUpdated: (project: WebCloudProjectRecord) => void;
  onProjectDeleted: (project: WebCloudProjectRecord) => void;
  onStartDraftInProject: (projectId: string) => void;
};

const PROJECT_IMPORT_MAX_BYTES = 150 * 1024 * 1024;
const PROJECT_IMPORT_MAX_FILES = 25_000;
const PROJECT_IMPORT_MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;

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
    return "Project imports are limited to 150 MB zipped.";
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

function readWorkspaceBillingActionFromError(
  error: unknown,
): WorkspaceStorageBillingAction | null {
  const text =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  if (text.includes("workspace_card_required_for_additional_volume")) {
    return "card_required";
  }
  if (text.includes("workspace_volume_funding_required")) {
    return "funding_required";
  }
  return null;
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
    onWorkspaceBillingRequired,
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
  const [createProjectInstructions, setCreateProjectInstructions] = useState("");
  const [createProjectLinksText, setCreateProjectLinksText] = useState("");
  const [createProjectImportFile, setCreateProjectImportFile] = useState<File | null>(null);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDescription, setEditProjectDescription] = useState("");
  const [editProjectInstructions, setEditProjectInstructions] = useState("");
  const [editProjectLinksText, setEditProjectLinksText] = useState("");
  const [editProjectImportFile, setEditProjectImportFile] = useState<File | null>(null);
  const [editProjectError, setEditProjectError] = useState<string | null>(null);
  const [deleteProjectConfirmationValue, setDeleteProjectConfirmationValue] = useState("");
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);

  const canCreateAdditionalCloudProjects = Boolean(session);
  const maxProjects = getWorkspaceProjectVolumeLimitForTier("paid");
  const countableProjectCount = countWorkspaceProjectsForAdmission(cloudProjects);
  const projectQuotaReached = countableProjectCount >= maxProjects;
  const projectErrorMessageOptions = useMemo(
    () => ({
      maxProjects,
      maxImportFiles: PROJECT_IMPORT_MAX_FILES,
      maxExtractedBytes: PROJECT_IMPORT_MAX_EXTRACTED_BYTES,
    }) as const,
    [maxProjects],
  );
  const deletingProject = deletingProjectId
    ? cloudProjects.find((project) => project.id === deletingProjectId) ?? null
    : null;

  const resetCreateProjectModal = useCallback(() => {
    setIsCreateProjectModalOpen(false);
    setCreateProjectName("");
    setCreateProjectDescription("");
    setCreateProjectInstructions("");
    setCreateProjectLinksText("");
    setCreateProjectImportFile(null);
    setCreateProjectError(null);
  }, []);

  const resetEditProjectModal = useCallback(() => {
    setIsEditProjectModalOpen(false);
    setEditingProjectId(null);
    setEditProjectName("");
    setEditProjectDescription("");
    setEditProjectInstructions("");
    setEditProjectLinksText("");
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
  }, [
    requireSignIn,
    session,
  ]);

  const openEditProjectModal = useCallback((project: WebCloudProjectRecord) => {
    setEditingProjectId(project.id);
    setEditProjectName(normalizeProjectDisplayName(project.name));
    setEditProjectDescription(project.description ?? "");
    setEditProjectInstructions(project.instructions ?? "");
    setEditProjectLinksText(formatProjectContextLinksText(project.context_links));
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
    if (projectQuotaReached || isCreatingProject) {
      return;
    }
    const importFileError = getProjectImportFileError(createProjectImportFile);
    if (importFileError) {
      setCreateProjectError(importFileError);
      return;
    }
    const parsedProjectLinks = parseProjectContextLinksText(createProjectLinksText);
    if (parsedProjectLinks.errors.length > 0) {
      setCreateProjectError(parsedProjectLinks.errors[0] ?? "Fix the project links.");
      return;
    }
    setCreateProjectError(null);
    setIsCreatingProject(true);
    let createdProject: WebCloudProjectRecord | null = null;
    try {
      const created = await createMappedCloudProject({
        session: usableSession,
        name: createProjectName.trim() || undefined,
        description: createProjectDescription.trim() || undefined,
        instructions: createProjectInstructions.trim(),
        contextLinks: parsedProjectLinks.links,
      });
      const nextProject: WebCloudProjectRecord = created;
      createdProject = nextProject;
      if (createProjectImportFile) {
        const importResult = await importMappedCloudProjectZip({
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
        setEditProjectName(normalizeProjectDisplayName(createdProject.name));
        setEditProjectDescription(createdProject.description ?? "");
        setEditProjectInstructions(createdProject.instructions ?? "");
        setEditProjectLinksText(formatProjectContextLinksText(createdProject.context_links));
        setEditProjectImportFile(createProjectImportFile);
        setEditProjectError("Project created, but the zip import failed. You can try the import again here.");
        setIsEditProjectModalOpen(true);
      } else {
        const billingAction = readWorkspaceBillingActionFromError(error);
        if (billingAction && onWorkspaceBillingRequired) {
          resetCreateProjectModal();
          onWorkspaceBillingRequired({
            action: billingAction,
            message: formatProjectOperationErrorMessage(error, {
              operation: "create",
              ...projectErrorMessageOptions,
            }),
          });
          return;
        }
        setCreateProjectError(
          formatProjectOperationErrorMessage(error, {
            operation: "create",
            ...projectErrorMessageOptions,
          }),
        );
      }
    } finally {
      setIsCreatingProject(false);
    }
  }, [
    projectQuotaReached,
    session,
    createProjectDescription,
    createProjectInstructions,
    createProjectImportFile,
    createProjectLinksText,
    createProjectName,
    ensureSession,
    isCreatingProject,
    onProjectCreated,
    onStartDraftInProject,
    onWorkspaceBillingRequired,
    projectErrorMessageOptions,
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
    const parsedProjectLinks = parseProjectContextLinksText(editProjectLinksText);
    if (parsedProjectLinks.errors.length > 0) {
      setEditProjectError(parsedProjectLinks.errors[0] ?? "Fix the project links.");
      return;
    }
    setEditProjectError(null);
    setIsUpdatingProject(true);
    let metadataUpdated = false;
    try {
      const updated = await updateMappedCloudProject({
        session: usableSession,
        projectId: editingProjectId,
        name: editProjectName.trim(),
        description: editProjectDescription.trim(),
        instructions: editProjectInstructions.trim(),
        contextLinks: parsedProjectLinks.links,
      });
      metadataUpdated = true;
      onProjectUpdated(updated);
      if (editProjectImportFile) {
        const importResult = await importMappedCloudProjectZip({
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
          ? "Project details were saved, but the zip import failed."
          : formatProjectOperationErrorMessage(error, {
              operation: "update",
              ...projectErrorMessageOptions,
            }),
      );
    } finally {
      setIsUpdatingProject(false);
    }
  }, [
    session,
    editProjectDescription,
    editProjectInstructions,
    editProjectImportFile,
    editProjectLinksText,
    editProjectName,
    editingProjectId,
    ensureSession,
    isUpdatingProject,
    onProjectUpdated,
    projectErrorMessageOptions,
    resetEditProjectModal,
    showAppToastMessage,
  ]);

  const handleDeleteProject = useCallback(async (): Promise<void> => {
    if (!session || !deletingProjectId || isDeletingProject) return;
    const project = cloudProjects.find((entry) => entry.id === deletingProjectId) ?? null;
    if (!project) {
      setDeleteProjectError("Project no longer exists.");
      return;
    }
    const expectedName = normalizeProjectDisplayName(project.name);
    if (!expectedName || deleteProjectConfirmationValue.trim() !== expectedName) {
      setDeleteProjectError("Type the exact project name to confirm deletion.");
      return;
    }
    const usableSession = await ensureSession(session);
    if (!usableSession) return;
    setIsDeletingProject(true);
    setDeleteProjectError(null);
    try {
      await deleteMappedCloudProject({
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
          ...projectErrorMessageOptions,
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
    projectErrorMessageOptions,
    resetDeleteProjectModal,
    resetEditProjectModal,
  ]);

  return {
    maxProjects,
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
        projectInstructions: createProjectInstructions,
        projectLinksText: createProjectLinksText,
        importFileName: createProjectImportFile?.name ?? null,
        isSubmitting: isCreatingProject,
        error: createProjectError,
        onClose: closeCreateProjectModal,
        onChangeName: setCreateProjectName,
        onChangeDescription: setCreateProjectDescription,
        onChangeInstructions: (value) => {
          setCreateProjectInstructions(value);
          if (createProjectError) setCreateProjectError(null);
        },
        onChangeLinksText: (value) => {
          setCreateProjectLinksText(value);
          if (createProjectError) setCreateProjectError(null);
        },
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
        projectInstructions: editProjectInstructions,
        projectLinksText: editProjectLinksText,
        importFileName: editProjectImportFile?.name ?? null,
        isSubmitting: isUpdatingProject || isDeletingProject,
        error: editProjectError,
        onClose: closeEditProjectModal,
        onChangeName: setEditProjectName,
        onChangeDescription: setEditProjectDescription,
        onChangeInstructions: (value) => {
          setEditProjectInstructions(value);
          if (editProjectError) setEditProjectError(null);
        },
        onChangeLinksText: (value) => {
          setEditProjectLinksText(value);
          if (editProjectError) setEditProjectError(null);
        },
        onImportFilesChange: (files) => {
          setEditProjectImportFile(toSelectedFile(files));
          if (editProjectError) setEditProjectError(null);
        },
        onSubmit: handleUpdateProject,
      },
      deleteModal: {
        isOpen: isDeleteProjectModalOpen,
        projectName: deletingProject ? normalizeProjectDisplayName(deletingProject.name) : "",
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
