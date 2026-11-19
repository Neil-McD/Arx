import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { formatLessonFileSize, lessonFileTypeLabel } from "../shared/lessonFiles";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { lessonFileFacts, lessonFileProblem, lessonPatchFor, lessonSaveProblem } = await import("../apps/web/src/v1/KitLessonEditor");

describe("a lesson's files", () => {
  const workbook = { id: "f1", title: "Workbook", name: "workbook.pdf", type: "PDF", size_bytes: 4_200_000 };
  const lesson = { title: "Week 1", url: null, body_md: "Words.", lesson_links: [], lesson_files: [workbook] };
  const draft = { title: "Week 1", video: "", body: "Words.", links: [] };

  it("names a file's type from its bytes, else its name's ending, and its size as people read it", () => {
    expect(lessonFileTypeLabel("notes.bin", "application/pdf")).toBe("PDF");
    expect(lessonFileTypeLabel("Slides.docx", "application/octet-stream")).toBe("DOCX");
    expect(lessonFileTypeLabel("bundle.zip", "application/octet-stream")).toBe("ZIP");
    expect(lessonFileTypeLabel("README", "application/octet-stream")).toBe("File");
    expect(formatLessonFileSize(820)).toBe("820 B");
    expect(formatLessonFileSize(820_000)).toBe("820 KB");
    expect(formatLessonFileSize(4_200_000)).toBe("4.2 MB");
    expect(formatLessonFileSize(96_000_000)).toBe("96 MB");
    expect(lessonFileFacts(workbook)).toBe("PDF · 4.2 MB");
  });

  it("sends the whole list of files only when it changed: one added, removed or renamed", () => {
    expect(lessonPatchFor(lesson, { ...draft, files: [workbook] })).toBeNull();
    expect(lessonPatchFor(lesson, { ...draft, files: [] })?.lesson_files).toEqual([]);
    const added = { id: "f2", title: "map.zip", name: "map.zip", type: "ZIP", size_bytes: 10 };
    expect(lessonPatchFor(lesson, { ...draft, files: [workbook, added] })?.lesson_files).toEqual([{ id: "f1", title: "Workbook" }, { id: "f2", title: "map.zip" }]);
    expect(lessonPatchFor(lesson, { ...draft, files: [{ ...workbook, title: "The workbook" }] })?.lesson_files).toEqual([{ id: "f1", title: "The workbook" }]);
    // Other changes leave the files out of the save.
    expect(lessonPatchFor(lesson, { ...draft, body: "New words.", files: [workbook] })).toEqual({ title: "Week 1", url: null, body_md: "New words." });
  });

  it("says a refusal in plain words", () => {
    expect(lessonFileProblem("lesson_file_too_large", "huge.zip")).toBe("huge.zip is over 100 MB, the most a lesson file can be.");
    expect(lessonFileProblem("lesson_resources_limit", "x.pdf")).toBe("A lesson can have 12 resources at most, links and files together.");
    expect(lessonFileProblem("lesson_file_upload_failed", "x.pdf")).toBe("x.pdf couldn't be uploaded. Try again.");
    expect(lessonSaveProblem("[CONVEX M] Uncaught Error: lesson_resources_limit")).toBe("A lesson can have 12 resources at most, links and files together.");
    expect(lessonSaveProblem("Uncaught Error: lesson_file_unavailable")).toBe("A file was removed, or waited too long to be saved. Add it again.");
    expect(lessonSaveProblem("network")).toBe("The lesson couldn't be saved. Try again.");
  });
});
