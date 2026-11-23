// Design system v1: for a host the lesson page is the editor (Nov 17). There
// is no edit mode: the video, the title and the words are changed where they
// sit ("/" adds a block; select words to format them), and one quiet bar
// appears once something changed: Unsaved changes, Discard, Save. Nothing
// reaches members until Save. Members see a lesson when its course is live and the
// lesson has something in it; a lesson has no publish switch of its own (the
// server refuses one: publication belongs to the course). The block editor and its Markdown layer
// are Rashid's (PR #290, apps/web/src/components/lessonEditor), trimmed to
// writing and media blocks.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { StableMediaEmbedFrame } from "../../../../shared/linkEmbedUi";
import { DeferredYouTubeEmbed } from "../components/DeferredYouTubeEmbed";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
// The block editor loads only when a host edits, so members never download it.
const LessonEditor = lazy(() => import("../components/lessonEditor/LessonEditor"));
import type { CommunityResource } from "../components/communityResourcesContracts";
import { formatLessonFileSize, LESSON_FILE_MAX_BYTES, LESSON_RESOURCES_MAX } from "../../../../shared/lessonFiles";
import { Btn, cx, Icon } from "./kit";

export type LessonLink = { title: string; url: string };
// A file under the lesson: on it already, or uploaded and waiting for Save.
export type LessonFile = { id: string; title: string; name: string; type: string; size_bytes: number };
export type LessonPatch = {
  title: string; url: string | null; body_md: string; lesson_links?: LessonLink[];
  // The lesson's whole list of files, in order, each with the name to show.
  lesson_files?: Array<{ id: string; title: string }>;
};
// Links and files together.
export const LESSON_LINKS_MAX = LESSON_RESOURCES_MAX;

// What a file is, beside its name: "PDF · 4.2 MB".
export function lessonFileFacts(file: Pick<LessonFile, "type" | "size_bytes">): string {
  return `${file.type} · ${formatLessonFileSize(file.size_bytes)}`;
}

const LESSON_FILE_MAX_WORDS = formatLessonFileSize(LESSON_FILE_MAX_BYTES);
const TOO_MANY_RESOURCES = `A lesson can have ${LESSON_RESOURCES_MAX} resources at most, links and files together.`;

// An upload refused, in plain words (the route's codes: httpCommunityLessonFiles).
export function lessonFileProblem(code: string, name: string): string {
  if (code.includes("too_large")) return `${name} is over ${LESSON_FILE_MAX_WORDS}, the most a lesson file can be.`;
  if (code.includes("resources_limit")) return TOO_MANY_RESOURCES;
  if (code.includes("pending_limit")) return "Too many files are waiting to be saved. Save the lesson, then add more.";
  if (code.includes("forbidden")) return "Only people who edit courses can add files.";
  return `${name} couldn't be uploaded. Try again.`;
}

// A save refused, in plain words.
export function lessonSaveProblem(message: string): string {
  if (message.includes("lesson_resources_limit")) return TOO_MANY_RESOURCES;
  if (message.includes("lesson_video_unplayable")) return "That link isn't a video we can play. Use YouTube, Loom, Vimeo or Wistia.";
  if (message.includes("lesson_file_unavailable")) return "A file was removed, or waited too long to be saved. Add it again.";
  return "The lesson couldn't be saved. Try again.";
}

// Where a link goes, in short; nothing when its name already says so.
export function lessonLinkPlace(link: LessonLink): string {
  const place = link.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return place === link.title ? "" : place;
}

// A pasted address as a lesson's resource: a real http(s) link, named by the
// host's words or, without any, by where it goes.
export function readLessonLink(address: string, name: string): LessonLink | null {
  const raw = address.trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname.includes(".")) return null;
  const path = url.pathname.replace(/\/$/, "");
  const title = name.trim().slice(0, 120) || `${url.hostname.replace(/^www\./, "")}${path && path !== "/" ? path : ""}`.slice(0, 120);
  return { title, url: url.toString() };
}

const sameLinks = (a: LessonLink[], b: LessonLink[]) => a.length === b.length && a.every((link, index) => link.url === b[index].url && link.title === b[index].title);
const sameFiles = (a: Array<{ id: string; title: string }>, b: Array<{ id: string; title: string }>) =>
  a.length === b.length && a.every((file, index) => file.id === b[index].id && file.title === b[index].title);

