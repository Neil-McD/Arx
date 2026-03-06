export type PublicPlanSummary = {
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: string;
};

export type DiscoverCommunity<TPublicCommunityRecord> = TPublicCommunityRecord & {
  active_plan?: PublicPlanSummary | null;
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
  is_owner: boolean;
  is_entitled: boolean;
  entitlement_role: string | null;
  entitlement_ends_at: string | null;
  effective_role: string | null;
  can_view: boolean;
  can_post_message: boolean;
  can_create_resource: boolean;
  can_manage_resources: boolean;
  can_invite: boolean;
  can_manage_members: boolean;
};

export type CommunityAgentDraft<TLanding = unknown> = {
  id: string;
  community_id: string;
  slot: number;
  name: string | null;
  landing_json: TLanding | null;
  system_prompt: string;
  is_active: boolean;
  updated_at: string;
};

export type CommunityAiFeedPostType = "observation" | "synthesis" | "tension";

export type CommunityAiFeedPost = {
  id: string;
  community_id: string;
  author_label: string;
  post_type: CommunityAiFeedPostType;
  body: string;
  created_at: string;
  pending?: boolean;
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

export type AnalyticsChartMode = "members" | "revenue";

export type CommunityPricingMode = "free" | "monthly" | "yearly" | "both";

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type UserProfileDetail = UserProfile & {
  bio: string | null;
};
