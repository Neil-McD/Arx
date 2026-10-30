import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { resolveAuthSubject, type AuthSessionLike } from "./authSession";

import {
  deleteCloudCommunityResource,
  deleteCloudCommunityResourceModule,
  ingestCloudCommunitySources,
  listCloudCommunityResourceModuleRows,
  listCloudCommunityResourceRevisions,
  listCloudCommunityResourceRows,
  moveCloudCommunityResourceToModule,
  prepareCloudCommunityBrandingField,
  reorderCloudCommunityResourceModules,
  reorderCloudCommunityResources,
  restoreCloudCommunityResourceRevision,
  saveCloudCommunityResource,
  saveCloudCommunityResourceModule,
  uploadCloudCommunityResourceImage,
  uploadCloudCommunityResourceSourceFile,
  type CloudCommunityResourceRevision,
  type CloudCommunitySourceIngestionResult,
} from "./cloudCommunityAdminGateway";

type SessionLike = unknown;
export type ResourceReadState = { status: "idle" | "pending" | "ready" | "error"; error: string | null; hasData: boolean };
type ResourceCollection = "resources" | "modules";
const emptyRead = (): ResourceReadState => ({ status: "idle", error: null, hasData: false });
const RESOURCE_DISPLAY_LIMIT = 200;

type ResourceLike = {
  id: string;
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
};

type ResourceModuleLike = {
  id: string;
  name: string;
  module_status?: "draft" | "live";
  description_md?: string | null;
  banner_url?: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  lesson_style?: "article" | "video" | null;
  sort_order?: number;
};

export type CommunitySourceIntakePhase = "saving" | "ingesting";

export type CommunitySourceIntakeResult = {
  saved: number;
  rejected: number;
  errors: string[];
  ingestion: CloudCommunitySourceIngestionResult | null;
};

const COMMUNITY_SOURCE_INTAKE_MAX_ITEMS = 10;
const COMMUNITY_SOURCE_INTAKE_MAX_FILE_BYTES = 2_500_000;
const COMMUNITY_SOURCE_READABLE_FILE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "xml",
  "html",
  "htm",
  "yaml",
  "yml",
  "toml",
  "log",
]);

