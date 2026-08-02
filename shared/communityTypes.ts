import type { AccountSetupStatus } from "./accountSetup";
import type { SocialProfileLinks } from "./socialProfileLinks";

export type CommunityEntryPolicy = "open" | "approval" | "paid_subscription";
export type CommunityBillingPeriod = "monthly" | "annual";

export type PublicPlanSummary = {
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: CommunityBillingPeriod;
};

export type CommunityFunnelHeroMediaKind = "image" | "video";

export type CommunityFunnelConfig = {
  hero_media_url: string | null;
  hero_media_kind: CommunityFunnelHeroMediaKind;
};

export type DiscoverCommunitySnapshot = {
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
  created_at: string;
  updated_at: string;
  active_plan?: PublicPlanSummary | null;
  funnel?: CommunityFunnelConfig | null;
  member_count?: number | null;
};

export type CommunityAvatarSummary = {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
};

export type ProfileCommunityContext = {
  owned_communities: CommunityAvatarSummary[];
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
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  premium_badge?: PremiumMemberBadgeSummary | null;
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
  premium_badge?: PremiumMemberBadgeSummary | null;
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
  premium_badge?: PremiumMemberBadgeSummary | null;
  display_until_ms: number;
  updated_at?: string | null;
};

export type DirectMessageTypingPresenceBundle = {
  users: DirectMessageTypingPresenceUser[];
  total_count: number;
};

export type CommunityChatMessage<TAttachment = unknown> = {
  id: string;
  community_id: string;
  sender_id: string;
  body: string;
  attachments?: TAttachment[];
  reply_to_id: string | null;
  created_at: string;
  seq: number;
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

export type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type CommunityTypingPresenceUser = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
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
  join_request_status?: string | null;
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
};

export type CommunityAgentConfig<TLanding = unknown> = {
  id: string;
  community_id: string;
  landing_json: TLanding | null;
  community_system_prompt?: string;
  system_prompt: string;
  updated_at: string;
};

export type CommunityAiFeedPostType = "observation" | "recommendation" | "action";

export type CommunityAiFeedReactionType = "good" | "low_signal";

export type CommunityAiFeedReactionCounts = {
  good: number;
  low_signal: number;
};

export type CommunityAiFeedPost = {
  id: string;
  community_id: string;
  author_type: "agent";
  author_user_id: string | null;
  agent_key: string | null;
  author_label: string;
  post_type: CommunityAiFeedPostType;
  title: string | null;
  body: string;
  evidence: string[];
  score: number;
  reaction_counts: CommunityAiFeedReactionCounts;
  viewer_reaction: CommunityAiFeedReactionType | null;
  created_at: string;
  updated_at: string;
  pending?: boolean;
};

export type CommunityRecentContextItem = {
  source_type: "chat" | "ai_feed" | "resource";
  source_id: string;
  title: string | null;
  snippet: string;
  created_at: string;
  score: number | null;
  author_label?: string | null;
  url?: string | null;
  post_type?: "observation" | "recommendation" | "action" | null;
  resource_type?: string | null;
};

export type CommunityRecentContextReadModelV1 = {
  community_id: string;
  identity: {
    community_id: string;
    name: string | null;
    slug: string | null;
    one_liner: string | null;
    about: string | null;
  };
  retrieved_at: string;
  query: string;
  source_window: {
    chat_messages_considered: number;
    ai_feed_items_considered: number;
    resources_considered: number;
  };
  source_counts: {
    chat: number;
    ai_feed: number;
    resource: number;
  };
  recent_context: CommunityRecentContextItem[];
  diagnostics: {
    version: 1;
    fallback_used: boolean;
    retrieval_version: string;
    retrieval_latency_ms: number;
    retrieved_items_used: number;
    chat_fetch_ok: boolean;
    ai_feed_fetch_ok: boolean;
    resource_fetch_ok: boolean;
  };
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

export type PremiumMemberBadgeSummary = {
  kind: "polynet_premium";
  label: "Premium";
};

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
  premium_badge?: PremiumMemberBadgeSummary | null;
};

export type UserProfileDetail = UserProfile & {
  bio: string | null;
  social_links?: SocialProfileLinks | null;
  onboarding_completed_at?: string | null;
  account_setup?: AccountSetupStatus | null;
};
