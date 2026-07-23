import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import {
  mergeCommunityResourceContentRow,
  mergeCommunityResourceDirectoryRows,
} from "./communityResourceDirectoryState";

import {
  createCloudCommunityResourcePageDraftFromSource,
  deleteCloudCommunityResource,
  deleteCloudCommunityResourceModule,
  listCloudCommunityResourceDirectory,
  moveCloudCommunityResourceToModule,
  readCloudCommunityResource,
  reorderCloudCommunityResourceModules,
  reorderCloudCommunityResources,
  saveCloudCommunityResource,
  saveCloudCommunityResourceModule,
} from "./cloudCommunityAdminGateway";

type SessionLike = unknown;

type ResourceLike = {
  id: string;
  community_id?: string | null;
  module_id?: string | null;
  type: string;
  resource_role?: "page" | "source";
  resource_status?: "draft" | "review" | "published" | "processing" | "failed";
  title: string;
  body_md: string | null;
  body_chars?: number | null;
  url: string | null;
  pinned: boolean;
  sort_order?: number | null;
  created_at?: string;
  updated_at?: string;
};

type ResourceModuleLike = {
  id: string;
  name: string;
  module_status?: "draft" | "live";
  sort_order?: number;
};

function compareResourcesByManualOrder(a: ResourceLike, b: ResourceLike): number {
  const aSortOrder = typeof a.sort_order === "number" && Number.isFinite(a.sort_order) ? a.sort_order : null;
  const bSortOrder = typeof b.sort_order === "number" && Number.isFinite(b.sort_order) ? b.sort_order : null;
  if (aSortOrder !== null || bSortOrder !== null) {
    if (aSortOrder !== bSortOrder) {
      return (aSortOrder ?? Number.MAX_SAFE_INTEGER) - (bSortOrder ?? Number.MAX_SAFE_INTEGER);
    }
  } else if (Boolean(a.pinned) !== Boolean(b.pinned)) {
    return Boolean(a.pinned) ? -1 : 1;
  }
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
}

type UseCommunityResourceControllerArgs<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
  ResourceModuleT extends ResourceModuleLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  parseEmbedUrl: (url: string) => unknown;
  includeCommunityIdOnPatch: boolean;
  includeFileKeyOnSave: boolean;
  clearErrorWhenEditingDeleted: boolean;
  saveFailureMessage: string;
  deleteFailureMessage: string;
  resourceTitleInput: string;
  resourceUrlInput: string;
  resourceBodyInput: string;
  resourcePinnedInput: boolean;
  resourceRoleInput: "page" | "source";
  resourceStatusInput: "draft" | "review" | "published" | "processing" | "failed";
  resourceModuleIdInput: string | null;
  moduleNameInput: string;
  editingResourceId: string | null;
  editingResourceModuleId: string | null;
  communityResources: ResourceT[];
  beforeSaveValidate?: (payload: { title: string; description: string; rawUrl: string }) => Promise<string | null>;
  setCommunityResources: Dispatch<SetStateAction<ResourceT[]>>;
  setCommunityResourceModules: Dispatch<SetStateAction<ResourceModuleT[]>>;
  setIsLoadingResources: Dispatch<SetStateAction<boolean>>;
  setResourceDirectoryLimit: Dispatch<SetStateAction<number>>;
  setResourceDirectoryTruncated: Dispatch<SetStateAction<boolean>>;
  setResourceDirectoryError: Dispatch<SetStateAction<string | null>>;
  setIsSavingResource: Dispatch<SetStateAction<boolean>>;
  setIsSavingResourceModule: Dispatch<SetStateAction<boolean>>;
  setResourceError: Dispatch<SetStateAction<string | null>>;
  setResourceModuleError: Dispatch<SetStateAction<string | null>>;
  setShowResourceModuleModal: Dispatch<SetStateAction<boolean>>;
  setShowResourceModal: Dispatch<SetStateAction<boolean>>;
  setEditingResourceId: Dispatch<SetStateAction<string | null>>;
  setEditingResourceModuleId: Dispatch<SetStateAction<string | null>>;
  setResourceTitleInput: Dispatch<SetStateAction<string>>;
  setResourceUrlInput: Dispatch<SetStateAction<string>>;
  setResourceBodyInput: Dispatch<SetStateAction<string>>;
  setResourcePinnedInput: Dispatch<SetStateAction<boolean>>;
  setResourceRoleInput: Dispatch<SetStateAction<"page" | "source">>;
  setResourceStatusInput: Dispatch<SetStateAction<"draft" | "review" | "published" | "processing" | "failed">>;
  setResourceModuleIdInput: Dispatch<SetStateAction<string | null>>;
  setModuleNameInput: Dispatch<SetStateAction<string>>;
};