// What Save sends: only a real change, and a video link only when it plays.
// The lesson's resources ride along only when they changed.
export function lessonPatchFor(resource: Pick<CommunityResource, "title" | "url" | "body_md" | "lesson_links" | "lesson_files">, draft: { title: string; video: string; body: string; links?: LessonLink[]; files?: LessonFile[] }): LessonPatch | null {
  const title = draft.title.trim();
  if (!title) return null;
  const video = draft.video.trim();
  const patch: LessonPatch = {
    title,
    url: video ? video : null,
    body_md: draft.body.replace(/\s+$/, ""),
  };
  const linksChanged = draft.links !== undefined && !sameLinks(draft.links, resource.lesson_links ?? []);
  if (linksChanged) patch.lesson_links = draft.links;
  // Files the same way: the whole list, only when it changed (one added,
  // removed or renamed). Uploaded but not saved, a file reaches no member.
  const filesChanged = draft.files !== undefined && !sameFiles(draft.files, resource.lesson_files ?? []);
  if (filesChanged) patch.lesson_files = draft.files!.map((file) => ({ id: file.id, title: file.title }));
  const same = patch.title === resource.title && (patch.url ?? "") === (resource.url ?? "")
    && patch.body_md === (resource.body_md ?? "").replace(/\s+$/, "") && !linksChanged && !filesChanged;
  return same ? null : patch;
}

export function videoLabel(url: string): string | null {
  const embed = url.trim() ? parseEmbedUrl(url.trim()) : null;
  if (!embed) return null;
  return ({ youtube: "YouTube", vimeo: "Vimeo", loom: "Loom", wistia: "Wistia" } as Record<string, string>)[embed.provider] ?? "Video";
}

