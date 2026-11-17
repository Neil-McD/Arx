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
import { Btn, cx, Icon } from "./kit";

export type LessonLink = { title: string; url: string };
export type LessonPatch = { title: string; url: string | null; body_md: string; lesson_links?: LessonLink[] };
export const LESSON_LINKS_MAX = 12;

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

// What Save sends: only a real change, and a video link only when it plays.
// The lesson's resources ride along only when they changed.
export function lessonPatchFor(resource: Pick<CommunityResource, "title" | "url" | "body_md" | "lesson_links">, draft: { title: string; video: string; body: string; links?: LessonLink[] }): LessonPatch | null {
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
  const same = patch.title === resource.title && (patch.url ?? "") === (resource.url ?? "")
    && patch.body_md === (resource.body_md ?? "").replace(/\s+$/, "") && !linksChanged;
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
  const draft = { title, video, body: bodyTouched ? bodyRef.current : resource.body_md ?? "", links };
  const patch = lessonPatchFor(resource, draft);
  // An empty title is a change too (it cannot be saved, and says so).
  const dirty = Boolean(patch) || title.trim() !== resource.title.trim();
  void bodyVersion;
  const { onDirtyChange } = props;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  const discard = () => {
    setTitle(resource.title);
    setVideo(resource.url ?? "");
    setChangingVideo(false);
    setLinks(resource.lesson_links ?? []);
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
    const next = lessonPatchFor(resource, draft);
    if (!next) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSave(next);
      setChangingVideo(false);
    } catch (cause) {
      console.error("lesson save failed", cause);
      setError("The lesson couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`kit-lesson ${cx("klesson kedit")}`}>
      {/* The video, where members will see it. A link plays here as soon as it is pasted. */}
      {embed && !changingVideo ? (
        <>
          <div className="resource-viewer-embed" data-resource-media="true">
            {embed.provider === "youtube"
              ? <DeferredYouTubeEmbed key={embed.id} embed={embed} title={`${title} video`} />
              : <StableMediaEmbedFrame src={embed.src} title={`${title} embed`} />}
          </div>
          <div className={`kit-lesson-facts ${cx("kedit-videorow")}`}>
            <span className={cx("lab")}>{provider} video</span>
            <Btn small txt onClick={() => setChangingVideo(true)}>Change</Btn>
            <Btn small txt onClick={() => setVideo("")}>Remove</Btn>
          </div>
        </>
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
          <LessonEditor key={editorKey} initialMarkdown={resource.body_md ?? ""} onUploadImage={null} followAlong={false}
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
            <Btn small txt onClick={() => setLinks(links.filter((entry) => entry.url !== link.url))}>Remove</Btn>
          </div>
        ))}
        {/* One line: paste the address, press Enter. Its name is changed in the row it becomes. */}
        {links.length >= LESSON_LINKS_MAX ? null : addingLink ? (
          <label className={cx("kaddline")}>
            <Icon name="link" />
            <input value={linkAddress} autoFocus onChange={(event) => setLinkAddress(event.target.value)} placeholder="Paste a link, then press Enter" aria-label="A link for this lesson" inputMode="url"
              onBlur={() => { if (!linkAddress.trim()) setAddingLink(false); }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } else if (event.key === "Escape") { setLinkAddress(""); setAddingLink(false); } }} />
          </label>
        ) : (
          <button type="button" className={cx("kaddres")} onClick={() => setAddingLink(true)}><Icon name="plus" />Add a link</button>
        )}
        <span className={cx("sub")}>Members open these from the lesson, and your guide reads them too.</span>
      </div>

      {/* Drawn only once something changed. Nothing reaches members until Save. */}
      {dirty || error ? (
        <div className={`kit-lesson-after ${cx("kunsaved")}`} role="status">
          <i aria-hidden="true" />
          <span>{error ?? "Unsaved changes"}</span>
          {/* Not while a save is on its way: what was just sent cannot be taken back here. */}
          <button type="button" className={cx("btn sm txt")} disabled={saving} onClick={discard}>Discard</button>
          <button type="button" className={cx("btn sm go")} disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
        </div>
      ) : null}
    </div>
  );
}
