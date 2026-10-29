import type { AccountSetupStatus } from "./accountSetup";
import type { SocialProfileLinks } from "./socialProfileLinks";
import type { CommunityVisualIdentity } from "./communityVisualIdentity";

export type CommunityEntryPolicy = "open" | "approval" | "paid_subscription";
export type CommunityBillingPeriod = "monthly" | "annual";

export type CommunityPublicFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color?: string | null;
  initials?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export type CommunityPresenceFace = CommunityPublicFace;

export type CommunityPresenceSummary = {
  member_count?: number | null;
  admin_count?: number | null;
  online_count?: number | null;
  online_count_capped?: boolean | null;
  online_faces?: CommunityPresenceFace[] | null;
  online_user_ids?: string[] | null;
};

export type CommunityDirectoryMember = {
  id: string;
  community_id: string;
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  role: string;
  co_creator?: boolean;
  created_at: string;
  last_active_at: string;
};

export type CommunityShellCommunity = {
  id: string;
  slug: string | null;
  name: string;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  branding_revision?: number | null;
  visual_identity?: CommunityVisualIdentity | null;
};

export type PublicPlanSummary = {
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: CommunityBillingPeriod;
};

export type CommunityFunnelHeroMediaKind = "image" | "video";

export type CommunityCustomFunnelSlot = "custom_1" | "custom_2";

export type CommunityFunnelSlot = "default" | CommunityCustomFunnelSlot;

export type CommunityFunnelPillarV2 = {
  title: string;
  body: string;
};

/**
 * Funnel V2 is bounded sales content, not page structure. Polynet owns the
 * layout, theme, VSL placement, member proof, pricing, access language, and
 * CTAs so every public funnel remains safe and on-brand.
 */
export type CommunityFunnelContentV2 = {
  version: 2;
  headline: string;
  subheadline: string;
  pillars: [
    CommunityFunnelPillarV2,
    CommunityFunnelPillarV2,
    CommunityFunnelPillarV2,
  ];
  long_form_markdown: string;
};

export type CommunityFunnelConfig = {
  hero_media_url: string | null;
  hero_media_kind: CommunityFunnelHeroMediaKind;
  active_slot: CommunityFunnelSlot;
  published_vsl_url: string | null;
  published_content_v2: CommunityFunnelContentV2 | null;
};

export type DiscoverCommunitySnapshot = {
  id?: string | null;
  slug: string;
  name: string;
  one_liner: string | null;
  about?: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: "published" | "unlisted";
  entry_policy?: CommunityEntryPolicy | null;
  external_funnel_url?: string | null;
  created_at: string;
  updated_at: string;
  active_plan?: PublicPlanSummary | null;
  funnel?: CommunityFunnelConfig | null;
  member_count?: number | null;
  branding_revision?: number | null;
  visual_identity?: CommunityVisualIdentity | null;
};

export type CommunityAvatarSummary = {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
  branding_revision?: number | null;
  visual_identity?: CommunityVisualIdentity | null;
};

export type ProfileCommunityContext = {
  // Owned and co-created (co_creator: true), unless the person hides them.
  owned_communities: Array<CommunityAvatarSummary & { co_creator?: boolean }>;
  // Published communities they've joined that aren't mutual, unless hidden.
  joined_communities?: CommunityAvatarSummary[];
  mutual_communities: CommunityAvatarSummary[];
  is_self: boolean;
  can_message: boolean;
  message_context_community_id: string | null;
  message_unavailable_reason: "self" | "no_mutual_community" | null;
};

export type DirectMessageParticipant = {
  id: string;
  participant_type: "user" | "agent";
  user_id: string | null;
  handle?: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  status: "active" | "left";
  last_read_seq: number;
};

export type DirectMessageConversation = {
  id: string;
  kind: "direct";
  created_from_community: {
    id: string;
    slug: string;
    name: string;
  } | null;
  last_seq: number;
  viewer_last_read_seq: number;
  unread_count: number;
  has_unread: boolean;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_message_from_viewer?: boolean;
  viewer_muted?: boolean;
  viewer_has_blocked_peer?: boolean;
  created_at: string;
  updated_at: string;
  participants: DirectMessageParticipant[];
};

export type DirectMessageRecipient = {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  community_id: string;
  community_name: string;
  existing_conversation_id: string | null;
};

export type DirectMessageNetworkPerson = DirectMessageRecipient & {
  last_active_at: string | null;
};

export type DirectMessagePeerPresence = {
  user_id: string;
  last_active_at: string | null;
};

export type DirectMessageNetworkPeopleBundle = {
  people: DirectMessageNetworkPerson[];
  source_community_count: number;
  has_more?: boolean;
};

