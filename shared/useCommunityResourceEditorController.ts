import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

type ResourceLike = {
  id: string;
  module_id?: string | null;
  resource_role?: "page" | "source";
  resource_status?: "draft" | "review" | "published" | "processing" | "failed";
  title: string;
  url: string | null;
  body_md: string | null;
  pinned: boolean;
};

type UseCommunityResourceEditorControllerArgs = {
  setEditingResourceId: Dispatch<SetStateAction<string | null>>;
  setResourceTitleInput: Dispatch<SetStateAction<string>>;
  setResourceUrlInput: Dispatch<SetStateAction<string>>;
  setResourceBodyInput: Dispatch<SetStateAction<string>>;
  setResourcePinnedInput: Dispatch<SetStateAction<boolean>>;
  setResourceRoleInput?: Dispatch<SetStateAction<"page" | "source">>;
  setResourceStatusInput?: Dispatch<SetStateAction<"draft" | "review" | "published" | "processing" | "failed">>;
  setResourceError: Dispatch<SetStateAction<string | null>>;
  setShowResourceModal: Dispatch<SetStateAction<boolean>>;
  onReset?: () => void;
  onEdit?: (resource: ResourceLike) => void;
};

export function useCommunityResourceEditorController<ResourceT extends ResourceLike>(
  args: UseCommunityResourceEditorControllerArgs,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const resetResourceForm = useCallback(() => {
    const current = argsRef.current;
    current.setEditingResourceId(null);
    current.setResourceTitleInput("");
    current.setResourceUrlInput("");
    current.setResourceBodyInput("");
    current.setResourcePinnedInput(false);
    current.setResourceRoleInput?.("page");
    current.setResourceStatusInput?.("draft");
    current.setResourceError(null);
    current.onReset?.();
  }, []);

  const openNewResourceModal = useCallback(() => {
    const current = argsRef.current;
    resetResourceForm();
    current.setShowResourceModal(true);
  }, [resetResourceForm]);

  const closeResourceModal = useCallback(() => {
    const current = argsRef.current;
    current.setShowResourceModal(false);
    resetResourceForm();
  }, [resetResourceForm]);

  const handleEditResource = useCallback((resource: ResourceT) => {
    const current = argsRef.current;
    const resourceRole = resource.resource_role ?? "page";
    const resourceStatus = resource.resource_status === "published"
      ? (resourceRole === "source" ? "review" : "draft")
      : resource.resource_status ?? "draft";
    current.setEditingResourceId(resource.id);
    current.setResourceTitleInput(resource.title);
    current.setResourceUrlInput(resource.url ?? "");
    current.setResourceBodyInput(resource.body_md ?? "");
    current.setResourcePinnedInput(resource.pinned);
    current.setResourceRoleInput?.(resourceRole);
    current.setResourceStatusInput?.(resourceStatus);
    current.onEdit?.(resource);
    current.setResourceError(null);
    current.setShowResourceModal(true);
  }, []);

  return {
    resetResourceForm,
    openNewResourceModal,
    closeResourceModal,
    handleEditResource,
  };
}
