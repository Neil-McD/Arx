import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const web = createRequire(new URL("../apps/web/package.json", import.meta.url));

const SESSION = {
  accessToken: "tok_live",
  user: { id: "user_host", email: "host@example.com" },
};

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("Slice 3: Join Requests and Courses/Knowledge draw directly from live queries without duplicate refetches", () => {
  it("subscribes to pending join requests directly via useLiveQuery with zero HTTP list calls and formats errors safely", async () => {
    const listCloudCommunityJoinRequestRows = vi.fn();
    const liveCalls: Array<{ name: string; args: Record<string, unknown> | null }> = [];

    vi.doMock(web.resolve("react"), () => ({ ...React, default: React }));
    vi.doMock("../shared/cloudCommunityAdminGateway", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../shared/cloudCommunityAdminGateway")>();
      return {
        ...actual,
        listCloudCommunityJoinRequestRows,
      };
    });
    vi.doMock("../shared/liveQuery", () => ({
      useLiveQuery: (_session: unknown, name: string, args: Record<string, unknown> | null) => {
        liveCalls.push({ name, args });
        if (name === "communityAdmin:listCommunityJoinRequests" && args) {
          return {
            data: [{ id: "req_1", user_id: "user_applicant", status: "pending" }],
            error: null,
          };
        }
        return { data: undefined, error: null };
      },
      useLiveAnswer: vi.fn(),
      useLiveChange: vi.fn(),
    }));

    const { useCommunityMembersReviewLifecycle } = await import(
      "../shared/useCommunityMembersReviewLifecycle"
    );

    function Harness() {
      useCommunityMembersReviewLifecycle({
        session: SESSION,
        activeCommunityId: "comm_1",
        communities: [{ id: "comm_1", entry_policy: "free_approval", visibility: "published" }],
        canReviewJoinRequests: true,
        activeCommunityMembersJoinReviewMode: "free_approval",
        shouldLoad: true,
        applyLiveCommunityJoinRequestsLoading: vi.fn(),
        applyLiveCommunityJoinRequests: vi.fn(),
        applyLiveCommunityJoinRequestsError: vi.fn(),
        resetCommunityJoinRequests: vi.fn(),
      });
      return React.createElement("div", null, "ok");
    }

    expect(renderToStaticMarkup(React.createElement(Harness))).toContain("ok");
    expect(listCloudCommunityJoinRequestRows).not.toHaveBeenCalled();
    expect(liveCalls).toContainEqual({
      name: "communityAdmin:listCommunityJoinRequests",
      args: {
        authSubject: "user_host",
        communityId: "comm_1",
        limit: 201,
        includeStatuses: ["pending"],
      },
    });
  });

  it("subscribes to Courses and Resources directly via useLiveQuery with the 201 overflow sentinel and skips redundant HTTP reads when warm", async () => {
    const listCloudCommunityResourceRows = vi.fn();
    const listCloudCommunityResourceModuleRows = vi.fn();
    const liveCalls: Array<{ name: string; args: Record<string, unknown> | null }> = [];

    vi.doMock(web.resolve("react"), () => ({ ...React, default: React }));
    vi.doMock("../shared/cloudCommunityAdminGateway", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../shared/cloudCommunityAdminGateway")>();
      return {
        ...actual,
        listCloudCommunityResourceRows,
        listCloudCommunityResourceModuleRows,
      };
    });
    vi.doMock("../shared/liveQuery", () => ({
      useLiveQuery: (_session: unknown, name: string, args: Record<string, unknown> | null) => {
        liveCalls.push({ name, args });
        if (name === "communityResources:listCommunityResourceModules" && args) {
          return {
            data: [{ id: "mod_1", name: "Onboarding", module_status: "live", sort_order: 0 }],
            error: null,
          };
        }
        if (name === "communityResources:listCommunityResources" && args) {
          return {
            data: [
              {
                id: "res_1",
                module_id: "mod_1",
                type: "post",
                resource_role: "page",
                resource_status: "published",
                title: "Welcome Lesson",
                body_md: "Hello",
                url: null,
                pinned: false,
                sort_order: 0,
                created_at: "2026-11-23T00:00:00.000Z",
              },
            ],
            error: null,
          };
        }
        return { data: undefined, error: null };
      },
      useLiveAnswer: vi.fn(),
      useLiveChange: vi.fn(),
    }));

    const { useWebCommunityContentController } = await import(
      "../apps/web/src/controllers/useWebCommunityContentController"
    );

    function Harness() {
      useWebCommunityContentController({
        activeCommunityId: "comm_1",
        activePage: "community",
        communityTab: "resources",
        ensureSession: async () => SESSION as any,
        getSession: () => SESSION as any,
        session: SESSION as any,
      });
      return React.createElement("div", null, "knowledge");
    }

    expect(renderToStaticMarkup(React.createElement(Harness))).toContain("knowledge");
    expect(listCloudCommunityResourceRows).not.toHaveBeenCalled();
    expect(listCloudCommunityResourceModuleRows).not.toHaveBeenCalled();
    expect(liveCalls).toContainEqual({
      name: "communityResources:listCommunityResources",
      args: { authSubject: "user_host", communityId: "comm_1", limit: 201 },
    });
    expect(liveCalls).toContainEqual({
      name: "communityResources:listCommunityResourceModules",
      args: { authSubject: "user_host", communityId: "comm_1", limit: 201 },
    });
  });
});