export type DirectMessage = {
  id: string;
  conversation_id: string;
  seq: number;
  sender_type: "user" | "agent" | "system";
  sender_user_id: string | null;
  client_message_id?: string | null;
  content_json: unknown;
  created_at: string;
  updated_at: string;
};

export type DirectMessageAttachment = {
  id: string;
  name: string;
  type: "image" | "file";
  mime: string | null;
  size: number;
  url?: string | null;
  storage_id?: string | null;
};

export type DirectMessageTypingPresenceUser = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  display_until_ms: number;
  updated_at?: string | null;
};

export type DirectMessageTypingPresenceBundle = {
  users: DirectMessageTypingPresenceUser[];
  total_count: number;
};

export type CommunityActivityEventType =
  | "member_joined"
  | "resource_added"
  | "event_soon"
  | "event_starting"
  | "ai_feed_post_added";

export type CommunityActivityTargetType =
  | "membership"
  | "resource"
  | "event"
  | "ai_feed_post";

export type CommunityActivityEvent = {
  id: string;
  community_id: string;
  type: CommunityActivityEventType;
  actor_user_id: string | null;
  target_type: CommunityActivityTargetType | null;
  target_id: string | null;
  target_title: string | null;
  created_at: string;
};

export type ChatLightboxImage = {
  url: string;
  name: string;
};

export type CommunityTypingPresenceUser = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  root_id?: string | null;
  display_until_ms: number;
  updated_at?: string | null;
};

export type CommunityTypingPresenceBundle = {
  users: CommunityTypingPresenceUser[];
  total_count: number;
  total_count_capped?: boolean;
};

export type CommunityAccess = {
  community_id: string;
  user_id: string;
  relation?: "visitor" | "pending" | "member" | "moderator" | "admin" | "owner" | null;
  entry_policy?: CommunityEntryPolicy | null;
  visibility?: "published" | "unlisted";
  join_request_status?: "pending" | "denied" | null;
  join_request_reapply_at?: string | null;
  primary_cta?: "open_community" | "join" | "checkout";
  is_owner: boolean;
  is_entitled: boolean;
  access_source?: "free_grant" | "manual_grant" | "paid_subscription" | null;
  subscription_status?: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended" | null;
  entitlement_role: string | null;
  entitlement_ends_at: string | null;
  effective_role: string | null;
  can_view_landing?: boolean;
  can_enter_community?: boolean;
  can_read_chat?: boolean;
  can_post_chat?: boolean;
  can_view: boolean;
  can_post_message: boolean;
  can_manage_resources: boolean;
  can_moderate_content?: boolean;
  can_manage_members: boolean;
  can_review_join_requests?: boolean;
  can_manage_pricing?: boolean;
  can_manage_branding?: boolean;
  can_manage_publishing?: boolean;
  can_manage_payouts?: boolean;
  /** The builder's welcome flow is on and this member still owes a welcome step. */
  welcome_required?: boolean;
  welcome_form_request_ids?: string[];
  /** Welcome lesson pages still to mark done, after the forms. */
  welcome_lesson_ids?: string[];
  /** "popup": the welcome shows over the open community instead of in place of it. */
  welcome_display?: "page" | "popup";
};

export type CommunityAgentConfig<TLanding = unknown> = {
  id: string;
  community_id: string;
  landing_json: TLanding | null;
  community_system_prompt?: string;
  system_prompt: string;
  updated_at: string;
};

export type CommunityAnalyticsSummary = {
  total_members: number | null;
  page_visits_window: number | null;
  new_members_window: number | null;
  conversion_rate_window: number | null;
  mrr_base_units: number | null;
  currency: string | null;
  currency_decimals: number | null;
  active_members_window: number | null;
  retention_window: number | null;
  total_resources: number | null;
  resources_added_window: number | null;
};

export type AnalyticsPoint = {
  label: string;
  value: number;
};

export type CommunityAnalyticsSeries = {
  visits: AnalyticsPoint[];
  members: AnalyticsPoint[];
  revenue: AnalyticsPoint[];
};

export type AnalyticsRange = "7d" | "30d" | "90d" | "1y" | "all";
export type AnalyticsBucket = "day" | "week" | "month";

export type CommunityAnalyticsSnapshot = {
  range: AnalyticsRange;
  bucket: AnalyticsBucket;
  generated_at: string;
  summary: CommunityAnalyticsSummary;
  series: CommunityAnalyticsSeries;
};

export type CommunityPricingMode = "free" | "monthly" | "annual";

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  handle?: string | null;
  normalized_handle?: string | null;
  bio?: string | null;
  social_links?: SocialProfileLinks | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export type UserProfileDetail = UserProfile & {
  bio: string | null;
  social_links?: SocialProfileLinks | null;
  onboarding_completed_at?: string | null;
  account_setup?: AccountSetupStatus | null;
};
