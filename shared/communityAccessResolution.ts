export type CommunityAccessResolutionState<TAccess> = {
  communityId: string | null;
  requestId: number;
  status: "idle" | "loading" | "refreshing" | "resolved" | "failed";
  access: TAccess | null;
  error: string | null;
};

export type CommunityAccessResolutionAction<TAccess> =
  | {
      type: "reset";
      requestId: number;
    }
  | {
      type: "begin";
      communityId: string;
      requestId: number;
    }
  | {
      type: "resolve";
      communityId: string;
      requestId: number;
      access: TAccess | null;
    }
  | {
      type: "fail";
      communityId: string;
      requestId: number;
      error: string;
    };

export type ScopedCommunityAccessResolution<TAccess> =
  | {
      status: "idle" | "pending";
      access: null;
      error: null;
    }
  | {
      status: "refreshing";
      access: TAccess;
      error: null;
    }
  | {
      status: "resolved";
      access: TAccess | null;
      error: null;
    }
  | {
      status: "failed";
      access: TAccess | null;
      error: string;
    };

export type CommunitySettingsAccessPresentation =
  | "select_community"
  | "sign_in"
  | "resolving"
  | "failed"
  | "denied"
  | "allowed";

export function createCommunityAccessResolutionState<TAccess>(): CommunityAccessResolutionState<TAccess> {
  return {
    communityId: null,
    requestId: 0,
    status: "idle",
    access: null,
    error: null,
  };
}

export function reduceCommunityAccessResolution<TAccess>(
  state: CommunityAccessResolutionState<TAccess>,
  action: CommunityAccessResolutionAction<TAccess>,
): CommunityAccessResolutionState<TAccess> {
  if (action.type === "reset") {
    return {
      ...createCommunityAccessResolutionState<TAccess>(),
      requestId: action.requestId,
    };
  }
  if (action.type === "begin") {
    const canRefreshResolvedAccess =
      state.communityId === action.communityId &&
      state.access !== null &&
      (state.status === "resolved" ||
        state.status === "refreshing" ||
        state.status === "failed");
    return {
      communityId: action.communityId,
      requestId: action.requestId,
      status: canRefreshResolvedAccess ? "refreshing" : "loading",
      access: canRefreshResolvedAccess ? state.access : null,
      error: null,
    };
  }
  if (
    (state.status !== "loading" && state.status !== "refreshing") ||
    state.communityId !== action.communityId ||
    state.requestId !== action.requestId
  ) {
    return state;
  }
  if (action.type === "resolve") {
    return {
      communityId: action.communityId,
      requestId: action.requestId,
      status: "resolved",
      access: action.access,
      error: null,
    };
  }
  return {
    communityId: action.communityId,
    requestId: action.requestId,
    status: "failed",
    access: state.status === "refreshing" ? state.access : null,
    error: action.error,
  };
}

export function scopeCommunityAccessResolution<TAccess>(
  state: CommunityAccessResolutionState<TAccess>,
  activeCommunityId: string | null | undefined,
): ScopedCommunityAccessResolution<TAccess> {
  const communityId = String(activeCommunityId ?? "").trim();
  if (!communityId) {
    return {
      status: "idle",
      access: null,
      error: null,
    };
  }
  if (state.communityId !== communityId || state.status === "idle" || state.status === "loading") {
    return {
      status: "pending",
      access: null,
      error: null,
    };
  }
  if (state.status === "refreshing") {
    return state.access === null
      ? {
          status: "pending",
          access: null,
          error: null,
        }
      : {
          status: "refreshing",
          access: state.access,
          error: null,
        };
  }
  if (state.status === "failed") {
    return {
      status: "failed",
      access: state.access,
      error: state.error ?? "Unable to verify community access.",
    };
  }
  return {
    status: "resolved",
    access: state.access,
    error: null,
  };
}

export function deriveCommunitySettingsAccessPresentation(args: {
  hasActiveCommunity: boolean;
  hasAuthenticatedPresentation: boolean;
  isResolvingAccess: boolean;
  accessLoadError: string | null;
  canView: boolean;
}): CommunitySettingsAccessPresentation {
  if (!args.hasActiveCommunity) return "select_community";
  if (!args.hasAuthenticatedPresentation) return "sign_in";
  if (args.isResolvingAccess) return "resolving";
  if (args.accessLoadError) return "failed";
  if (!args.canView) return "denied";
  return "allowed";
}
