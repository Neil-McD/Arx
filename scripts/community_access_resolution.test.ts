import { expect, test } from "vitest";

import {
  createCommunityAccessResolutionState,
  deriveCommunitySettingsAccessPresentation,
  reduceCommunityAccessResolution,
  scopeCommunityAccessResolution,
} from "../shared/communityAccessResolution";
import {
  deriveCommunityAccessCapabilities,
  deriveCommunityActionGuards,
  deriveCommunityNavVisibility,
} from "../shared/communityAccessViewModel";

type TestAccess = {
  community_id: string;
  can_view: boolean;
};

test("an active community is pending before its access effect begins", () => {
  const state = createCommunityAccessResolutionState<TestAccess>();

  expect(scopeCommunityAccessResolution(state, "community-a")).toEqual({
    status: "pending",
    access: null,
    error: null,
  });
});

test("access resolved for a previous community is never reused after navigation", () => {
  const loadingA = reduceCommunityAccessResolution(
    createCommunityAccessResolutionState<TestAccess>(),
    { type: "begin", communityId: "community-a", requestId: 1 },
  );
  const resolvedA = reduceCommunityAccessResolution(loadingA, {
    type: "resolve",
    communityId: "community-a",
    requestId: 1,
    access: { community_id: "community-a", can_view: true },
  });

  expect(scopeCommunityAccessResolution(resolvedA, "community-b")).toEqual({
    status: "pending",
    access: null,
    error: null,
  });
});

test("a stale response cannot overwrite a newer community access request", () => {
  const loadingA = reduceCommunityAccessResolution(
    createCommunityAccessResolutionState<TestAccess>(),
    { type: "begin", communityId: "community-a", requestId: 1 },
  );
  const loadingB = reduceCommunityAccessResolution(loadingA, {
    type: "begin",
    communityId: "community-b",
    requestId: 2,
  });
  const afterStaleA = reduceCommunityAccessResolution(loadingB, {
    type: "resolve",
    communityId: "community-a",
    requestId: 1,
    access: { community_id: "community-a", can_view: true },
  });

  expect(afterStaleA).toBe(loadingB);
  expect(scopeCommunityAccessResolution(afterStaleA, "community-b").status).toBe("pending");
});

test("same-community refresh preserves the last verified access snapshot", () => {
  const loading = reduceCommunityAccessResolution(
    createCommunityAccessResolutionState<TestAccess>(),
    { type: "begin", communityId: "community-a", requestId: 1 },
  );
  const resolved = reduceCommunityAccessResolution(loading, {
    type: "resolve",
    communityId: "community-a",
    requestId: 1,
    access: { community_id: "community-a", can_view: true },
  });
  const refreshing = reduceCommunityAccessResolution(resolved, {
    type: "begin",
    communityId: "community-a",
    requestId: 2,
  });

  expect(scopeCommunityAccessResolution(refreshing, "community-a")).toEqual({
    status: "refreshing",
    access: { community_id: "community-a", can_view: true },
    error: null,
  });
});

test("same-community refresh preserves navigation and action geometry", () => {
  const access = {
    community_id: "community-a",
    user_id: "user-a",
    is_owner: true,
    is_entitled: true,
    entitlement_role: "owner",
    entitlement_ends_at: null,
    effective_role: "owner",
    can_view: true,
    can_post_message: true,
    can_manage_resources: true,
    can_manage_members: true,
  };
  const loading = reduceCommunityAccessResolution(
    createCommunityAccessResolutionState<typeof access>(),
    { type: "begin", communityId: "community-a", requestId: 1 },
  );
  const resolved = reduceCommunityAccessResolution(loading, {
    type: "resolve",
    communityId: "community-a",
    requestId: 1,
    access,
  });
  const refreshing = reduceCommunityAccessResolution(resolved, {
    type: "begin",
    communityId: "community-a",
    requestId: 2,
  });
  const scoped = scopeCommunityAccessResolution(refreshing, "community-a");
  const capabilities = deriveCommunityAccessCapabilities(scoped.access);

  expect(scoped.status).toBe("refreshing");
  expect(deriveCommunityNavVisibility(capabilities)).toEqual({
    canViewMembers: true,
    canViewSettings: true,
    canManageMembers: true,
    canViewAnalytics: true,
  });
  expect(deriveCommunityActionGuards(capabilities)).toMatchObject({
    canPostMessages: true,
    canManageResources: true,
    canManageMembers: true,
    canViewCommunity: true,
  });
});

test("refresh failure retains the last verified access snapshot", () => {
  const loading = reduceCommunityAccessResolution(
    createCommunityAccessResolutionState<TestAccess>(),
    { type: "begin", communityId: "community-a", requestId: 1 },
  );
  const resolved = reduceCommunityAccessResolution(loading, {
    type: "resolve",
    communityId: "community-a",
    requestId: 1,
    access: { community_id: "community-a", can_view: true },
  });
  const refreshing = reduceCommunityAccessResolution(resolved, {
    type: "begin",
    communityId: "community-a",
    requestId: 2,
  });
  const failed = reduceCommunityAccessResolution(refreshing, {
    type: "fail",
    communityId: "community-a",
    requestId: 2,
    error: "Access lookup failed.",
  });

  expect(scopeCommunityAccessResolution(failed, "community-a")).toEqual({
    status: "failed",
    access: { community_id: "community-a", can_view: true },
    error: "Access lookup failed.",
  });
});

