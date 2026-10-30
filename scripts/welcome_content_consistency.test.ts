import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("the welcome page reads and edits content the way lessons do", () => {
  const welcome = read("apps/web/src/components/WebCommunityWelcome.tsx");
  const settings = read("apps/web/src/components/WebCommunityWelcomeSettings.tsx");
  const lesson = read("apps/web/src/components/WebCommunityResourceViewerContent.tsx");
  for (const source of [welcome, settings, lesson]) expect(source).toContain("CONTENT_MARKDOWN_OPTIONS");
  expect(welcome).not.toContain("{ embedStandaloneMedia: true }");
  expect(welcome.match(/CONTENT_PROSE_CLASS/g)!.length).toBeGreaterThanOrEqual(3);
  expect(settings).toContain('const LessonEditor = lazy(() => import("./lessonEditor/LessonEditor"));');
  expect(settings.match(/<LessonEditor\b/g)).toHaveLength(2);
  expect(settings).toContain('label: "Welcome page"');
  expect(settings).not.toContain("welcome-settings-choice-text");
});