function normalizeCommunitySourceUrl(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function getCommunitySourceUrlTitle(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./i, "")}${path}`.slice(0, 180);
  } catch {
    return rawUrl.slice(0, 180);
  }
}

function isReadableCommunitySourceFile(file: File): boolean {
  const mimeType = String(file.type ?? "").trim().toLowerCase();
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("csv") ||
    mimeType.includes("yaml") ||
    mimeType.includes("toml")
  ) {
    return true;
  }
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return COMMUNITY_SOURCE_READABLE_FILE_EXTENSIONS.has(extension);
}

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
  moduleDescriptionInput: string;
  moduleBannerUrlInput: string;
  moduleBannerFocusX: number;
  moduleBannerFocusY: number;
  moduleBannerZoom: number;
  moduleLessonStyleInput?: "article" | "video";
  editingResourceId: string | null;
  editingResourceModuleId: string | null;
  editingResourceModuleBannerStorageId: string | null;
  editingResourceModuleBannerUrl: string | null;
  beforeSaveValidate?: (payload: { title: string; description: string; rawUrl: string }) => Promise<string | null>;
  communityResources: ResourceT[];
  setCommunityResources: Dispatch<SetStateAction<ResourceT[]>>;
  setCommunityResourceModules: Dispatch<SetStateAction<ResourceModuleT[]>>;
  setIsSavingResource: Dispatch<SetStateAction<boolean>>;
  setIsSavingResourceModule: Dispatch<SetStateAction<boolean>>;
  setResourceError: Dispatch<SetStateAction<string | null>>;
  setResourceModuleError: Dispatch<SetStateAction<string | null>>;
  setShowResourceModuleModal: Dispatch<SetStateAction<boolean>>;
  setEditingResourceId: Dispatch<SetStateAction<string | null>>;
  setEditingResourceModuleId: Dispatch<SetStateAction<string | null>>;
  setEditingResourceModuleBannerStorageId: Dispatch<SetStateAction<string | null>>;
  setEditingResourceModuleBannerUrl: Dispatch<SetStateAction<string | null>>;
  setResourceTitleInput: Dispatch<SetStateAction<string>>;
  setResourceUrlInput: Dispatch<SetStateAction<string>>;
  setResourceBodyInput: Dispatch<SetStateAction<string>>;
  setResourcePinnedInput: Dispatch<SetStateAction<boolean>>;
  setResourceRoleInput: Dispatch<SetStateAction<"page" | "source">>;
  setResourceStatusInput: Dispatch<SetStateAction<"draft" | "review" | "published" | "processing" | "failed">>;
  setResourceModuleIdInput: Dispatch<SetStateAction<string | null>>;
  setModuleNameInput: Dispatch<SetStateAction<string>>;
  setModuleDescriptionInput: Dispatch<SetStateAction<string>>;
  setModuleBannerUrlInput: Dispatch<SetStateAction<string>>;
  setModuleBannerFocusX: Dispatch<SetStateAction<number>>;
  setModuleBannerFocusY: Dispatch<SetStateAction<number>>;
  setModuleBannerZoom: Dispatch<SetStateAction<number>>;
  setModuleLessonStyleInput?: Dispatch<SetStateAction<"article" | "video">>;
};

export function useCommunityResourceController<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
  ResourceModuleT extends ResourceModuleLike,
>(args: UseCommunityResourceControllerArgs<SessionT, ResourceT, ResourceModuleT>) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const resourceLoadGenerationRef = useRef(0);
  const moduleLoadGenerationRef = useRef(0);
  const scope = JSON.stringify([resolveAuthSubject(args.session as AuthSessionLike), args.activeCommunityId]);
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    resourceLoadGenerationRef.current += 1;
    moduleLoadGenerationRef.current += 1;
  }
  const [reads, setReads] = useState(() => ({ scope, resources: emptyRead(), modules: emptyRead() }));
  const scopedReads = reads.scope === scope ? reads : { scope, resources: emptyRead(), modules: emptyRead() };
  if (scopedReads !== reads) setReads(scopedReads);
  useEffect(() => () => {
    resourceLoadGenerationRef.current += 1;
    moduleLoadGenerationRef.current += 1;
  }, []);
  const sourceIntakeInFlightRef = useRef(false);

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
    current.setEditingResourceModuleBannerStorageId(null);
    current.setEditingResourceModuleBannerUrl(null);
    current.setModuleNameInput("");
    current.setModuleDescriptionInput("");
    current.setModuleBannerUrlInput("");
    current.setModuleBannerFocusX(0.5);
    current.setModuleBannerFocusY(0.5);
    current.setModuleBannerZoom(1);
    current.setModuleLessonStyleInput?.("article");
    if (clearError) {
      current.setResourceModuleError(null);
    }
  }, []);

  const refreshCommunityResources = useCallback(async (
    communityId: string, session: SessionT, collections: ResourceCollection[] = ["modules", "resources"],
  ): Promise<void> => {
    const current = argsRef.current;
    const account = resolveAuthSubject(session as AuthSessionLike);
    if (!account || communityId !== current.activeCommunityId || account !== resolveAuthSubject(current.session as AuthSessionLike)) return;
    const requestScope = scopeRef.current;
    const requests = [...new Set(collections)].map((collection) => {
      const ref = collection === "resources" ? resourceLoadGenerationRef : moduleLoadGenerationRef;
      const generation = ++ref.current;
      const isCurrent = () => scopeRef.current === requestScope && ref.current === generation;
      const update = (next: Partial<ResourceReadState>) => {
        if (!isCurrent()) return;
        setReads((previous) => {
          if (!isCurrent()) return previous;
          const owned = previous.scope === requestScope ? previous : { scope: requestScope, resources: emptyRead(), modules: emptyRead() };
          return { ...owned, [collection]: { ...owned[collection], ...next } };
        });
      };
      update({ status: "pending", error: null });
      return { collection, isCurrent, update };
    });
    let usableSession: SessionT | null;
    try {
      usableSession = await resolveUsableSession(session, current.ensureSession);
      if (resolveAuthSubject(usableSession as AuthSessionLike) !== account) {
        throw new Error("Your session could not be verified. Try again, or sign in again.");
      }
    } catch (error) {
      for (const request of requests) request.update({ status: "error", error: (error instanceof Error && error.message.trim()) || "Could not verify your session. Try again." });
      return;
    }
    await Promise.all(requests.map(async ({ collection, isCurrent, update }) => {
      if (!isCurrent()) return;
      try {
        const params = { session: usableSession, communityId, limit: RESOURCE_DISPLAY_LIMIT + 1 };
        if (collection === "modules") {
          const rows = await listCloudCommunityResourceModuleRows<SessionT | null, ResourceModuleT>(params);
          if (!isCurrent()) return;
          if (rows.length > RESOURCE_DISPLAY_LIMIT) throw new Error("This community exceeds the 200-course display limit. Contact the community team.");
          current.setCommunityResourceModules(rows);
        } else {
          const rows = await listCloudCommunityResourceRows<SessionT | null, ResourceT>(params);
          if (!isCurrent()) return;
          if (rows.length > RESOURCE_DISPLAY_LIMIT) throw new Error("This community exceeds the 200-resource display limit. Contact the community team.");
          current.setCommunityResources(rows);
        }
        update({ status: "ready", error: null, hasData: true });
      } catch (error) {
        update({ status: "error", error: (error instanceof Error && error.message.trim()) || "Could not refresh community resources. Try again." });
      }
    }));
  }, []);
  const loadCommunityResourceModules = useCallback((communityId: string, session: SessionT) =>
    refreshCommunityResources(communityId, session, ["modules"]), [refreshCommunityResources]);
  const loadCommunityResources = useCallback((communityId: string, session: SessionT) =>
    refreshCommunityResources(communityId, session), [refreshCommunityResources]);

  // keepEditing saves in place (the lesson editor's autosave): the editor stays
  // open on the same inputs and the list reloads with the saved page.
  const handleSaveCommunityResource = useCallback(async (options?: { keepEditing?: boolean }) => {
    const keepEditing = options?.keepEditing === true;
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
      current.setResourceError("Add content or a link.");
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

      if (!keepEditing) resetResourceEditor(true);
      await loadCommunityResources(current.activeCommunityId, session);
      return true;
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : current.saveFailureMessage;
      // A body that's too long comes back with what to change; show just that.
      const tooLong = /community_resource_body_too_long: ([^\n]+)/.exec(message);
      current.setResourceError(tooLong ? tooLong[1] : message);
      return false;
    } finally {
      current.setIsSavingResource(false);
    }
  }, [loadCommunityResources, resetResourceEditor]);

  // Version history: a lesson's earlier versions, and putting one back.
  // Undo after Done puts back the text the editing began with.
  const handleListCommunityResourceRevisions = useCallback(async (resourceId: string): Promise<CloudCommunityResourceRevision[]> => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session) throw new Error("Sign in again to see earlier versions.");
    return listCloudCommunityResourceRevisions({ session, resourceId });
  }, []);

  const handleRestoreCommunityResource = useCallback(async (
    target: { revisionId: string } | { resourceId: string; title: string; bodyMd: string | null },
  ): Promise<boolean> => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return false;
    try {
      if ("revisionId" in target) {
        await restoreCloudCommunityResourceRevision({ session, revisionId: target.revisionId });
      } else {
        await saveCloudCommunityResource({
          session,
          resourceId: target.resourceId,
          isPatch: true,
          payload: { title: target.title, body_md: target.bodyMd },
        });
      }
      await loadCommunityResources(current.activeCommunityId, session);
      return true;
    } catch (error) {
      current.setResourceError(error instanceof Error ? error.message : "Couldn't restore that version.");
      return false;
    }
  }, [loadCommunityResources]);

  const handleUploadCommunityResourceImage = useCallback(async (file: File | Blob) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) throw new Error("Sign in again to upload images.");
    return uploadCloudCommunityResourceImage({ session, communityId: current.activeCommunityId, file });
  }, []);

  const handleSaveCommunityResourceModule = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return;

    const name = current.moduleNameInput.trim();
    if (!name) {
      current.setResourceModuleError("Course name is required.");
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
          ...(current.moduleLessonStyleInput ? { lesson_style: current.moduleLessonStyleInput } : {}),
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
          : "Failed to save course.";
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
          : "Failed to delete course.";
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
            : "Failed to update course status.";
        current.setResourceModuleError(message);
        return false;
      }
    },
    [loadCommunityResources],
  );

  // Article or Video course, switched from the lesson page.
  const handleSetCommunityResourceModuleLessonStyle = useCallback(
    async (module: ResourceModuleT, lessonStyle: "article" | "video") => {
      const current = argsRef.current;
      const session = await resolveUsableSession(current.session, current.ensureSession);
      if (!session || !current.activeCommunityId) return false;
      const previousModules: ResourceModuleT[] = [];
      current.setCommunityResourceModules((modules) => {
        previousModules.splice(0, previousModules.length, ...modules);
        return modules.map((candidate) =>
          candidate.id === module.id
            ? ({ ...candidate, lesson_style: lessonStyle } as ResourceModuleT)
            : candidate,
        );
      });
      try {
        await saveCloudCommunityResourceModule({
          session,
          moduleId: module.id,
          isPatch: true,
          payload: { lesson_style: lessonStyle },
        });
        return true;
      } catch (error) {
        current.setCommunityResourceModules(previousModules);
        const message = typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to update the lesson style.";
        current.setResourceModuleError(message);
        return false;
      }
    },
    [],
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
      await loadCommunityResourceModules(current.activeCommunityId, session);
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
      await refreshCommunityResources(current.activeCommunityId, session, ["resources"]);
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
  }, [refreshCommunityResources]);

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
        await refreshCommunityResources(current.activeCommunityId, session, ["resources"]);
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
    [refreshCommunityResources],
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

  const handleCreateBlankPageDraft = useCallback(async (
    moduleId: string,
    lesson?: { order: number; stage?: string; stage_order?: number },
  ): Promise<ResourceT | null> => {
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
        title: "Untitled lesson",
        body_md: null,
        url: null,
        pinned: false,
        module_id: moduleId,
        ...(lesson ? { lesson } : {}),
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

  const handleAddCommunitySources = useCallback(async (input: {
    links: string[];
    files: File[];
    retryExisting?: boolean;
    onPhase?: (phase: CommunitySourceIntakePhase) => void;
  }): Promise<CommunitySourceIntakeResult | null> => {
    if (sourceIntakeInFlightRef.current) return null;
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return null;

    const rawLinks = Array.isArray(input.links) ? input.links : [];
    const rawFiles = Array.isArray(input.files) ? input.files : [];
    const requestedCount = rawLinks.length + rawFiles.length;
    if (!input.retryExisting && requestedCount === 0) {
      return {
        saved: 0,
        rejected: 1,
        errors: ["Add at least one link or file."],
        ingestion: null,
      };
    }
    if (requestedCount > COMMUNITY_SOURCE_INTAKE_MAX_ITEMS) {
      return {
        saved: 0,
        rejected: requestedCount,
        errors: [`Add up to ${COMMUNITY_SOURCE_INTAKE_MAX_ITEMS} sources at a time.`],
        ingestion: null,
      };
    }

    sourceIntakeInFlightRef.current = true;
    input.onPhase?.("saving");
    const communityId = current.activeCommunityId;
    const errors: string[] = [];
    let saved = 0;
    let rejected = 0;
    let ingestion: CloudCommunitySourceIngestionResult | null = null;

    try {
      const uniqueLinks = Array.from(
        new Set(rawLinks.map(normalizeCommunitySourceUrl).filter((url): url is string => Boolean(url))),
      );
      const existingSourceUrls = new Set(
        current.communityResources
          .filter((resource) => resource.resource_role === "source")
          .map((resource) => normalizeCommunitySourceUrl(resource.url ?? ""))
          .filter((url): url is string => Boolean(url)),
      );
      const newLinks = uniqueLinks.filter((url) => !existingSourceUrls.has(url));
      rejected += rawLinks.length - uniqueLinks.length;
      if (rawLinks.length > 0 && uniqueLinks.length === 0) {
        errors.push("Add a valid public http or https link.");
      } else if (rawLinks.length !== uniqueLinks.length) {
        errors.push("Some links were invalid or duplicated and were skipped.");
      }

      for (const url of newLinks) {
        try {
          await saveCloudCommunityResource({
            session,
            resourceId: null,
            isPatch: false,
            payload: {
              community_id: communityId,
              type: "link",
              resource_role: "source",
              title: getCommunitySourceUrlTitle(url),
              body_md: null,
              url,
              pinned: false,
              module_id: null,
            },
          });
          saved += 1;
        } catch (error) {
          rejected += 1;
          errors.push(error instanceof Error ? error.message : `Could not add ${url}.`);
        }
      }

      for (const file of rawFiles) {
        if (!file || !String(file.name ?? "").trim()) {
          rejected += 1;
          errors.push("A selected file did not have a readable name.");
          continue;
        }
        if (file.size <= 0 || file.size > COMMUNITY_SOURCE_INTAKE_MAX_FILE_BYTES) {
          rejected += 1;
          errors.push(`${file.name} must be smaller than 2.5 MB.`);
          continue;
        }
        if (!isReadableCommunitySourceFile(file)) {
          rejected += 1;
          errors.push(`${file.name} is not a supported text file yet.`);
          continue;
        }
        try {
          const fileKey = await uploadCloudCommunityResourceSourceFile({
            session,
            communityId,
            file,
          });
          await saveCloudCommunityResource({
            session,
            resourceId: null,
            isPatch: false,
            payload: {
              community_id: communityId,
              type: "file",
              resource_role: "source",
              title: file.name.slice(0, 180),
              body_md: null,
              url: null,
              file_key: fileKey,
              source_original_filename: file.name,
              source_original_mime_type: file.type || null,
              source_original_bytes: file.size,
              pinned: false,
              module_id: null,
            },
          });
          saved += 1;
        } catch (error) {
          rejected += 1;
          errors.push(error instanceof Error ? error.message : `Could not add ${file.name}.`);
        }
      }

      if (saved > 0 || input.retryExisting) {
        input.onPhase?.("ingesting");
        try {
          ingestion = await ingestCloudCommunitySources({
            session,
            communityId,
            limit: COMMUNITY_SOURCE_INTAKE_MAX_ITEMS,
            retryFailed: input.retryExisting === true,
          });
          if (!ingestion) {
            errors.push("Sources were saved, but readiness could not be confirmed. Retry them here.");
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Sources were saved, but could not be read yet.");
        }
      }
    } finally {
      await loadCommunityResources(communityId, session);
      sourceIntakeInFlightRef.current = false;
    }

    return { saved, rejected, errors, ingestion };
  }, [loadCommunityResources]);

  return {
    resourceRead: scopedReads.resources,
    moduleRead: scopedReads.modules,
    refreshCommunityResources,
    loadCommunityResourceModules,
    loadCommunityResources,
    handleSaveCommunityResourceModule,
    handleSetCommunityResourceModuleStatus,
    handleSetCommunityResourceModuleLessonStyle,
    handleListCommunityResourceRevisions,
    handleRestoreCommunityResource,
    handleDeleteCommunityResourceModule,
    handleReorderCommunityResourceModules,
    handleReorderCommunityResources,
    handleMoveCommunityResourceToModule,
    handleSaveCommunityResource,
    handleUploadCommunityResourceImage,
    handleDeleteResource,
    handleCreateBlankPageDraft,
    handleAddCommunitySources,
  };
}
