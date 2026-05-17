import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  abortAllScopedRequests, beginScopedAbortRequest, finishScopedAbortRequest, isAbortError, } from "./communityFetchAbortScope";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

import {
  deleteCloudCommunityResource,
  deleteCloudCommunityResourceModule,
  listCloudCommunityResourceModuleRows,
  listCloudCommunityResourceRows,
  prepareCloudCommunityBrandingField,
  reorderCloudCommunityResourceModules,
  reorderCloudCommunityResources,
  saveCloudCommunityResource,
  saveCloudCommunityResourceModule,
} from "./cloudCommunityAdminGateway";

type SessionLike = unknown;

type ResourceLike = {
  id: string;
  module_id?: string | null;
  type: string;
  title: string;
  body_md: string | null;
  url: string | null;
  pinned: boolean;
  sort_order?: number | null;
  created_at?: string;
};

type ResourceModuleLike = {
  id: string;
  name: string;
  description_md: string | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
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
  resourceModuleIdInput: string | null;
  moduleNameInput: string;
  moduleDescriptionInput: string;
  moduleBannerUrlInput: string;
  moduleBannerFocusX: number;
  moduleBannerFocusY: number;
  moduleBannerZoom: number;
  editingResourceId: string | null;
  editingResourceModuleId: string | null;
  editingResourceModuleBannerStorageId: string | null;
  editingResourceModuleBannerUrl: string | null;
  beforeSaveValidate?: (payload: { title: string; description: string; rawUrl: string }) => Promise<string | null>;
  setCommunityResources: Dispatch<SetStateAction<ResourceT[]>>;
  setCommunityResourceModules: Dispatch<SetStateAction<ResourceModuleT[]>>;
  setIsLoadingResources: Dispatch<SetStateAction<boolean>>;
  setIsLoadingResourceModules: Dispatch<SetStateAction<boolean>>;
  setIsSavingResource: Dispatch<SetStateAction<boolean>>;
  setIsSavingResourceModule: Dispatch<SetStateAction<boolean>>;
  setResourceError: Dispatch<SetStateAction<string | null>>;
  setResourceModuleError: Dispatch<SetStateAction<string | null>>;
  setShowResourceModuleModal: Dispatch<SetStateAction<boolean>>;
  setShowResourceModal: Dispatch<SetStateAction<boolean>>;
  setEditingResourceId: Dispatch<SetStateAction<string | null>>;
  setEditingResourceModuleId: Dispatch<SetStateAction<string | null>>;
  setEditingResourceModuleBannerStorageId: Dispatch<SetStateAction<string | null>>;
  setEditingResourceModuleBannerUrl: Dispatch<SetStateAction<string | null>>;
  setResourceTitleInput: Dispatch<SetStateAction<string>>;
  setResourceUrlInput: Dispatch<SetStateAction<string>>;
  setResourceBodyInput: Dispatch<SetStateAction<string>>;
  setResourcePinnedInput: Dispatch<SetStateAction<boolean>>;
  setResourceModuleIdInput: Dispatch<SetStateAction<string | null>>;
  setModuleNameInput: Dispatch<SetStateAction<string>>;
  setModuleDescriptionInput: Dispatch<SetStateAction<string>>;
  setModuleBannerUrlInput: Dispatch<SetStateAction<string>>;
  setModuleBannerFocusX: Dispatch<SetStateAction<number>>;
  setModuleBannerFocusY: Dispatch<SetStateAction<number>>;
  setModuleBannerZoom: Dispatch<SetStateAction<number>>;
};

export function useCommunityResourceController<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
  ResourceModuleT extends ResourceModuleLike,
