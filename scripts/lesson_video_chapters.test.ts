import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseLessonChapterLine } from "../apps/web/src/components/WebCommunityResourceViewerContent";

test("chapter lines read the way YouTube descriptions write them", () => {
  expect(parseLessonChapterLine("02:15 Set up the map")).toEqual({ time: "02:15", seconds: 135, label: "Set up the map" });
  expect(parseLessonChapterLine("1:02:03 - Wrap up")).toEqual({ time: "1:02:03", seconds: 3723, label: "Wrap up" });
  expect(parseLessonChapterLine("(0:00) Intro")).toEqual({ time: "0:00", seconds: 0, label: "Intro" });
  expect(parseLessonChapterLine("At 02:15 we start")).toBeNull();
  expect(parseLessonChapterLine("02:15")).toBeNull();
});

test("chapters sit in the right panel and seek the video, reloading it only once", () => {
  const source = readFileSync(new URL("../apps/web/src/components/WebCommunityResourceViewerContent.tsx", import.meta.url), "utf8");
  expect(source).toContain('<nav className="lesson-rail-section lesson-chapters-section" aria-label="Video chapters">');
  // The video sits at the top of the text column, so the side column's Chapters start level with it.
  expect(source.indexOf('<div className="resource-viewer-hero" ref={heroRef}>')).toBeGreaterThan(source.indexOf('<div className="resource-viewer-column">'));
  expect(source).toContain('url.searchParams.set("enablejsapi", "1")');
  expect(source).toContain('JSON.stringify({ event: "command", func, args })');
});

import { parseYouTubeChapters, youTubeDescriptionFromWatchPage } from "../shared/youtubeChapters";

test("chapters are read from the video's description the way YouTube reads them", () => {
  const description = "My video\n\n0:00 Intro\n1:30 - The map\n12:05 Hand it to your AI\nThanks!";
  expect(parseYouTubeChapters(description)).toEqual([
    { seconds: 0, time: "0:00", label: "Intro" },
    { seconds: 90, time: "1:30", label: "The map" },
    { seconds: 725, time: "12:05", label: "Hand it to your AI" },
  ]);
  // No 0:00 start, or fewer than three: YouTube shows no chapters, nor do we.
  expect(parseYouTubeChapters("1:00 A\n2:00 B\n3:00 C")).toEqual([]);
  expect(parseYouTubeChapters("0:00 A\n2:00 B")).toEqual([]);
  const html = 'var ytInitialPlayerResponse = {"videoDetails":{"shortDescription":"Hi \\"there\\"\\n0:00 Intro\\n0:30 Two\\n1:00 Three","x":1}};';
  expect(youTubeDescriptionFromWatchPage(html)).toBe('Hi "there"\n0:00 Intro\n0:30 Two\n1:00 Three');
  expect(parseYouTubeChapters(youTubeDescriptionFromWatchPage(html)!)).toHaveLength(3);
});

test("the lesson asks the server for the video's chapters when none are written", () => {
  const source = readFileSync(new URL("../apps/web/src/components/WebCommunityResourceViewerContent.tsx", import.meta.url), "utf8");
  expect(source).toContain("loadCloudYouTubeChapters(session, videoId)");
  // The lesson's own video, shown wide above the body, counts too.
  expect(source).toContain('embed?.provider === "youtube" ? embed.id : null');
  expect(source).toContain('root?.closest<HTMLElement>(".resource-viewer-content")');
  const server = readFileSync(new URL("../convex/youtubeChapters.ts", import.meta.url), "utf8");
  expect(server).toContain("process.env.YOUTUBE_API_KEY");
  expect(server).toContain("export const loadYouTubeChapters = action(");
});
