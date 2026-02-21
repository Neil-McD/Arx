import type { Dispatch, SetStateAction } from "react";
import type { CommunityMemoryCandidateRow } from "../../shared/communityMemoryCandidates";

export type CommunityMember = {
  id: string;
  user_id: string;
  role: string;
  access_status?: string;
};

export type UserProfile = {
  display_name?: string | null;
  avatar_url?: string | null;
};

export type CommunityInviteRecord = {
  id: string;
  code: string;
  max_uses: number | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export type CommunityMembersCapabilities = {
  hasActiveCommunity: boolean;
  hasSession: boolean;
  isActiveCommunityOwner: boolean;
  canInvite: boolean;
  canManageMembers: boolean;
};

export type CommunityMemoryReviewState = {
  pendingCommunityMemoryCandidates: CommunityMemoryCandidateRow[];
  reviewedCommunityMemoryCandidates: CommunityMemoryCandidateRow[];
  rejectedReviewedCommunityMemoryCandidatesCount: number;
  isLoadingCommunityMemoryCandidates: boolean;
  communityMemoryCandidatesError: string | null;
  communityMemoryRejectReasonById: Record<string, string>;
  reviewingCommunityMemoryCandidateId: string | null;
};

export type CommunityMemoryReviewActions = {
  setCommunityMemoryRejectReasonById: Dispatch<SetStateAction<Record<string, string>>>;
  handlePromoteCommunityMemoryCandidate: (candidateId: string) => Promise<void> | void;
  handleRejectCommunityMemoryCandidate: (candidateId: string, reason: string | null) => Promise<void> | void;
  displayName: (userId: string) => string;
  previewText: (value: string, limit?: number) => string;
};

export type CommunityInvitesState = {
  activeCommunityId: string | null;
  inviteMaxUsesPreset: string;
  inviteExpiryPreset: string;
  isCreatingInvite: boolean;
  inviteMaxUsesCustom: string;
  inviteExpiryCustom: string;
  inviteCreateError: string | null;
  isLoadingCommunityInvites: boolean;
  communityInvites: CommunityInviteRecord[];
};

export type CommunityInvitesActions = {
  setInviteMaxUsesPreset: (value: string) => void;
  setInviteExpiryPreset: (value: string) => void;
  handleCreateInvite: () => Promise<void> | void;
  setInviteMaxUsesCustom: (value: string) => void;
  setInviteExpiryCustom: (value: string) => void;
  getPublicShareBaseUrl: () => string | null;
  handleRevokeInvite: (inviteId: string) => Promise<void> | void;
  handleDeleteInvite: (inviteId: string) => Promise<void> | void;
};

export type CommunityMembersPanelState = {
  activeCommunityOwnerId: string | null;
  communityMembers: CommunityMember[];
  profilesByUserId: Record<string, UserProfile | undefined>;
  memoryReview: CommunityMemoryReviewState;
  invites: CommunityInvitesState;
};

export type CommunityMembersPanelActions = {
  displayName: (userId: string) => string;
  handleSetCommunityMemberRole: (userId: string, role: string) => Promise<void> | void;
  handleRemoveCommunityMember: (userId: string) => Promise<void> | void;
  memoryReview: CommunityMemoryReviewActions;
  invites: CommunityInvitesActions;
};
