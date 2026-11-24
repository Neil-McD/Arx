import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ChannelFeedSkeleton,
  CourseCatalogSkeleton,
  EventListSkeleton,
  PanelBlockSkeleton,
  PodGridSkeleton,
  ThreadRepliesSkeleton,
} from "../apps/web/src/components/WebLoadingSkeleton";
import { WebCommunityInteractionBootstrap } from "../apps/web/src/components/WebCommunityInteractionBootstrap";

describe("Unified web loading skeletons (Slices 1–2)", () => {
  it("renders accessible message-shaped channel placeholders instead of a bare loading pill", () => {
    const html = renderToStaticMarkup(React.createElement(ChannelFeedSkeleton));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading messages…");
    expect((html.match(/web-skeleton-message-row/g) ?? []).length).toBe(4);
    expect((html.match(/web-skeleton-avatar/g) ?? []).length).toBe(4);
  });

  it("renders compact reply-shaped thread placeholders with accessible status text", () => {
    const html = renderToStaticMarkup(React.createElement(ThreadRepliesSkeleton));
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading replies…");
    expect((html.match(/web-skeleton-message-row is-compact/g) ?? []).length).toBe(2);
  });

  it("renders responsive course-card placeholders for Knowledge", () => {
    const html = renderToStaticMarkup(React.createElement(CourseCatalogSkeleton));
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading knowledge…");
    expect((html.match(/web-skeleton-course-card/g) ?? []).length).toBe(3);
  });

  it("keeps channel bootstrap quiet on route holds and announces opening community otherwise", () => {
    const normalHtml = renderToStaticMarkup(
      React.createElement(WebCommunityInteractionBootstrap),
    );
    expect(normalHtml).toContain("Opening community…");
    expect(normalHtml).toContain("web-skeleton-channel");
    expect(normalHtml).not.toContain("community-chat-page-loading-card");

    const quietHtml = renderToStaticMarkup(
      React.createElement(WebCommunityInteractionBootstrap, { quiet: true }),
    );
    expect(quietHtml).not.toContain("Opening community…");
    expect(quietHtml).toContain("is-quiet");
  });

  it("renders date-tile event row skeletons with accessible Loading events label", () => {
    const html = renderToStaticMarkup(React.createElement(EventListSkeleton));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading events…");
    expect((html.match(/web-skeleton-event-row/g) ?? []).length).toBe(3);
    expect((html.match(/web-skeleton-event-date/g) ?? []).length).toBe(3);
  });

  it("renders responsive pod card skeletons for Pods", () => {
    const html = renderToStaticMarkup(React.createElement(PodGridSkeleton));
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading pods…");
    expect((html.match(/web-skeleton-pod-card/g) ?? []).length).toBe(3);
  });

  it("renders compact section panel skeletons for Home, Pod landing, and Brain", () => {
    const html = renderToStaticMarkup(
      React.createElement(PanelBlockSkeleton, { label: "Loading community brain…", rows: 2, compact: true }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading community brain…");
    expect(html).toContain("web-skeleton-panel is-compact");
    expect((html.match(/web-skeleton-panel-section/g) ?? []).length).toBe(2);
  });
});
