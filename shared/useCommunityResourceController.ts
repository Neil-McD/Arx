import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  abortAllScopedRequests, beginScopedAbortRequest, finishScopedAbortRequest, isAbortError, } from "./communityFetchAbortScope";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

import {
  deleteCloudCommunityResource,
  listCloudCommunityResourceRows,
  saveCloudCommunityResource,
} from "./cloudCommunityAdminGateway";

type SessionLike = unknown;

type ResourceLike = {
  id: string;
  type: string;
  title: string;
  body_md: string | null;
  url: string | null;
  pinned: boolean;
};

type UseCommunityResourceControllerArgs<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
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
  editingResourceId: string | null;
  beforeSaveValidate?: (payload: { title: string; description: string; rawUrl: string }) => Promise<string | null>;
  setCommunityResources: Dispatch<SetStateAction<ResourceT[]>>;
  setIsLoadingResources: Dispatch<SetStateAction<boolean>>;
  setIsSavingResource: Dispatch<SetStateAction<boolean>>;
  setResourceError: Dispatch<SetStateAction<string | null>>;
  setResourceSuccess: Dispatch<SetStateAction<boolean>>;
  setShowResourceModal: Dispatch<SetStateAction<boolean>>;
  setEditingResourceId: Dispatch<SetStateAction<string | null>>;
  setResourceTitleInput: Dispatch<SetStateAction<string>>;
  setResourceUrlInput: Dispatch<SetStateAction<string>>;
  setResourceBodyInput: Dispatch<SetStateAction<string>>;
  setResourcePinnedInput: Dispatch<SetStateAction<boolean>>;
};

export function useCommunityResourceController<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
>(args: UseCommunityResourceControllerArgs<SessionT, ResourceT>) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const fetchAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const resourceLoadGenerationRef = useRef(0);

  const resetResourceEditor = useCallback((clearError: boolean) => {
    const current = argsRef.current;
    current.setEditingResourceId(null);
    current.setResourceTitleInput("");
    current.setResourceUrlInput("");
    current.setResourceBodyInput("");
    current.setResourcePinnedInput(false);
    if (clearError) {
      current.setResourceError(null);
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
  }, []);

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
      current.setResourceSuccess(true);
      window.setTimeout(() => current.setResourceSuccess(false), 2000);
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
    loadCommunityResources,
    handleSaveCommunityResource,
    handleDeleteResource,
  };
}