>(args: UseCommunityResourceControllerArgs<SessionT, ResourceT, ResourceModuleT>) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const fetchAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const resourceLoadGenerationRef = useRef(0);
  const moduleLoadGenerationRef = useRef(0);

  const resetResourceEditor = useCallback((clearError: boolean) => {
    const current = argsRef.current;
    current.setEditingResourceId(null);
    current.setResourceTitleInput("");
    current.setResourceUrlInput("");
    current.setResourceBodyInput("");
    current.setResourcePinnedInput(false);
    current.setResourceModuleIdInput(null);
    if (clearError) {
      current.setResourceError(null);
    }
  }, []);

  const resetModuleEditor = useCallback((clearError: boolean) => {
    const current = argsRef.current;
    current.setEditingResourceModuleId(null);
    current.setEditingResourceModuleBannerStorageId(null);
    current.setEditingResourceModuleBannerUrl(null);
    current.setModuleNameInput("");
    current.setModuleDescriptionInput("");
    current.setModuleBannerUrlInput("");
    current.setModuleBannerFocusX(0.5);
    current.setModuleBannerFocusY(0.5);
    current.setModuleBannerZoom(1);
    if (clearError) {
      current.setResourceModuleError(null);
    }
  }, []);

  const loadCommunityResourceModules = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const generation = (moduleLoadGenerationRef.current += 1);
    const fetchController = beginScopedAbortRequest({
      inFlightByKind: fetchAbortControllersRef.current,
      kind: "community_resource_modules_list",
    });
    current.setIsLoadingResourceModules(true);
    try {
      try {
        const rows = await listCloudCommunityResourceModuleRows<SessionT, ResourceModuleT>({
          session: usableSession,
          communityId,
          limit: 200,
          init: { signal: fetchController.signal },
        });
        current.setCommunityResourceModules(rows);
      } catch (error) {
        if (isAbortError(error)) return;
        return;
      }
    } finally {
      finishScopedAbortRequest({
        inFlightByKind: fetchAbortControllersRef.current,
        kind: "community_resource_modules_list",
        controller: fetchController,
      });
      if (moduleLoadGenerationRef.current === generation) {
        current.setIsLoadingResourceModules(false);
      }
    }
  }, []);

  const loadCommunityResources = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const generation = (resourceLoadGenerationRef.current += 1);
    const fetchController = beginScopedAbortRequest({
      inFlightByKind: fetchAbortControllersRef.current,
      kind: "community_resources_list",
    });
    current.setIsLoadingResources(true);
    try {
      try {
        const rows = await listCloudCommunityResourceRows<SessionT, ResourceT>({
          session: usableSession,
          communityId,
          limit: 200,
          init: { signal: fetchController.signal },
        });
        current.setCommunityResources(rows);
        await loadCommunityResourceModules(communityId, usableSession);
      } catch (error) {
        if (isAbortError(error)) return;
        return;
      }
    } finally {
      finishScopedAbortRequest({
        inFlightByKind: fetchAbortControllersRef.current,
        kind: "community_resources_list",
        controller: fetchController,
      });
      if (resourceLoadGenerationRef.current === generation) {
        current.setIsLoadingResources(false);
      }
    }
  }, [loadCommunityResourceModules]);

  useEffect(() => {
    return () => {
      abortAllScopedRequests(fetchAbortControllersRef.current);
    };
  }, []);

  const handleSaveCommunityResource = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return;

    const title = current.resourceTitleInput.trim();
    if (!title) {
      current.setResourceError("Title is required.");
      return;
    }

    const description = current.resourceBodyInput.trim();
    if (!description) {
      current.setResourceError("Description is required.");
      return;
    }

    const rawUrl = current.resourceUrlInput.trim();

    if (current.beforeSaveValidate) {
      const validationError = await current.beforeSaveValidate({ title, description, rawUrl });
      if (validationError) {
        current.setResourceError(validationError);
        return;
      }
    }

    const embedInfo = rawUrl ? current.parseEmbedUrl(rawUrl) : null;
    const resourceType = embedInfo ? "embed" : rawUrl ? "link" : "post";

    current.setResourceError(null);
    current.setIsSavingResource(true);
    const basePayload: Record<string, unknown> = {
      type: resourceType,
      title,
      body_md: description,
      url: rawUrl ? rawUrl : null,
      pinned: current.resourcePinnedInput,
      module_id: current.resourceModuleIdInput,
    };
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
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : current.saveFailureMessage;
      current.setResourceError(message);
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
      current.setResourceModuleError("Module name is required.");
      return;
    }

    current.setResourceModuleError(null);
    current.setIsSavingResourceModule(true);
    try {
      const isPatch = Boolean(current.editingResourceModuleId);
      const bannerField = await prepareCloudCommunityBrandingField({
        session,
        kind: "banner",
        nextValue: current.moduleBannerUrlInput,
        currentStorageId: current.editingResourceModuleBannerStorageId,
        currentResolvedUrl: current.editingResourceModuleBannerUrl,
      });
      await saveCloudCommunityResourceModule({
        session,
        moduleId: isPatch ? current.editingResourceModuleId : null,
        isPatch,
        payload: {
          ...(isPatch ? {} : { community_id: current.activeCommunityId }),
          name,
          description_md: current.moduleDescriptionInput.trim() || null,
          banner_storage_id: bannerField.storageId ?? null,
          banner_url: bannerField.url ?? null,
          banner_focus_x: current.moduleBannerFocusX,
          banner_focus_y: current.moduleBannerFocusY,
          banner_zoom: current.moduleBannerZoom,
        },
      });
      current.setShowResourceModuleModal(false);
      resetModuleEditor(true);
      await loadCommunityResourceModules(current.activeCommunityId, session);
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to save module.";
      current.setResourceModuleError(message);
    } finally {
      current.setIsSavingResourceModule(false);
    }
  }, [loadCommunityResourceModules, resetModuleEditor]);

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
          : "Failed to delete module.";
      current.setResourceModuleError(message);
      return false;
    }
    if (current.editingResourceModuleId === moduleId) {
      current.setShowResourceModuleModal(false);
      resetModuleEditor(true);
    }
    await loadCommunityResourceModules(current.activeCommunityId, session);
    await loadCommunityResources(current.activeCommunityId, session);
    return true;
  }, [loadCommunityResourceModules, loadCommunityResources, resetModuleEditor]);

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
      await loadCommunityResourceModules(current.activeCommunityId, session);
      return true;
    } catch (error) {
      current.setCommunityResourceModules(previousModules);
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to reorder modules.";
      current.setResourceModuleError(message);
      return false;
    }
  }, [loadCommunityResourceModules]);

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

  return {
    loadCommunityResourceModules,
    loadCommunityResources,
    handleSaveCommunityResourceModule,
    handleDeleteCommunityResourceModule,
    handleReorderCommunityResourceModules,
    handleReorderCommunityResources,
    handleSaveCommunityResource,
    handleDeleteResource,
  };
}
