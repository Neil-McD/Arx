// Design system v1: editing a lesson where it is read (Skool's classroom,
// Notion's editing). The lesson's video at the top (a YouTube, Loom, Vimeo or
// Wistia link), then the lesson itself in the block editor ("/" for blocks),
// then Cancel and Save. Members see a lesson when its course is live and the
// lesson has something in it; a lesson has no publish switch of its own (the
// server refuses one: publication belongs to the course). The block editor and its Markdown layer
// are Rashid's (PR #290, apps/web/src/components/lessonEditor), trimmed to
// writing and media blocks.
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
// The block editor loads only when a host edits, so members never download it.
const LessonEditor = lazy(() => import("../components/lessonEditor/LessonEditor"));
import type { CommunityResource } from "../components/communityResourcesContracts";
import { Btn, cx, Icon } from "./kit";

export type LessonPatch = { title: string; url: string | null; body_md: string };

// What Save sends: only a real change, and a video link only when it plays.
export function lessonPatchFor(resource: Pick<CommunityResource, "title" | "url" | "body_md">, draft: { title: string; video: string; body: string }): LessonPatch | null {
  const title = draft.title.trim();
  if (!title) return null;
  const video = draft.video.trim();
  const patch: LessonPatch = {
    title,
    url: video ? video : null,
    body_md: draft.body.replace(/\s+$/, ""),
  };
  const same = patch.title === resource.title && (patch.url ?? "") === (resource.url ?? "")
    && patch.body_md === (resource.body_md ?? "").replace(/\s+$/, "");
  return same ? null : patch;
}

export function videoLabel(url: string): string | null {
  const embed = url.trim() ? parseEmbedUrl(url.trim()) : null;
  if (!embed) return null;
  return ({ youtube: "YouTube", vimeo: "Vimeo", loom: "Loom", wistia: "Wistia" } as Record<string, string>)[embed.provider] ?? "Video";
}

export function KitLessonEditor(props: {
  resource: CommunityResource;
  index: number;
  total: number;
  courseLive: boolean;
  onSave: (patch: LessonPatch) => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const { resource } = props;
  const [title, setTitle] = useState(resource.title);
  const [video, setVideo] = useState(resource.url ?? "");
  const bodyRef = useRef(resource.body_md ?? "");
  const [bodyVersion, setBodyVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const provider = videoLabel(video);
  const thumb = useMemo(() => {
    const embed = video.trim() ? parseEmbedUrl(video.trim()) : null;
    return embed && embed.provider === "youtube" ? embed.thumbnailUrl : null;
  }, [video]);
  const patch = lessonPatchFor(resource, { title, video, body: bodyRef.current });
  void bodyVersion;

  const save = async () => {
    if (saving) return;
    if (!title.trim()) { setError("Give the lesson a title."); return; }
    // A link the lesson already had (a page to read, not a video) stays as it is.
    const unchangedLink = video.trim() === (resource.url ?? "").trim();
    if (video.trim() && !provider && !unchangedLink) { setError("That link isn't a video we can play. Use YouTube, Loom, Vimeo or Wistia."); return; }
    const next = lessonPatchFor(resource, { title, video, body: bodyRef.current });
    if (!next) { props.onCancel(); return; }
    setSaving(true);
    setError(null);
    try {
      await props.onSave(next);
    } catch (cause) {
      console.error("lesson save failed", cause);
      setError("The lesson couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cx("klesson kedit")}>
      <span className={cx("lab")}>Editing lesson {props.index + 1} of {props.total}</span>
      <input className={cx("kedit-title")} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Lesson title" aria-label="Lesson title" maxLength={160} />

      <div className={cx("kedit-video", provider && "has")}>
        {thumb ? <span className={cx("kedit-thumb")} style={{ backgroundImage: `url(${JSON.stringify(thumb)})` }} /> : <span className={cx("kplay")}><Icon name="play" /></span>}
        <div>
          <span className={cx("lab")}>{provider ? `${provider} video` : video.trim() ? "Link" : "Lesson video"}</span>
          <input value={video} onChange={(event) => setVideo(event.target.value)} placeholder="Paste a YouTube, Loom, Vimeo or Wistia link" aria-label="Lesson video link" />
        </div>
        {video ? <Btn small txt onClick={() => setVideo("")}>Remove</Btn> : null}
      </div>

      <div className="kit-lesson-editor">
        <Suspense fallback={<p className={cx("sub")}>Opening the editor…</p>}>
        <LessonEditor initialMarkdown={resource.body_md ?? ""} onUploadImage={null} followAlong={false}
          onChange={(markdown) => { bodyRef.current = markdown; setBodyVersion((n) => n + 1); }}
          onDone={() => void save()} onSaveNow={() => void save()} />
        </Suspense>
      </div>

      {error ? <p className={cx("bad")} role="alert" style={{ marginTop: 12 }}>{error}</p> : null}
      <div className={cx("kedit-bar")}>
        <span className={cx("kedit-pub")}>{props.courseLive ? "Members can see this course" : "Draft course · only hosts see it"}</span>
        {confirmDelete ? (
          <>
            <button type="button" className={cx("btn sm no")} onClick={() => void props.onDelete()}>Delete lesson for good</button>
            <Btn small txt onClick={() => setConfirmDelete(false)}>Keep it</Btn>
          </>
        ) : <Btn small txt onClick={() => setConfirmDelete(true)}>Delete</Btn>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn small txt onClick={props.onCancel}>Cancel</Btn>
          <button type="button" className={cx("btn sm go")} disabled={saving || !patch} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
        </span>
      </div>
    </div>
  );
}