test("definitive revocation removes preserved presentation access", () => {
  const loading = reduceCommunityAccessResolution(
    createCommunityAccessResolutionState<TestAccess>(),
    { type: "begin", communityId: "community-a", requestId: 1 },
  );
  const resolved = reduceCommunityAccessResolution(loading, {
    type: "resolve",
    communityId: "community-a",
    requestId: 1,
    access: { community_id: "community-a", can_view: true },
  });
  const refreshing = reduceCommunityAccessResolution(resolved, {
    type: "begin",
    communityId: "community-a",
    requestId: 2,
  });
  const revoked = reduceCommunityAccessResolution(refreshing, {
    type: "resolve",
    communityId: "community-a",
    requestId: 2,
    access: null,
  });

  expect(scopeCommunityAccessResolution(revoked, "community-a")).toEqual({
    status: "resolved",
    access: null,
    error: null,
  });
});

test("only a completed null response represents definitive no access", () => {
  const loading = reduceCommunityAccessResolution(
    createCommunityAccessResolutionState<TestAccess>(),
    { type: "begin", communityId: "community-a", requestId: 1 },
  );
  const resolved = reduceCommunityAccessResolution(loading, {
    type: "resolve",
    communityId: "community-a",
    requestId: 1,
    access: null,
  });

  expect(scopeCommunityAccessResolution(resolved, "community-a")).toEqual({
    status: "resolved",
    access: null,
    error: null,
  });
});

test("lookup failure remains distinguishable from denial", () => {
  const loading = reduceCommunityAccessResolution(
    createCommunityAccessResolutionState<TestAccess>(),
    { type: "begin", communityId: "community-a", requestId: 1 },
  );
  const failed = reduceCommunityAccessResolution(loading, {
    type: "fail",
    communityId: "community-a",
    requestId: 1,
    error: "Access lookup failed.",
  });

  expect(scopeCommunityAccessResolution(failed, "community-a")).toEqual({
    status: "failed",
    access: null,
    error: "Access lookup failed.",
  });
});

test("retry can move failed access through pending to allowed", () => {
  const loadingOne = reduceCommunityAccessResolution(
    createCommunityAccessResolutionState<TestAccess>(),
    { type: "begin", communityId: "community-a", requestId: 1 },
  );
  const failed = reduceCommunityAccessResolution(loadingOne, {
    type: "fail",
    communityId: "community-a",
    requestId: 1,
    error: "Access lookup failed.",
  });
  const loadingTwo = reduceCommunityAccessResolution(failed, {
    type: "begin",
    communityId: "community-a",
    requestId: 2,
  });
  const resolved = reduceCommunityAccessResolution(loadingTwo, {
    type: "resolve",
    communityId: "community-a",
    requestId: 2,
    access: { community_id: "community-a", can_view: true },
  });

  expect(scopeCommunityAccessResolution(loadingTwo, "community-a").status).toBe("pending");
  expect(scopeCommunityAccessResolution(resolved, "community-a")).toEqual({
    status: "resolved",
    access: { community_id: "community-a", can_view: true },
    error: null,
  });
});

test.each([
  {
    name: "missing community",
    args: {
      hasActiveCommunity: false,
      hasAuthenticatedPresentation: true,
      isResolvingAccess: false,
      accessLoadError: null,
      canView: false,
    },
    expected: "select_community",
  },
  {
    name: "signed out",
    args: {
      hasActiveCommunity: true,
      hasAuthenticatedPresentation: false,
      isResolvingAccess: false,
      accessLoadError: null,
      canView: false,
    },
    expected: "sign_in",
  },
  {
    name: "auth or access recovery",
    args: {
      hasActiveCommunity: true,
      hasAuthenticatedPresentation: true,
      isResolvingAccess: true,
      accessLoadError: null,
      canView: false,
    },
    expected: "resolving",
  },
  {
    name: "lookup failure",
    args: {
      hasActiveCommunity: true,
      hasAuthenticatedPresentation: true,
      isResolvingAccess: false,
      accessLoadError: "Access lookup failed.",
      canView: false,
    },
    expected: "failed",
  },
  {
    name: "resolved denial",
    args: {
      hasActiveCommunity: true,
      hasAuthenticatedPresentation: true,
      isResolvingAccess: false,
      accessLoadError: null,
      canView: false,
    },
    expected: "denied",
  },
  {
    name: "resolved authorization",
    args: {
      hasActiveCommunity: true,
      hasAuthenticatedPresentation: true,
      isResolvingAccess: false,
      accessLoadError: null,
      canView: true,
    },
    expected: "allowed",
  },
] as const)("$name has one explicit presentation state", ({ args, expected }) => {
  expect(deriveCommunitySettingsAccessPresentation(args)).toBe(expected);
});
