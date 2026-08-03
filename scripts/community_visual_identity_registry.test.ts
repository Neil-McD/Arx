import { describe, expect, it } from "vitest";

import {
  buildCommunityVisualIdentityFromFields,
  mergeCommunityVisualIdentity,
  type CommunityVisualIdentity,
} from "../shared/communityVisualIdentity";
import { createCommunityVisualIdentityRegistry } from "../shared/CommunityVisualIdentityRegistry";

function identity(revision: number, zoom: number): CommunityVisualIdentity {
  return {
    community_id: "community-1",
    revision,
    name: "Polynet",
    avatar: {
      resource_key: "storage:avatar-1",
      url: "https://example.com/avatar.png",
      focus_x: 0.5,
      focus_y: 0.5,
      zoom,
    },
    banner: {
      resource_key: "storage:banner-1",
      url: "https://example.com/banner.png",
      focus_x: 0.5,
      focus_y: 0.5,
      zoom: 1,
    },
  };
}

describe("community visual identity registry merge", () => {
  it("notifies only subscribers for the community that changed", () => {
    const registry = createCommunityVisualIdentityRegistry();
    let communityOneNotifications = 0;
    let communityTwoNotifications = 0;
    registry.subscribe("community-1", () => communityOneNotifications += 1);
    registry.subscribe("community-2", () => communityTwoNotifications += 1);

    registry.upsertMany([identity(12, 1.2)]);

    expect(communityOneNotifications).toBe(1);
    expect(communityTwoNotifications).toBe(0);
  });

  it("rejects a stale response that arrives after a settings mutation", () => {
    const saved = identity(12, 1.2);
    const staleDiscoverResponse = identity(11, 1.8);
    expect(mergeCommunityVisualIdentity(saved, staleDiscoverResponse)).toBe(saved);
  });

  it("upgrades every consumer when a newer revision arrives", () => {
    const stale = identity(11, 1.8);
    const fresh = identity(12, 1.2);
    expect(mergeCommunityVisualIdentity(stale, fresh)).toBe(fresh);
  });

  it("uses updated_at as the revision for legacy rows", () => {
    const visualIdentity = buildCommunityVisualIdentityFromFields({
      id: "community-1",
      name: "Polynet",
      updated_at: "2026-08-03T13:30:00.000Z",
      avatar_storage_id: "avatar-1",
      avatar_url: "https://example.com/avatar.png",
      avatar_focus_x: 0.4,
      avatar_focus_y: 0.6,
      avatar_zoom: 1.25,
    });
    expect(visualIdentity).toMatchObject({
      community_id: "community-1",
      revision: Date.parse("2026-08-03T13:30:00.000Z"),
      avatar: {
        resource_key: "storage:avatar-1",
        focus_x: 0.4,
        focus_y: 0.6,
        zoom: 1.25,
      },
    });
  });

  it("keeps the registered value on an impossible equal-revision conflict", () => {
    const registered = identity(12, 1.2);
    const conflicting = identity(12, 2);
    expect(mergeCommunityVisualIdentity(registered, conflicting)).toBe(registered);
  });

  it("accepts a refreshed signed URL for the same versioned storage asset", () => {
    const registered = identity(12, 1.2);
    const refreshed = {
      ...registered,
      avatar: {
        ...registered.avatar,
        url: "https://example.com/avatar.png?token=refreshed",
      },
    };
    expect(mergeCommunityVisualIdentity(registered, refreshed)).toBe(refreshed);
  });
});
