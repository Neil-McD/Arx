import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

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
  supabaseSession: SessionT | null;
  getSupabaseUrl: () => string | null;
  getSupabaseAnonKey?: () => string | null;
  requireAnonKey: boolean;
  missingConfigMessage: string;
  parseEmbedUrl: (url: string) => unknown;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
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
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setIsLoadingResources(true);
    try {
      let response: Response;
      try {
        response = await current.fetchWithSupabaseAuth(
          `${url}/rest/v1/community_resources?select=id,community_id,type,title,body_md,url,file_key,pinned,created_at&community_id=eq.${communityId}&order=pinned.desc,created_at.desc&limit=200`,
          {},
          session,
        );
      } catch {
        return;
      }
      if (!response.ok) return;
      const rows = (await response.json()) as ResourceT[];
      current.setCommunityResources(rows);
    } finally {
      current.setIsLoadingResources(false);
    }
  }, []);

  const handleSaveCommunityResource = useCallback(async () => {
    const current = argsRef.current;
    if (!current.supabaseSession || !current.activeCommunityId) return;

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

    const url = current.getSupabaseUrl();
    const anonKey = current.getSupabaseAnonKey?.();
    if (!url || (current.requireAnonKey && !anonKey)) {
      current.setResourceError(current.missingConfigMessage);
      current.setIsSavingResource(false);
      return;
    }

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
      const response = await current.fetchWithSupabaseAuth(
        isPatch
          ? `${url}/rest/v1/community_resources?id=eq.${current.editingResourceId}`
          : `${url}/rest/v1/community_resources`,
        {
          method: isPatch ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(payload),
        },
        current.supabaseSession,
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || current.saveFailureMessage);
      }

      current.setShowResourceModal(false);
      resetResourceEditor(true);
      await loadCommunityResources(current.activeCommunityId, current.supabaseSession);
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
    if (!current.supabaseSession || !current.activeCommunityId) return;

    const url = current.getSupabaseUrl();
    const anonKey = current.getSupabaseAnonKey?.();
    if (!url || (current.requireAnonKey && !anonKey)) return;

    let response: Response;
    try {
      response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/community_resources?id=eq.${resourceId}`,
        { method: "DELETE" },
        current.supabaseSession,
      );
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : current.deleteFailureMessage;
      current.setResourceError(message);
      return;
    }
    if (!response.ok) {
      const errText = await response.text();
      current.setResourceError(errText || current.deleteFailureMessage);
      return;
    }
    if (current.editingResourceId === resourceId) {
      resetResourceEditor(current.clearErrorWhenEditingDeleted);
    }
    await loadCommunityResources(current.activeCommunityId, current.supabaseSession);
  }, [loadCommunityResources, resetResourceEditor]);

  return {
    loadCommunityResources,
    handleSaveCommunityResource,
    handleDeleteResource,
  };
}