export function useCommunityResourceController<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
  ResourceModuleT extends ResourceModuleLike,
>(args: UseCommunityResourceControllerArgs<SessionT, ResourceT, ResourceModuleT>) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const resourceLoadGenerationRef = useRef(0);
  const resourceContentLoadGenerationRef = useRef(0);

  const resetResourceEditor = useCallback((clearError: boolean) => {
    const current = argsRef.current;
    current.setEditingResourceId(null);
    current.setResourceTitleInput("");
    current.setResourceUrlInput("");
    current.setResourceBodyInput("");
    current.setResourcePinnedInput(false);
    current.setResourceRoleInput("page");
    current.setResourceStatusInput("draft");
    current.setResourceModuleIdInput(null);
    if (clearError) {
      current.setResourceError(null);
    }
  }, []);

  const resetModuleEditor = useCallback((clearError: boolean) => {
    const current = argsRef.current;
    current.setEditingResourceModuleId(null);
    current.setModuleNameInput("");
    if (clearError) {
      current.setResourceModuleError(null);
    }
  }, []);

  const loadCommunityResources = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const generation = (resourceLoadGenerationRef.current += 1);
    current.setIsLoadingResources(true);
    current.setResourceDirectoryError(null);
    try {
      const directory = await listCloudCommunityResourceDirectory<
        SessionT,
        ResourceT,
        ResourceModuleT
      >({
        session: usableSession,
        communityId,
      });
      if (
        resourceLoadGenerationRef.current !== generation ||
        argsRef.current.activeCommunityId !== communityId
      ) {
        return;
      }
      current.setCommunityResources((previousRows) => {
        return mergeCommunityResourceDirectoryRows(previousRows, directory.resources);
      });
      current.setCommunityResourceModules(directory.modules);
      current.setResourceDirectoryLimit(directory.limit);
      current.setResourceDirectoryTruncated(directory.truncated);
    } catch (error) {
      if (resourceLoadGenerationRef.current !== generation) return;
      const message = error instanceof Error ? error.message : "community_resource_directory_unavailable";
      current.setResourceDirectoryError(message);
    } finally {
      if (resourceLoadGenerationRef.current === generation) {
        current.setIsLoadingResources(false);
      }
    }
  }, []);

  const loadCommunityResourceContent = useCallback(async (
    resourceId: string,
    expectedUpdatedAt: string | null,
  ): Promise<boolean> => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const usableSession = await resolveUsableSession(current.session, current.ensureSession);
    if (!usableSession || !communityId) return false;
    const directoryGeneration = resourceLoadGenerationRef.current;
    const contentGeneration = (resourceContentLoadGenerationRef.current += 1);
    try {
      const resource = await readCloudCommunityResource<SessionT, ResourceT>({
        session: usableSession,
        communityId,
        resourceId,
      });
      if (
        resourceContentLoadGenerationRef.current !== contentGeneration ||
        resourceLoadGenerationRef.current !== directoryGeneration ||
        argsRef.current.activeCommunityId !== communityId ||
        resource.id !== resourceId ||
        (resource.community_id && resource.community_id !== communityId)
      ) {
        return false;
      }
      const currentMerge = mergeCommunityResourceContentRow({
        rows: argsRef.current.communityResources,
        resource,
        communityId,
        expectedUpdatedAt,
      });
      if (!currentMerge.accepted) return false;
      current.setCommunityResources((rows) =>
        mergeCommunityResourceContentRow({
          rows,
          resource,
          communityId,
          expectedUpdatedAt,
        }).rows,
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleSaveCommunityResource = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return false;

    const title = current.resourceTitleInput.trim();
    if (!title) {
      current.setResourceError("Title is required.");
      return false;
    }

    const rawUrl = current.resourceUrlInput.trim();
    const description = current.resourceBodyInput.trim();
    const canSaveEmptyPageDraft = Boolean(current.editingResourceId) && current.resourceRoleInput === "page";
    if (!description && !rawUrl && !canSaveEmptyPageDraft) {
      current.setResourceError("Add content or a source URL.");
      return false;
    }

    if (current.beforeSaveValidate) {
      const validationError = await current.beforeSaveValidate({ title, description, rawUrl });
      if (validationError) {
        current.setResourceError(validationError);
        return false;
      }
    }

    const embedInfo = rawUrl ? current.parseEmbedUrl(rawUrl) : null;
    const resourceType = embedInfo ? "embed" : rawUrl ? "link" : "post";

    current.setResourceError(null);
    current.setIsSavingResource(true);
    const basePayload: Record<string, unknown> = {
      type: resourceType,
      resource_role: current.resourceRoleInput,
      title,
      body_md: description,
      url: rawUrl ? rawUrl : null,
      pinned: current.resourcePinnedInput,
      module_id: current.resourceModuleIdInput,
    };
    if (current.resourceRoleInput === "source") {
      basePayload.resource_status = current.resourceStatusInput === "published"
        ? "review"
        : current.resourceStatusInput;
    }
    if (current.includeFileKeyOnSave) {
      basePayload.file_key = null;
    }

    const isPatch = Boolean(current.editingResourceId);
    const payload = isPatch
      ? {
          ...(current.includeCommunityIdOnPatch ? { community_id: current.activeCommunityId } : {}),
          ...basePayload,
        }
      : {
          community_id: current.activeCommunityId,
          ...basePayload,
        };

    try {
      await saveCloudCommunityResource({
        session,
        resourceId: isPatch ? current.editingResourceId : null,
        isPatch,
        payload,
      });

      current.setShowResourceModal(false);
      resetResourceEditor(true);
      await loadCommunityResources(current.activeCommunityId, session);
      return true;
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : current.saveFailureMessage;
      current.setResourceError(message);
      return false;
    } finally {
      current.setIsSavingResource(false);
    }
  }, [loadCommunityResources, resetResourceEditor]);

  const handleSaveCommunityResourceModule = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return;

    const name = current.moduleNameInput.trim();
    if (!name) {
      current.setResourceModuleError("Category name is required.");
      return;
    }

    current.setResourceModuleError(null);
    current.setIsSavingResourceModule(true);
    try {
      const isPatch = Boolean(current.editingResourceModuleId);
      await saveCloudCommunityResourceModule({
        session,
        moduleId: isPatch ? current.editingResourceModuleId : null,
        isPatch,
        payload: {
          ...(isPatch ? {} : { community_id: current.activeCommunityId }),
          name,
        },
      });
      current.setShowResourceModuleModal(false);
      resetModuleEditor(true);
      await loadCommunityResources(current.activeCommunityId, session);
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to save category.";
      current.setResourceModuleError(message);
    } finally {
      current.setIsSavingResourceModule(false);
    }
  }, [loadCommunityResources, resetModuleEditor]);

  const handleDeleteCommunityResourceModule = useCallback(async (moduleId: string) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return false;
    try {
      await deleteCloudCommunityResourceModule({
        session,
        moduleId,
      });
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to delete category.";
      current.setResourceModuleError(message);
      return false;
    }
    if (current.editingResourceModuleId === moduleId) {
      current.setShowResourceModuleModal(false);
      resetModuleEditor(true);
    }
    await loadCommunityResources(current.activeCommunityId, session);
    return true;
  }, [loadCommunityResources, resetModuleEditor]);

  const handleSetCommunityResourceModuleStatus = useCallback(
    async (module: ResourceModuleT, status: "draft" | "live") => {
      const current = argsRef.current;
      const session = await resolveUsableSession(current.session, current.ensureSession);
      if (!session || !current.activeCommunityId) return false;
      const previousModules: ResourceModuleT[] = [];
      current.setCommunityResourceModules((modules) => {
        previousModules.splice(0, previousModules.length, ...modules);
        return modules.map((candidate) =>
          candidate.id === module.id
            ? ({ ...candidate, module_status: status } as ResourceModuleT)
            : candidate,
        );
      });
      try {
        await saveCloudCommunityResourceModule({
          session,
          moduleId: module.id,
          isPatch: true,
          payload: { module_status: status },
        });
        await loadCommunityResources(current.activeCommunityId, session);
        return true;
      } catch (error) {
        current.setCommunityResourceModules(previousModules);
        const message = typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to update category status.";
        current.setResourceModuleError(message);
        return false;
      }
    },
    [loadCommunityResources],
  );

  const handleReorderCommunityResourceModules = useCallback(async (moduleIds: string[]) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return false;

    const previousModules: ResourceModuleT[] = [];
    current.setCommunityResourceModules((modules) => {
      previousModules.splice(0, previousModules.length, ...modules);
      const orderById = new Map(moduleIds.map((id, index) => [id, (index + 1) * 1000]));
      return modules
        .map((module) => ({
          ...module,
          sort_order: orderById.get(module.id) ?? module.sort_order,
        }))
        .sort((a, b) => {
          const sortDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
          if (sortDelta !== 0) return sortDelta;
          return a.name.localeCompare(b.name);
        });
    });

    try {
      await reorderCloudCommunityResourceModules({
        session,
        communityId: current.activeCommunityId,
        moduleIds,
      });
      await loadCommunityResources(current.activeCommunityId, session);
      return true;
    } catch (error) {
      current.setCommunityResourceModules(previousModules);
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to reorder categories.";
      current.setResourceModuleError(message);
      return false;
    }
  }, [loadCommunityResources]);

  const handleReorderCommunityResources = useCallback(async (moduleId: string | null, resourceIds: string[]) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return false;

    const previousResources: ResourceT[] = [];
    current.setCommunityResources((resources) => {
      previousResources.splice(0, previousResources.length, ...resources);
      const normalizedModuleId = moduleId ?? null;
      const orderById = new Map(resourceIds.map((id, index) => [id, (index + 1) * 1000]));
      return resources
        .map((resource) => {
          if ((resource.module_id ?? null) !== normalizedModuleId) return resource;
          return {
            ...resource,
            sort_order: orderById.get(resource.id) ?? resource.sort_order ?? null,
          };
        })
        .sort((a, b) => {
          const aModule = a.module_id ?? null;
          const bModule = b.module_id ?? null;
          if (aModule !== bModule) return String(aModule ?? "").localeCompare(String(bModule ?? ""));
          return compareResourcesByManualOrder(a, b);
        });
    });

    try {
      await reorderCloudCommunityResources({
        session,
        communityId: current.activeCommunityId,
        moduleId,
        resourceIds,
      });
      await loadCommunityResources(current.activeCommunityId, session);
      return true;
    } catch (error) {
      current.setCommunityResources(previousResources);
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to reorder resources.";
      current.setResourceError(message);
      return false;
    }
  }, [loadCommunityResources]);

  const handleMoveCommunityResourceToModule = useCallback(
    async (resourceId: string, targetModuleId: string | null, beforeResourceId?: string | null) => {
      const current = argsRef.current;
      const session = await resolveUsableSession(current.session, current.ensureSession);
      if (!session || !current.activeCommunityId) return false;

      current.setResourceError(null);
      try {
        await moveCloudCommunityResourceToModule({
          session,
          communityId: current.activeCommunityId,
          resourceId,
          targetModuleId,
          beforeResourceId: beforeResourceId ?? null,
        });
        await loadCommunityResources(current.activeCommunityId, session);
        return true;
      } catch (error) {
        const message = typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to move resource.";
        current.setResourceError(message);
        return false;
      }
    },
    [loadCommunityResources],
  );

  const handleDeleteResource = useCallback(async (resourceId: string) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return false;
    try {
      await deleteCloudCommunityResource({
        session,
        resourceId,
      });
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : current.deleteFailureMessage;
      current.setResourceError(message);
      return false;
    }
    if (current.editingResourceId === resourceId) {
      resetResourceEditor(current.clearErrorWhenEditingDeleted);
    }
    await loadCommunityResources(current.activeCommunityId, session);
    return true;
  }, [loadCommunityResources, resetResourceEditor]);

  const handleCreatePageDraftFromSource = useCallback(async (resource: ResourceT): Promise<ResourceT | null> => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return null;

    try {
      const created = await createCloudCommunityResourcePageDraftFromSource<SessionT, ResourceT>({
        session,
        sourceResourceId: resource.id,
      });
      await loadCommunityResources(current.activeCommunityId, session);
      return created;
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : current.saveFailureMessage;
      current.setResourceError(message);
      return null;
    }
  }, [loadCommunityResources]);

  const handleCreateBlankPageDraft = useCallback(async (moduleId?: string | null): Promise<ResourceT | null> => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return null;

    current.setResourceError(null);
    current.setIsSavingResource(true);
    try {
      const payload: Record<string, unknown> = {
        community_id: current.activeCommunityId,
        type: "post",
        resource_role: "page",
        title: "Untitled page",
        body_md: null,
        url: null,
        pinned: false,
        module_id: moduleId ?? null,
      };
      if (current.includeFileKeyOnSave) {
        payload.file_key = null;
      }
      const created = await saveCloudCommunityResource<SessionT, ResourceT>({
        session,
        resourceId: null,
        isPatch: false,
        payload,
      });
      await loadCommunityResources(current.activeCommunityId, session);
      return created;
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : current.saveFailureMessage;
      current.setResourceError(message);
      return null;
    } finally {
      current.setIsSavingResource(false);
    }
  }, [loadCommunityResources]);

  return {
    loadCommunityResources,
    loadCommunityResourceContent,
    handleSaveCommunityResourceModule,
    handleSetCommunityResourceModuleStatus,
    handleDeleteCommunityResourceModule,
    handleReorderCommunityResourceModules,
    handleReorderCommunityResources,
    handleMoveCommunityResourceToModule,
    handleSaveCommunityResource,
    handleDeleteResource,
    handleCreatePageDraftFromSource,
    handleCreateBlankPageDraft,
  };
}
