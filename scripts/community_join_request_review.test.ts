import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { CommunityJoinRequestReview } = await import("../apps/web/src/components/CommunityJoinRequestReview");
const request = { id: "request", userId: "user", displayName: "Applicant", avatarUrl: null, message: "Hello", createdAtLabel: "Today" };
const base = { canReviewJoinRequests: true, joinReviewMode: "free_approval" as const, pendingJoinRequests: [request], displayName: () => "Applicant" };
test("join review is manager-only and approval-community-only", () => {
  for (const props of [{ canReviewJoinRequests: false }, { joinReviewMode: "paid" as const }, { joinReviewMode: "free_auto" as const }]) {
    expect(renderToStaticMarkup(React.createElement(CommunityJoinRequestReview, { ...base, ...props }))).toBe("");
  }
});
test("pending review starts collapsed, caps count, and never decides while rendering", () => {
  const onApproveJoinRequest = vi.fn(), onDenyJoinRequest = vi.fn();
  const html = renderToStaticMarkup(React.createElement(CommunityJoinRequestReview, { ...base, onApproveJoinRequest, onDenyJoinRequest }));
  expect(html).toContain("1 request to join");
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("Approve Applicant");
  expect(onApproveJoinRequest).not.toHaveBeenCalled();
  expect(onDenyJoinRequest).not.toHaveBeenCalled();
  expect(renderToStaticMarkup(React.createElement(CommunityJoinRequestReview, { ...base, pendingJoinRequests: Array(201).fill(request) }))).toContain("200 or more requests to join");
});
test("empty, loading and failed review are distinct", () => {
  const props = { ...base, pendingJoinRequests: [] };
  expect(renderToStaticMarkup(React.createElement(CommunityJoinRequestReview, props))).toBe("");
  expect(renderToStaticMarkup(React.createElement(CommunityJoinRequestReview, { ...props, isLoadingJoinRequests: true }))).toContain("Loading join requests");
  expect(renderToStaticMarkup(React.createElement(CommunityJoinRequestReview, { ...props, joinRequestsError: "Could not load requests" }))).toContain("Could not load requests");
});
test("both member surfaces reuse one request renderer and existing decision handlers", () => {
  const read = (file: string) => readFileSync(new URL(`../apps/web/src/components/${file}`, import.meta.url), "utf8");
  const source = read("CommunityJoinRequestReview.tsx");
  expect(source.match(/const renderJoinRequest =/g)).toHaveLength(1);
  expect(read("CommunityContextPanel.tsx")).toContain("<CommunityJoinRequestReview {...props}");
  expect(read("ChannelRosterPanel.tsx")).toContain("<CommunityJoinRequestReview {...props.joinReview}");
  expect(read("WebCommunityInteractionProjection.tsx")).toContain("onApproveJoinRequest: props.onApproveCommunityJoinRequest");
  expect(source).toContain("isJoinRequestDecisionPending || props.isLoadingJoinRequests || !props.onApproveJoinRequest");
  expect(source).toContain("isJoinRequestDecisionPending || props.isLoadingJoinRequests || !props.onDenyJoinRequest");
});

test("community admission remains available while the channel roster is loading", async () => {
  const { ChannelRosterPanel } = await import("../apps/web/src/components/ChannelRosterPanel");
  const html = renderToStaticMarkup(React.createElement(ChannelRosterPanel, {
    communityName: "Synthetic community",
    admission: { mode: "approval", canManage: true, pending: false, error: null, onChange: vi.fn() },
    joinReview: base,
    memberSettings: {} as React.ComponentProps<typeof ChannelRosterPanel>["memberSettings"],
    getInitials: () => "A", getAvatarColor: () => "gray",
  }));
  expect(html).toContain("Loading channel roster");
  expect(html).toContain("Auto-join is off");
  expect(html).toContain("1 request to join");
});
