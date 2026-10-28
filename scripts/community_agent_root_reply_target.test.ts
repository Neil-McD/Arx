import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCommunityRootReplyTarget } from "../apps/web/src/controllers/communityRootReplyTarget";

const baseRoot = {
  id: "root-1",
  actor_type: "human",
  actor_user_id: "user-1",
  actor_agent_key: null,
  content_summary: "Welcome to the thread.",
};

describe("community root reply target", () => {
  test("the shared thread drawer uses the canonical root-target resolver", () => {
    const panel = readFileSync(
      join(process.cwd(), "apps/web/src/components/WebCommunityChatPanel.tsx"),
      "utf8",
    );
    expect(panel).toMatch(/buildCommunityRootReplyTarget\(\{[\s\S]*root: selectedInteractionRootBundle\?\.root,[\s\S]*communityName: activeCommunity\?\.name/);
    expect(panel).not.toMatch(/if \(!root\?\.id \|\| !root\.actor_user_id\) return null/);
  });

  test("keeps an ordinary human root replyable", () => {
    expect(buildCommunityRootReplyTarget({ root: baseRoot, communityName: "Polynet" })).toEqual({
      id: "root-1",
      sender_id: "user-1",
      body: "Welcome to the thread.",
      interaction_root_id: "root-1",
      interaction_reply_id: null,
    });
  });

  test("makes the canonical community-agent root replyable without inventing a user", () => {
    expect(buildCommunityRootReplyTarget({
      root: {
        ...baseRoot,
        actor_type: "community_agent",
        actor_user_id: null,
        actor_agent_key: "community_agent",
      },
      communityName: "Builders",
    })).toEqual({
      id: "root-1",
      sender_id: "community_agent",
      body: "Welcome to the thread.",
      reply_author_label: "Builders",
      interaction_root_id: "root-1",
      interaction_reply_id: null,
    });
  });

  test("imports the canonical agent key and owns the only web reply-target type", () => {
    const helper = readFileSync(
      new URL("../apps/web/src/controllers/communityRootReplyTarget.ts", import.meta.url),
      "utf8",
    );
    const panel = readFileSync(
      new URL("../apps/web/src/components/WebCommunityChatPanel.tsx", import.meta.url),
      "utf8",
    );
    const controller = readFileSync(
      new URL("../apps/web/src/controllers/useWebCommunityChatController.ts", import.meta.url),
      "utf8",
    );
    expect(helper).toMatch(/import \{ CANONICAL_COMMUNITY_AGENT_KEY \}/);
    expect(helper).not.toMatch(/const CANONICAL_COMMUNITY_AGENT_KEY\s*=/);
    expect(helper).toMatch(/export type WebCommunityReplyTarget\s*=\s*\{/);
    expect(panel).not.toMatch(/type CommunityReplyTarget\s*=\s*\{/);
    expect(controller).not.toMatch(/export type WebCommunityReplyTarget\s*=\s*\{/);
  });

  test.each([
    { actor_type: "community_agent", actor_user_id: null, actor_agent_key: null },
    { actor_type: "community_agent", actor_user_id: null, actor_agent_key: "other_agent" },
    { actor_type: "personal_agent", actor_user_id: "user-1", actor_agent_key: "personal_agent:user-1" },
    { actor_type: "system", actor_user_id: null, actor_agent_key: null },
  ])("fails closed for a noncanonical root actor: $actor_type/$actor_agent_key", (actor) => {
    expect(buildCommunityRootReplyTarget({
      root: { ...baseRoot, ...actor },
      communityName: "Builders",
    })).toBeNull();
  });
});