export function KitLessonEditor(props: {
  resource: CommunityResource;
  onSave: (patch: LessonPatch) => Promise<void>;
  // A lesson just added: the cursor starts in its title.
  focusTitle?: boolean;
  // Told when there is something unsaved, so leaving can ask first.
  onDirtyChange?: (dirty: boolean) => void;
  // Uploads one file for this lesson (it waits for Save); none, no "Add a file".
  onUploadFile?: ((file: File) => Promise<LessonFile>) | null;
  // Downloads a file already saved on the lesson.
  onDownloadFile?: (file: LessonFile) => void;
}) {
  const { resource } = props;
  const [title, setTitle] = useState(resource.title);
  const [video, setVideo] = useState(resource.url ?? "");
  const [changingVideo, setChangingVideo] = useState(false);
  const bodyRef = useRef(resource.body_md ?? "");
  // The block editor re-writes Markdown its own way as it opens; only what the
  // host does counts as a change.
  const [bodyTouched, setBodyTouched] = useState(false);
  const [bodyVersion, setBodyVersion] = useState(0);
  // Discard re-opens the block editor on the saved words.
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The lesson's resources: links members can open under it.
  const [links, setLinks] = useState<LessonLink[]>(resource.lesson_links ?? []);
  const [linkAddress, setLinkAddress] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  // Its files: what Save will leave on it, and what is still on its way up.
  const [files, setFiles] = useState<LessonFile[]>(resource.lesson_files ?? []);
  const [uploading, setUploading] = useState<Array<{ key: string; name: string }>>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const savedFileIds = new Set((resource.lesson_files ?? []).map((file) => file.id));
  const room = LESSON_LINKS_MAX - links.length - files.length - uploading.length;
  // One at a time: each upload has storage's window to itself.
  const addFiles = async (picked: File[]) => {
    const upload = props.onUploadFile;
    if (!upload || !picked.length) return;
    const taken = picked.slice(0, Math.max(0, room));
    const tooBig = taken.find((file) => file.size > LESSON_FILE_MAX_BYTES);
    const sending = taken.filter((file) => file.size <= LESSON_FILE_MAX_BYTES)
      .map((file, index) => ({ key: `${Date.now()}-${index}-${file.name}`, name: file.name, file }));
    setError(tooBig ? lessonFileProblem("too_large", tooBig.name) : picked.length > taken.length ? TOO_MANY_RESOURCES : null);
    setUploading((current) => [...current, ...sending.map(({ key, name }) => ({ key, name }))]);
    for (const entry of sending) {
      try {
        const uploaded = await upload(entry.file);
        setFiles((current) => [...current, uploaded]);
      } catch (cause) {
        setError(lessonFileProblem(cause instanceof Error ? cause.message : "", entry.name));
      } finally {
        setUploading((current) => current.filter((item) => item.key !== entry.key));
      }
    }
  };
  // A file's shown name is changed where it sits; emptied, it goes back to the file's own name.
  const nameFile = (id: string, name: string) => setFiles(files.map((file) => (file.id === id ? { ...file, title: name.slice(0, 120) } : file)));
  const settleFileName = (id: string) => setFiles(files.map((file) => (file.id === id ? { ...file, title: file.title.trim() || file.name } : file)));
  const addLink = () => {
    const link = readLessonLink(linkAddress, "");
    if (!link) { setError("That doesn't look like a link. Paste the full address."); return; }
    if (links.some((entry) => entry.url === link.url)) { setError("That link is already on this lesson."); return; }
    setError(null);
    setLinks([...links, link]);
    setLinkAddress("");
    setAddingLink(false);
  };
  // A link's name is changed where it sits; emptied, it goes back to where the link goes.
  const nameLink = (url: string, name: string) => setLinks(links.map((entry) => (entry.url === url ? { ...entry, title: name.slice(0, 120) } : entry)));
  const settleLinkName = (url: string) => setLinks(links.map((entry) => (entry.url === url && !entry.title.trim() ? readLessonLink(url, "") ?? entry : entry.url === url ? { ...entry, title: entry.title.trim() } : entry)));
  const provider = videoLabel(video);
  const embed = provider ? parseEmbedUrl(video.trim()) : null;
  const draft = { title, video, body: bodyTouched ? bodyRef.current : resource.body_md ?? "", links, files };
  const patch = lessonPatchFor(resource, draft);
  // An empty title is a change too (it cannot be saved, and says so); so is a file on its way up.
  const dirty = Boolean(patch) || title.trim() !== resource.title.trim() || uploading.length > 0;
  void bodyVersion;
  const { onDirtyChange } = props;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  const discard = () => {
    setTitle(resource.title);
    setVideo(resource.url ?? "");
    setChangingVideo(false);
    setLinks(resource.lesson_links ?? []);
    setFiles(resource.lesson_files ?? []);
    setLinkAddress("");
    setAddingLink(false);
    bodyRef.current = resource.body_md ?? "";
    setBodyTouched(false);
    setEditorKey((key) => key + 1);
    setError(null);
  };

  const save = async () => {
    if (saving) return;
    if (!title.trim()) { setError("Give the lesson a title."); return; }
    // A link the lesson already had (a page to read, not a video) stays as it is.
    const unchangedLink = video.trim() === (resource.url ?? "").trim();
    if (video.trim() && !provider && !unchangedLink) { setError("That link isn't a video we can play. Use YouTube, Loom, Vimeo or Wistia."); return; }
    if (linkAddress.trim()) { setError("Add the link you pasted, or clear it, before saving."); return; }
    if (uploading.length) { setError("Wait for the upload to finish, then save."); return; }
    const next = lessonPatchFor(resource, draft);
    if (!next) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSave(next);
      setChangingVideo(false);
    } catch (cause) {
      console.error("lesson save failed", cause);
      setError(lessonSaveProblem(cause instanceof Error ? cause.message : ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`kit-lesson ${cx("klesson kedit")}`}>
      {/* The video, where members will see it. A link plays here as soon as it is pasted. */}
      {embed && !changingVideo ? (
        <div className={`kit-lesson-video ${cx("kedit-played")}`}>
          <div className="resource-viewer-embed" data-resource-media="true">
            {embed.provider === "youtube"
              ? <DeferredYouTubeEmbed key={embed.id} embed={embed} title={`${title} video`} />
              : <StableMediaEmbedFrame src={embed.src} title={`${title} embed`} />}
          </div>
          {/* Nothing sits under the video; these show when it is pointed at. */}
          <div className={cx("kedit-videotools")}>
            <button type="button" onClick={() => setChangingVideo(true)}>Change video</button>
            <button type="button" onClick={() => setVideo("")}>Remove</button>
          </div>
        </div>
      ) : (
        <label className={`kit-lesson-video ${cx("kedit-video", "zone")}`}>
          <span className={cx("kplay")}><Icon name="play" /></span>
          <input value={video} autoFocus={changingVideo} onChange={(event) => setVideo(event.target.value)}
            placeholder="Paste a YouTube, Loom, Vimeo or Wistia link" aria-label="Lesson video link"
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); setChangingVideo(false); } }} />
          {video.trim() && !provider ? <span className={cx("lab")}>{video.trim() === (resource.url ?? "").trim() ? "Link" : "Not a video we can play"}</span> : null}
          {video ? <Btn small txt onClick={() => { setVideo(""); setChangingVideo(false); }}>Remove</Btn> : null}
        </label>
      )}

      {/* A new lesson's stand-in title is selected, so typing replaces it. */}
      <input className={`kit-lesson-title ${cx("kedit-title")}`} value={title} autoFocus={props.focusTitle} onChange={(event) => setTitle(event.target.value)}
        onFocus={(event) => { if (props.focusTitle && title === resource.title) event.currentTarget.select(); }}
        placeholder="Lesson title" aria-label="Lesson title" maxLength={160} />

      <div className="kit-lesson-editor kit-lesson-after" onInputCapture={() => setBodyTouched(true)} onPasteCapture={() => setBodyTouched(true)} onDropCapture={() => setBodyTouched(true)}
        onKeyDownCapture={() => setBodyTouched(true)} onClickCapture={(event) => { if ((event.target as HTMLElement).closest("button, [role='menuitem'], [role='option']")) setBodyTouched(true); }}>
        <Suspense fallback={<p className={cx("sub")}>Opening the lesson…</p>}>
          <LessonEditor key={editorKey} initialMarkdown={resource.body_md ?? ""} onUploadImage={null} followAlong={false} short
            onChange={(markdown) => { bodyRef.current = markdown; setBodyVersion((n) => n + 1); }}
            onDone={() => void save()} onSaveNow={() => void save()} />
        </Suspense>
      </div>

      <div className={`kit-lesson-after ${cx("kres")}`}>
        <span className={cx("lab")}>Resources for this lesson</span>
        {links.map((link) => (
          <div key={link.url} className={cx("kresrow", "edit")}>
            <Icon name="link" />
            <input className={cx("kresname")} value={link.title} aria-label="What to call this link" maxLength={120}
              onChange={(event) => nameLink(link.url, event.target.value)} onBlur={() => settleLinkName(link.url)}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
            <em>{lessonLinkPlace(link)}</em>
            <span className={cx("kresacts")}>
              <a href={link.url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${link.title}`} title="Open"><Icon name="arrow" /></a>
              <button type="button" aria-label={`Remove ${link.title}`} title="Remove" onClick={() => setLinks(links.filter((entry) => entry.url !== link.url))}><Icon name="close" /></button>
            </span>
          </div>
        ))}
        {files.map((file) => (
          <div key={file.id} className={cx("kresrow", "edit")}>
            <Icon name="file" />
            <input className={cx("kresname")} value={file.title} aria-label="What to call this file" maxLength={120}
              onChange={(event) => nameFile(file.id, event.target.value)} onBlur={() => settleFileName(file.id)}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
            <em>{lessonFileFacts(file)}</em>
            <span className={cx("kresacts")}>
              {/* Only a file already saved on the lesson is served. */}
              {props.onDownloadFile && savedFileIds.has(file.id)
                ? <button type="button" aria-label={`Download ${file.title}`} title="Download" onClick={() => props.onDownloadFile?.(file)}><Icon name="down" /></button> : null}
              <button type="button" aria-label={`Remove ${file.title}`} title="Remove" onClick={() => setFiles(files.filter((entry) => entry.id !== file.id))}><Icon name="close" /></button>
            </span>
          </div>
        ))}
        {uploading.map((item, index) => (
          <div key={item.key} className={cx("kresrow", "kfile-busy")} role="status">
            <Icon name="file" />
            <span>{item.name}</span>
            <em>{index === 0 ? "Uploading…" : "Waiting to upload"}</em>
          </div>
        ))}
        <input ref={fileInput} type="file" multiple hidden aria-hidden="true" tabIndex={-1}
          onChange={(event) => { const picked = Array.from(event.target.files ?? []); event.target.value = ""; void addFiles(picked); }} />
        {/* One line: paste the address, press Enter. Its name is changed in the row it becomes. */}
        {room <= 0 ? null : addingLink ? (
          <label className={cx("kaddline")}>
            <Icon name="link" />
            <input value={linkAddress} autoFocus onChange={(event) => setLinkAddress(event.target.value)} placeholder="Paste a link, then press Enter" aria-label="A link for this lesson" inputMode="url"
              onBlur={() => { if (!linkAddress.trim()) setAddingLink(false); }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } else if (event.key === "Escape") { setLinkAddress(""); setAddingLink(false); } }} />
          </label>
        ) : (
          <div className={cx("kresadds")}>
            <button type="button" className={cx("kaddres")} onClick={() => setAddingLink(true)}><Icon name="plus" />Add a link</button>
            {props.onUploadFile ? <button type="button" className={cx("kaddres")} onClick={() => fileInput.current?.click()}><Icon name="plus" />Add a file</button> : null}
          </div>
        )}
      </div>

      {/* Drawn only once something changed. Nothing reaches members until Save. */}
      {dirty || error ? (
        <div className={`kit-lesson-after ${cx("kunsaved")}`} role="status">
          <i aria-hidden="true" />
          <span>{error ?? "Unsaved changes"}</span>
          {/* Not while a save is on its way: what was just sent cannot be taken back here. */}
          <button type="button" className={cx("btn sm txt")} disabled={saving || uploading.length > 0} onClick={discard}>Discard</button>
          <button type="button" className={cx("btn sm go")} disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
        </div>
      ) : null}
    </div>
  );
}
