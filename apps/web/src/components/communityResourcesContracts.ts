import type { CommunityLessonElement, CommunityLessonFields } from "../../../../shared/communityLessonContract";
import type {
  CommunitySourceIntakePhase,
  CommunitySourceIntakeResult,
  ResourceReadState,
} from "../../../../shared/useCommunityResourceController";

export type CommunityResource = {
  id: string;
  module_id: string | null;
  directory_uri: string;
  directory_path: string;
  type: "post" | "embed" | "link" | "file";
  resource_role: "page" | "source";
  resource_status: "draft" | "review" | "published" | "processing" | "failed";
  source_resource_id?: string | null;
  title: string;
  body_md: string | null;
  body_chars?: number | null;
  url: string | null;
  file_key?: string | null;
  source_ingestion_status?: "not_required" | "queued" | "processing" | "ready" | "failed";
  source_ingestion_kind?: "manual" | "url" | "file" | "google_drive" | "github";
  source_ingestion_error?: string | null;
  source_ingestion_attempted_at?: string | null;
  source_ingested_at?: string | null;
  source_original_filename?: string | null;
  source_original_mime_type?: string | null;
  source_original_bytes?: number | null;
  source_external_provider?: "google_drive" | "github" | null;
  source_external_id?: string | null;
  source_external_name?: string | null;
  source_external_url?: string | null;
  source_external_mime_type?: string | null;
  source_external_modified_at?: string | null;
  pinned: boolean;
  sort_order: number | null;
  // Board fields (stage, order, gate...) when the page is a lesson.
  lesson?: CommunityLessonFields | null;
  // A lesson's follow-along elements without their answers, when the server sends them.
  lesson_elements?: CommunityLessonElement[] | null;
  // In a track sold through an offer the member doesn't have: listed without its text.
  paywalled?: boolean;
  created_at: string;
};

// How a course's lessons read: a clean article page, or a classic video
// course with the text on a card under the video.
export type CommunityResourceModuleLessonStyle = "article" | "video";

export type CommunityResourceModule = {
  id: string;
  directory_uri: string;
  directory_path: string;
  module_status: "draft" | "live";
  name: string;
  description_md: string | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x: number | null;
  banner_focus_y: number | null;
  banner_zoom: number | null;
  lesson_style?: CommunityResourceModuleLessonStyle | null;
  sort_order: number;
  is_virtual?: boolean;
};

export type CommunityResourcesCapabilities = {
  hasActiveCommunity: boolean;
  activeCommunityId: string | null;
  activeCommunityName: string | null;
  // Where the community's site lives, for interactive widgets in lessons.
  activeCommunitySiteOrigin?: string | null;
  canOperateResources: boolean;
};

export type CommunityResourcesState = {
  resourceRead: ResourceReadState;
  moduleRead: ResourceReadState;
  isLoadingResources: boolean;
  isLoadingResourceModules: boolean;
  modules: CommunityResourceModule[];
  resources: CommunityResource[];
  selectedModuleId: string | null;
};

export type CommunityResourcesActions = {
  retryRead: (collection: "resources" | "modules") => Promise<void>;
  handleSelectModule: (moduleId: string | null) => void;
  openNewModuleModal: () => void;
  handleEditModule: (module: CommunityResourceModule) => void;
  handleSetModuleStatus: (module: CommunityResourceModule, status: "draft" | "live") => Promise<boolean> | boolean;
  handleSetModuleLessonStyle?: (module: CommunityResourceModule, lessonStyle: CommunityResourceModuleLessonStyle) => Promise<boolean> | boolean;
  handleDeleteModule: (moduleId: string) => Promise<boolean> | boolean;
  handleReorderModules: (moduleIds: string[]) => Promise<boolean> | boolean;
  handleReorderResources: (moduleId: string | null, resourceIds: string[]) => Promise<boolean> | boolean;
  handleMoveResourceToModule: (
    resourceId: string,
    targetModuleId: string | null,
    beforeResourceId?: string | null,
  ) => Promise<boolean> | boolean;
  handleAddCommunitySources: (input: {
    links: string[];
    files: File[];
    retryExisting?: boolean;
    onPhase?: (phase: CommunitySourceIntakePhase) => void;
  }) => Promise<CommunitySourceIntakeResult | null>;
  resourceEditor: {
    editingResourceId: string | null;
    titleInput: string;
    urlInput: string;
    bodyInput: string;
    pinnedInput: boolean;
    roleInput: "page" | "source";
    error: string | null;
    isSaving: boolean;
    beginInlineEditResource: (resource: CommunityResource) => void;
    cancelInlineEditResource: () => void;
    saveInlineEditResource: (options?: { keepEditing?: boolean }) => Promise<boolean>;
    // Puts a picture in Polynet's storage and returns its address (lesson editor).
    uploadImage?: (file: File) => Promise<string>;
    // Version history (earlier versions, newest first) and putting one back;
    // Undo after Done restores the text the editing began with.
    listVersions?: (resourceId: string) => Promise<CommunityResourceVersion[]>;
    restoreVersion?: (target: CommunityResourceRestoreTarget) => Promise<boolean>;
    onChangeTitle: (value: string) => void;
    onChangeUrl: (value: string) => void;
    onChangeBody: (value: string) => void;
    onChangePinned: (value: boolean) => void;
  };
  handleDeleteResource: (resourceId: string) => Promise<boolean> | boolean;
  handleCreateBlankPageDraft: (moduleId: string, lesson?: { order: number; stage?: string; stage_order?: number }) => Promise<CommunityResource | null>;
};

export type CommunityResourceVersion = {
  id: string;
  resource_id: string;
  title: string;
  saved_at: string | null;
  replaced_at: string | null;
  body_chars: number;
  body_md: string;
};

export type CommunityResourceRestoreTarget =
  | { revisionId: string }
  | { resourceId: string; title: string; bodyMd: string | null };
