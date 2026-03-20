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

export type CommunityAccess = {
  community_id: string;
  user_id: string;
  relation?: "visitor" | "pending" | "member" | "moderator" | "admin" | "owner";
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
  can_manage_members: boolean;
  can_review_join_requests?: boolean;
};

export type CommunityAgentConfig<TLanding = unknown> = {
  id: string;
  community_id: string;
  landing_json: TLanding | null;
  system_prompt: string;
  updated_at: string;
};

export type CommunityAiFeedPostType = "observation" | "recommendation" | "action";

export type CommunityAiFeedPostStatus = "live" | "hidden";

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
  status: CommunityAiFeedPostStatus;
  score: number;
  effective_score: number;
  reaction_counts: CommunityAiFeedReactionCounts;
  viewer_reaction: CommunityAiFeedReactionType | null;
  created_at: string;
  updated_at: string;
  hidden_at: string | null;
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
  new_members_window: number | null;
  active_members_window: number | null;
  retention_window: number | null;
  total_resources: number | null;
  resources_added_window: number | null;
};

export type AnalyticsPoint = {
  label: string;
  value: number;
};

export type AnalyticsRange = "7d" | "30d" | "90d" | "1y" | "all";

export type CommunityPricingMode = "free" | "monthly" | "annual";

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type UserProfileDetail = UserProfile & {
  bio: string | null;
};
