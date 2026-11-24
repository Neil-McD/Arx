import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const SESSION = { accessToken: "tok_live", user: { id: "user_1", email: "host@example.com" } };

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("Pods mobile parity, landing Brain map, and call cancellation confirmation", () => {
  it("renders the full KitPodRail inside narrow/mobile pod rooms with pod-specific back controls", async () => {
    vi.doMock(web.resolve("react"), () => ({ ...React, default: React }));
    vi.doMock("../apps/web/src/v1/KitPodRail", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../apps/web/src/v1/KitPodRail")>();
      return {
        ...actual,
        useCloudPod: () => ({
          pod: {
            channel_id: "ch_pod",
            slug: "founders-pod",
            name: "Founders Pod",
            purpose: "Weekly founder office hours.",
            visibility: "listed",
            what_you_get: ["Weekly live critique"],
            seats: 12,
            price: null,
            can_manage: true,
            can_edit: true,
            members: [{ user_id: "u1", name: "Neil", avatar_url: null, is_host: true, payment: null }],
            requests: [{ user_id: "u2", name: "Maya", status: "pending" }],
            next_call: {
              event_id: "ev_1",
              title: "Weekly Critique",
              starts_at: "2026-12-01T17:00:00.000Z",
              recurrence_frequency: "weekly",
              url: "https://meet.example.com/pod",
            },
            my_membership: { state: "added" },
          },
          reload: vi.fn(),
        }),
      };
    });
    vi.doMock("../shared/liveQuery", () => ({
      useLiveQuery: (_session: unknown, name: string) => {
        if (name === "communityBriefs:getPlaceBrief") return { data: null, error: null };
        return { data: undefined, error: null };
      },
      useLiveAnswer: vi.fn(),
      useLiveChange: vi.fn(),
    }));

    const { CommunityChannelSessionContext } = await import("../apps/web/src/components/CommunityChannelSessionContext");
    const { ChannelRosterPanel, shouldRedirectNarrowRosterToMembers } = await import("../apps/web/src/components/ChannelRosterPanel");

    // Pod rooms must NEVER redirect narrow/mobile panel requests to Members; ordinary channels still do.
    expect(shouldRedirectNarrowRosterToMembers({ narrowOpen: true, isPodRoom: true })).toBe(false);
    expect(shouldRedirectNarrowRosterToMembers({ narrowOpen: true, isPodRoom: false })).toBe(true);
    expect(shouldRedirectNarrowRosterToMembers({ narrowOpen: false, isPodRoom: false })).toBe(false);

    const html = renderToStaticMarkup(
      React.createElement(
        CommunityChannelSessionContext.Provider,
        { value: { session: SESSION, communityId: "comm_1", memberPreview: false } as any },
        React.createElement(ChannelRosterPanel, {
          communityName: "Harbor",
          channelId: "ch_pod",
          isPodRoom: true,
          narrowOpen: true,
          onCloseNarrow: () => {},
          presenceSummary: { online_count: 2, online_count_capped: false, online_faces: [] } as any,
          memberSettings: {} as any,
          getAvatarColor: () => "#444",
          getInitials: (name: string) => name.slice(0, 1),
        }),
      ),
    );

    expect(html).toContain('aria-label="About this pod"');
    expect(html).toContain('aria-label="Back to pod"');
    expect(html).toContain("Founders Pod");
    expect(html).toContain("channel-roster-panel is-v1 is-kit is-pod-rail");
    expect(html).toContain("Maya");
    expect(html).toContain("asked to join");
    expect(html).toContain("Weekly Critique");
    expect(html).toContain("Cancel call");
    expect(html).toContain("Your membership");
    expect(html).not.toContain("Community notes");
  });

  it("renders the pod's miniature Brain network on KitPodLanding once the pod has 3+ notes", async () => {
    vi.doMock(web.resolve("react"), () => ({ ...React, default: React }));
    let brainNodesCount = 3;
    vi.doMock("../shared/liveQuery", () => ({
      useLiveQuery: (_session: unknown, name: string) => {
        if (name === "communityPods:getPod") {
          return {
            data: {
              channel_id: "ch_pod",
              name: "Builders Pod",
              purpose: "Ship weekly.",
              members: [{ user_id: "u1", name: "Neil", avatar_url: null }],
              next_call: null,
            },
            error: null,
          };
        }
        if (name === "communityPodNotes:listPodNotes") {
          return {
            data: {
              notes: Array.from({ length: brainNodesCount }, (_, i) => ({
                slug: `n-${i}`,
                title: `Note ${i + 1}`,
                body_md: "Details",
              })),
            },
            error: null,
          };
        }
        if (name === "communityBriefs:getPlaceBrief") return { data: null, error: null };
        if (name === "communityBrain:getBrainMap") {
          const nowIso = new Date().toISOString();
          return {
            data: {
              center: { name: "Builders Pod", kind: "pod" },
              counts: { courses: 0, lessons: 0, learned: brainNodesCount, this_week: brainNodesCount },
              can_manage: true,
              courses: [],
              subjects: [],
              points: Array.from({ length: brainNodesCount }, (_, i) => ({
                id: `note:n-${i}`,
                title: `Note ${i + 1}`,
                kind: "learned",
                at: { kind: "other" },
                learned_at: nowIso,
                fresh: true,
                use: 1,
                mine: false,
              })),
              pods: [],
              arcs: brainNodesCount >= 3 ? [{ a: "note:n-0", b: "note:n-1", count: 2 }] : [],
              hidden: {},
            },
            error: null,
          };
        }
        return { data: undefined, error: null };
      },
      useLiveAnswer: vi.fn(),
      useLiveChange: vi.fn(),
    }));

    const { KitPodLanding } = await import("../apps/web/src/v1/KitPodLanding");
    const withMap = renderToStaticMarkup(
      React.createElement(KitPodLanding, {
        session: SESSION,
        communityId: "comm_1",
        pod: { channel_id: "ch_pod", name: "Builders Pod", purpose: "Ship weekly." },
        onOpen: () => {},
      }),
    );
    expect(withMap).toContain('aria-label="Open Builders Pod"');
    expect(withMap).toContain("<svg");
    expect(withMap).toContain("3 notes learned");

    brainNodesCount = 2;
    const withoutMap = renderToStaticMarkup(
      React.createElement(KitPodLanding, {
        session: SESSION,
        communityId: "comm_1",
        pod: { channel_id: "ch_pod", name: "Builders Pod", purpose: "Ship weekly." },
        onOpen: () => {},
      }),
    );
    expect(withoutMap).not.toContain('aria-label="Open Builders Pod"');
    expect(withoutMap).toContain("2 notes learned");
  });

  it("requires in-app confirmation before canceling a scheduled pod call and surfaces cancellation errors", async () => {
    const cancelCloudCommunityEvent = vi.fn().mockResolvedValue(undefined);
    const askInApp = vi.fn();
    vi.doMock(web.resolve("react"), () => ({ ...React, default: React }));
    vi.doMock("../shared/cloudCommunityEventsGateway", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../shared/cloudCommunityEventsGateway")>();
      return { ...actual, cancelCloudCommunityEvent };
    });
    vi.doMock("../shared/inAppConfirm", () => ({ askInApp }));

    const { confirmAndCancelPodCall } = await import("../apps/web/src/v1/KitPodCall");

    askInApp.mockResolvedValueOnce(false);
    const dismissed = await confirmAndCancelPodCall({
      session: SESSION,
      call: { event_id: "ev_1", title: "Weekly Critique" },
    });
    expect(dismissed).toBe("dismissed");
    expect(askInApp).toHaveBeenCalledWith(expect.objectContaining({
      yes: "Cancel call",
      no: "Keep call",
      danger: true,
    }));
    expect(cancelCloudCommunityEvent).not.toHaveBeenCalled();

    askInApp.mockResolvedValueOnce(true);
    const canceled = await confirmAndCancelPodCall({
      session: SESSION,
      call: { event_id: "ev_1", title: "Weekly Critique" },
    });
    expect(canceled).toBe("canceled");
    expect(cancelCloudCommunityEvent).toHaveBeenCalledWith({ session: SESSION, eventId: "ev_1" });

    askInApp.mockResolvedValueOnce(true);
    cancelCloudCommunityEvent.mockRejectedValueOnce(new Error("network_down"));
    await expect(confirmAndCancelPodCall({
      session: SESSION,
      call: { event_id: "ev_1", title: "Weekly Critique" },
    })).rejects.toThrow("network_down");
  });
});
