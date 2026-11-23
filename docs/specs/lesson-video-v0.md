# Lesson video through every door (v0)

Status: built Nov 23 2026 (PR on branch `claude/lesson-video`).

## Why

A lesson's video is the first thing a member sees. Today only a person in the app can set it. Claude and ChatGPT can't (the named course tools have no field for it), the guide can but is never told how, and the server accepts any web page as a "video" because the only check runs in the browser.

## Ground truth (main at e71335c35)

| Door | Sets the video? | Check |
|---|---|---|
| App, lesson editor (`KitLessonEditor` → `communityResources:saveCommunityResource`, field `url`) | Yes | Browser only: `parseEmbedUrl` (YouTube, Loom, Vimeo, Wistia). An old non-video link the lesson already had is left as it is. |
| Server, app save (`convex/communityResources.ts` ~1380) and app create (~1587) | Stores `url` | `normalizeOptionalUrl`: any http(s) link |
| Server, course batch engine (`convex/communityResourceChangesets.ts`: create_page ~819, edit_page ~913) | Stores `url` | Same: any http(s) link |
| The guide (`polynet_change_courses`, schema `RESOURCE_CHANGESET_OPERATION_SCHEMA.url`) | Can | Never told: not in its tool description or `shared/guideSkills.ts` |
| Claude / ChatGPT (`polynet_add_lesson`, `polynet_edit_lesson` in `shared/actionTools.ts`) | **No field** | n/a |
| Reads (`convex/communityResourceDirectory.ts`) | Shown as `url`; an empty lesson reads "External resource: <url>" | Not called a video |

`parseEmbedUrl` lives in `shared/linkEmbedUi.tsx`, which imports React, so the server can't use it. A lesson's `url` never triggers source reading (only `role: "source"` rows are read), so changing it costs nothing.

## The rule

A lesson's video is a link the lesson can play: YouTube, Loom, Vimeo or Wistia, as `parseEmbedUrl` reads it today. Empty means no video.

- Checked on the server whenever a lesson's video is **set or changed**, through any door. Refused with code `lesson_video_unplayable` and the words: "That link isn't a video we can play. Use YouTube, Loom, Vimeo or Wistia."
- A lesson whose existing link isn't a video keeps it until someone changes it. No migration.
- Sources (`role: "source"`) are untouched: their `url` is a page to read, not a video.

## Changes

1. **One parser the server can use.** Move the pure parsing (`hostMatches`, `parseYouTubeId`, `parseWistiaId`, `parseVimeoId`, `parseLoomId`, `parseEmbedUrl`, `parseYouTubeEmbedUrl`, `buildYouTubeThumbnailUrls`, `ParsedEmbed`) to `shared/videoEmbed.ts` with no React import. `shared/linkEmbedUi.tsx` re-exports them, so the web app doesn't change. Add `lessonVideoProblem(next, previous): string | null` there.
2. **Server check in three places:** app save (when `url` is in the payload and differs), app create (role `page` with a `url`), batch engine create_page and edit_page. The engine refuses the whole batch, as it does for other bad operations.
3. **Named tools for outside AIs:**
   - `polynet_add_lesson`: new optional `video` (string, up to 2,048 characters) and `lesson_links` (up to 12, `{ title ≤120, url ≤2,048 }`, the same field as `polynet_edit_lesson`).
   - `polynet_edit_lesson`: new optional `video`; `null` or `""` removes it; left out, nothing changes.
   - Both map `video` to the engine's `url`. Removal is sent as `""`, because the executor drops null fields before the engine sees them. The batch still carries its summary line (#736).
4. **The guide is told:** `polynet_change_courses` description says "`url` on create_page / edit_page is the lesson's video (YouTube, Loom, Vimeo or Wistia)"; one line in the course-building skill in `shared/guideSkills.ts`.
5. **Reads say video:** lesson reads and `builder/resources/` rows get `video` (the link, or null) and `video_provider` (`youtube` | `loom` | `vimeo` | `wistia` | null). `url` stays for older lessons. The empty-lesson summary says "Video: <url>" when it plays.
6. **Error words:** `lesson_video_unplayable` added to the executor's plain-message list (next to `lesson_resources_limit`) and to the app's `lessonSaveProblem`.
7. **Docs:** `docs/polynet-workspace-mcp-contract-v0.md` tool list; `plugins/openai/polynet` test notes only if a tool description there is copied.

## Tests

- `convex/mcpLenses.test.ts`, the named-tools test from #736, extended: add a lesson with a YouTube video and two links; change it to a Loom link; remove it; a non-video link refused with `lesson_video_unplayable` and nothing saved; a lesson whose old page link is untouched by an edit to its title keeps it.
- `convex/communityResourceBuilder.test.ts`: the guide's batch with a playable `url` saves; with a page link is refused whole.
- App save (existing resource tests): a non-video `url` refused; an unchanged old link still saves the title.
- `convex/communityLessonVideo.test.ts` (the rule, the app's save, the guide's batch) and the `shared/videoEmbed` checks: the four providers, YouTube short links and `?t=` starts, a page link, empty.
- Reads: `video` and `video_provider` on a lesson read and a builder row.

## Out of this slice

- **Lesson links handed to the guide on the server.** Today the browser hands a lesson's new links to the guide to read after an app save; links added through the guide or an outside AI are never read. Moving it to the server means starting paid reading from a server path (who pays, how many per day). Its own slice.
- Course banner through the tools (needs image upload).
- Lesson files through the tools (a person's own click, on purpose).
- Writing a lesson from a video's transcript.

## Release

One PR, GitHub's gate, Neil's word, `npm run release:prod`. The OpenAI listing is in review: its scan reads the live tools and will see two new optional fields. After release, refresh the tool list in claude.ai's Polynet connector so the directory listing matches.
