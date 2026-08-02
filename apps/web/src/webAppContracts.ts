import type {
  CommunityFunnelConfig,
  UserProfile,
} from "../../../shared/communityTypes";
import type { NavSnapshotBase } from "../../../shared/navSnapshot";

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
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type WebPublicCommunityRecord = {
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
  created_at: string;
  updated_at: string;
  funnel?: CommunityFunnelConfig | null;
  member_count?: number | null;
  admin_count?: number | null;
  online_count?: number | null;
  online_count_capped?: boolean | null;
  online_faces?: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  }> | null;
};

export type WebCommunityVoiceTranscriptTarget = {
  appendTranscript: (transcript: string) => void;
  focusInput?: () => void;
};

export type WebCommunityVoiceButtonOwner = "main" | "drawer";

export type WebMyCommunityJoinRequest = {
  community_id: string;
  status: string;
  updated_at: string;
  denied_at?: string | null;
  reapply_at?: string | null;
  denied_until?: string | null;
};

export type WebPersonalMemoryItem = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type WebNavSnapshot = NavSnapshotBase & {
  routePath: string;
};

export type WebUserProfilesById = Record<string, UserProfile>;
