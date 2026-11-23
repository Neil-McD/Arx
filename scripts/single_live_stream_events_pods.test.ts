import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const web = createRequire(new URL("../apps/web/package.json", import.meta.url));

const SESSION = {
  accessToken: "tok_live",
  user: { id: "user_1", email: "member@example.com" },
};

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("Slice 2: Events, Pods, and Pod Landing draw directly from the live stream without duplicate mount fetches", () => {
  it("renders WebCommunityPodsSection and KitPodLanding directly from useLiveQuery with zero initial HTTP fetches", async () => {
    const fetchCloudCommunityPods = vi.fn();
    const fetchCloudPod = vi.fn();
    const fetchCloudPodNotes = vi.fn();
    const liveCalls: Array<{ name: string; args: Record<string, unknown> | null }> = [];

    vi.doMock(web.resolve("react"), () => ({ ...React, default: React }));
    vi.doMock("../shared/cloudCommunityPodsGateway", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../shared/cloudCommunityPodsGateway")>();
      return {
        ...actual,
        fetchCloudCommunityPods,
        fetchCloudPod,
        fetchCloudPodNotes,
      };
    });
    vi.doMock("../shared/liveQuery", () => ({
      useLiveQuery: (_session: unknown, name: string, args: Record<string, unknown> | null) => {
        liveCalls.push({ name, args });
        if (name === "communityPods:listCommunityPods" && args && args.asMember === true) {
          return {
            data: {
              can_manage: false,
              pods: [],
              outside: [
                {
                  channel_id: "ch_listed",
                  slug: "builders-pod",
                  name: "Builders Pod",
                  purpose: "Ship weekly together.",
                  hosts: ["Neil"],
                  seats_left: 4,
                  price: null,
                  my_request: null,
                },
              ],
            },
            error: null,
          };
        }
        if (name === "communityPods:listCommunityPods" && args) {
          return {
            data: {
              can_manage: true,
              pods: [
                {
                  channel_id: "ch_listed",
                  slug: "builders-pod",
                  name: "Builders Pod",
                  purpose: "Ship weekly together.",
                  visibility: "listed",
                  members: 3,
                  seats: 10,
                  waiting: 0,
                  can_manage: true,
                  last_active_at: null,
                  price: null,
                },
                {
                  channel_id: "ch_hidden",
                  slug: "secret-pod",
                  name: "Secret Pod",
                  purpose: "Invite only.",
                  visibility: "hidden",
                  members: 2,
                  seats: null,
                  waiting: 0,
                  can_manage: true,
                  last_active_at: null,
                  price: null,
                },
              ],
              outside: [],
            },
            error: null,
          };
        }
        if (name === "communityPods:getPod" && args) {
          return {
            data: {
              channel_id: "ch_listed",
              name: "Builders Pod",
              purpose: "Ship weekly together.",
              visibility: "listed",
              members: [{ user_id: "u1", name: "Neil", avatar_url: null }],
              next_call: null,
              can_manage: true,
            },
            error: null,
          };
        }
        if (name === "communityPodNotes:listPodNotes" && args) {
          return {
            data: { notes: [{ slug: "charter", title: "Pod Charter", body: "Weekly demos." }] },
            error: null,
          };
        }
        if (name === "communityBriefs:getPlaceBrief" && args) {
          return { data: null, error: null };
        }
        return { data: undefined, error: null };
      },
      useLiveAnswer: vi.fn(),
      useLiveChange: vi.fn(),
    }));

    const { WebCommunityPodsSection } = await import("../apps/web/src/components/WebCommunityPodsSection");
    const { KitPodLanding } = await import("../apps/web/src/v1/KitPodLanding");

    const hostGridHtml = renderToStaticMarkup(
      React.createElement(WebCommunityPodsSection, {
        session: SESSION,
        ensureSession: async () => SESSION,
        communityId: "comm_1",
        communityName: "Harbor",
        asMember: false,
        podSlug: null,
        onNavigate: () => {},
        createRoom: async () => null,
      }),
    );

    expect(hostGridHtml).toContain("Builders Pod");
    expect(hostGridHtml).toContain("Secret Pod");
    expect(fetchCloudCommunityPods).not.toHaveBeenCalled();

    const hostPodHtml = renderToStaticMarkup(
      React.createElement(WebCommunityPodsSection, {
        session: SESSION,
        ensureSession: async () => SESSION,
        communityId: "comm_1",
        communityName: "Harbor",
        asMember: false,
        podSlug: "builders-pod",
        onNavigate: () => {},
        createRoom: async () => null,
      }),
    );

    expect(hostPodHtml).toContain("Builders Pod");
    expect(hostPodHtml).toContain("1 note learned");
    expect(hostPodHtml).toContain("Neil");
    expect(fetchCloudCommunityPods).not.toHaveBeenCalled();

    const memberPreviewHtml = renderToStaticMarkup(
      React.createElement(WebCommunityPodsSection, {
        session: SESSION,
        ensureSession: async () => SESSION,
        communityId: "comm_1",
        communityName: "Harbor",
        asMember: true,
        podSlug: null,
        onNavigate: () => {},
        createRoom: async () => null,
      }),
    );

    expect(memberPreviewHtml).toContain("Builders Pod");
    expect(memberPreviewHtml).toContain("1 hidden pod isn&#x27;t shown to outside members.");
    expect(fetchCloudCommunityPods).not.toHaveBeenCalled();

    const landingHtml = renderToStaticMarkup(
      React.createElement(KitPodLanding, {
        session: SESSION,
        communityId: "comm_1",
        pod: { channel_id: "ch_listed", name: "Builders Pod", purpose: "Ship weekly together." },
        onOpen: () => {},
      }),
    );

    expect(landingHtml).toContain("Builders Pod");
    expect(landingHtml).toContain("1 note learned");
    expect(fetchCloudPod).not.toHaveBeenCalled();
    expect(fetchCloudPodNotes).not.toHaveBeenCalled();
    expect(liveCalls.some((call) => call.name === "communityPods:listCommunityPods")).toBe(true);
    expect(liveCalls.some((call) => call.name === "communityPods:getPod")).toBe(true);
    expect(liveCalls.some((call) => call.name === "communityPodNotes:listPodNotes")).toBe(true);
  });

  it("drives Events state directly from useLiveQuery without running a duplicate HTTP list fetch on mount", async () => {
    const listCloudCommunityEvents = vi.fn();
    let capturedState: {
      events: Array<{ id: string; title?: string }>;
      hasLoadedVisibleEventsRange: boolean;
      isLoadingEvents: boolean;
      eventsError: string | null;
    } | null = null;

    vi.doMock(web.resolve("react"), () => ({ ...React, default: React }));
    vi.doMock("../shared/cloudCommunityEventsGateway", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../shared/cloudCommunityEventsGateway")>();
      return {
        ...actual,
        listCloudCommunityEvents,
      };
    });
    vi.doMock("../shared/liveQuery", () => ({
      useLiveQuery: (_session: unknown, name: string, args: Record<string, unknown> | null) => {
        if (name === "communityEvents:listCommunityEvents" && args) {
          return {
            data: [
              {
                id: "evt_live_1",
                community_id: "comm_1",
                title: "Live Town Hall",
                starts_at: "2026-11-24T18:00:00.000Z",
                ends_at: "2026-11-24T19:00:00.000Z",
                status: "scheduled",
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
      const controller = useWebCommunityContentController({
        activeCommunityId: "comm_1",
        activePage: "community",
        communityTab: "events",
        ensureSession: async () => SESSION as any,
        getSession: () => SESSION as any,
        session: SESSION as any,
      });
      capturedState = {
        events: controller.events as any,
        hasLoadedVisibleEventsRange: controller.hasLoadedVisibleEventsRange,
        isLoadingEvents: controller.isLoadingEvents,
        eventsError: controller.eventsError,
      };
      return React.createElement("div", null, controller.events.map((e) => e.title).join(","));
    }

    const html = renderToStaticMarkup(React.createElement(Harness));
    expect(html).toContain("Live Town Hall");
    expect(capturedState).toEqual({
      events: [expect.objectContaining({ id: "evt_live_1", title: "Live Town Hall" })],
      hasLoadedVisibleEventsRange: true,
      isLoadingEvents: false,
      eventsError: null,
    });
    expect(listCloudCommunityEvents).not.toHaveBeenCalled();
  });
});
