import type {
  CommunityFunnelConfig,
  CommunityPublicFace,
} from "../../../shared/communityTypes";
import type { NavSnapshotBase } from "../../../shared/navSnapshot";
import type { CommunityVisualIdentity } from "../../../shared/communityVisualIdentity";

export type WebCommunityRecord = {
  id: string;
  slug: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  builder_knowledge_setup_pending?: boolean;
  owner_id: string;
  created_at: string;
  updated_at: string;
  branding_revision?: number | null;
  visual_identity?: CommunityVisualIdentity | null;
};

export type WebPublicCommunityRecord = {
  id?: string;
  slug: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  host?: Omit<CommunityPublicFace, "user_id"> | null;
  funnel?: CommunityFunnelConfig | null;
  about_presentation?: "page" | "funnel" | null;
  about_media?: Array<{ kind: "image" | "video"; url: string; caption: string }> | null;
  about_text?: string | null;
  about_show_members?: boolean | null;
  member_count?: number | null;
  member_faces_preview?: CommunityPublicFace[] | null;
  admin_count?: number | null;
  online_count?: number | null;
  online_count_capped?: boolean | null;
  online_faces?: CommunityPublicFace[] | null;
  branding_revision?: number | null;
  visual_identity?: CommunityVisualIdentity | null;
};

export type WebCommunityVoiceTranscriptTarget = {
  appendTranscript: (transcript: string) => void;
  focusInput?: () => void;
};

export type WebCommunityVoiceButtonOwner = "main" | "drawer";

export type WebNavSnapshot = NavSnapshotBase & {
  routePath: string;
};
