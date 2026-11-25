export type CommunityAdmissionJoinRequest = {
  id: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  message: string | null;
  createdAtLabel: string;
};

export type CommunityJoinRequestReviewProps = {
  canReviewJoinRequests?: boolean;
  joinReviewMode?: "paid" | "free_auto" | "free_approval" | null;
  pendingJoinRequests?: CommunityAdmissionJoinRequest[] | null;
  isLoadingJoinRequests?: boolean;
  joinRequestsError?: string | null;
  decidingJoinRequestId?: string | null;
  onApproveJoinRequest?: (requestId: string) => Promise<void> | void;
  onDenyJoinRequest?: (requestId: string) => Promise<void> | void;
  displayName: (userId: string) => string;
};

export type CommunityAdmissionControl = {
  mode: "open" | "approval" | null;
  canManage: boolean;
  pending: boolean;
  error: string | null;
  onChange: (mode: "open" | "approval") => Promise<void> | void;
};
