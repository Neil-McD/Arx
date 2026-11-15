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

export type LessonLink = { title: string; url: string };
export type LessonPatch = { title: string; url: string | null; body_md: string; lesson_links?: LessonLink[] };
export const LESSON_LINKS_MAX = 12;

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
  index: number;
  total: number;
  courseLive: boolean;
  onSave: (patch: LessonPatch) => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
  // The other courses this lesson could move to, and the move itself.
  moveTargets?: Array<{ id: string; name: string }>;
  onMove?: (courseId: string) => Promise<void>;
}) {
  const { resource } = props;
  const [title, setTitle] = useState(resource.title);
  const [video, setVideo] = useState(resource.url ?? "");
  const bodyRef = useRef(resource.body_md ?? "");
  const [bodyVersion, setBodyVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moving, setMoving] = useState(false);
  // The lesson's resources: links members can open under it.
  const [links, setLinks] = useState<LessonLink[]>(resource.lesson_links ?? []);
  const [linkAddress, setLinkAddress] = useState("");
  const [linkName, setLinkName] = useState("");
  const addLink = () => {
    const link = readLessonLink(linkAddress, linkName);
    if (!link) { setError("That doesn't look like a link. Paste the full address."); return; }
    if (links.some((entry) => entry.url === link.url)) { setError("That link is already on this lesson."); return; }
    setError(null);
    setLinks([...links, link]);
    setLinkAddress("");
    setLinkName("");
  };
  const provider = videoLabel(video);
  const thumb = useMemo(() => {
    const embed = video.trim() ? parseEmbedUrl(video.trim()) : null;
    return embed && embed.provider === "youtube" ? embed.thumbnailUrl : null;
  }, [video]);
  const patch = lessonPatchFor(resource, { title, video, body: bodyRef.current, links });
  void bodyVersion;

  const save = async () => {
    if (saving) return;
    if (!title.trim()) { setError("Give the lesson a title."); return; }
    // A link the lesson already had (a page to read, not a video) stays as it is.
    const unchangedLink = video.trim() === (resource.url ?? "").trim();
    if (video.trim() && !provider && !unchangedLink) { setError("That link isn't a video we can play. Use YouTube, Loom, Vimeo or Wistia."); return; }
    if (linkAddress.trim()) { setError("Add the link you pasted, or clear it, before saving."); return; }
    const next = lessonPatchFor(resource, { title, video, body: bodyRef.current, links });
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

      <div className={cx("kres")}>
        <span className={cx("lab")}>Resources for this lesson</span>
        {links.map((link) => (
          <div key={link.url} className={cx("kresrow")}>
            <Icon name="link" /><span><b>{link.title}</b><em>{link.url.replace(/^https?:\/\//i, "")}</em></span>
            <Btn small txt onClick={() => setLinks(links.filter((entry) => entry.url !== link.url))}>Remove</Btn>
          </div>
        ))}
        {links.length < LESSON_LINKS_MAX ? (
          <div className={cx("kresadd")}>
            <input value={linkAddress} onChange={(event) => setLinkAddress(event.target.value)} placeholder="Paste a link" aria-label="A link for this lesson" inputMode="url"
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} />
            <input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="What to call it (optional)" aria-label="What to call the link" maxLength={120}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} />
            <button type="button" className={cx("btn sm")} disabled={!linkAddress.trim()} onClick={addLink}>Add</button>
          </div>
        ) : null}
        <span className={cx("sub")}>Members open these from the lesson, and your guide reads them too.</span>
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
        {props.onMove && props.moveTargets?.length && !confirmDelete ? (
          // A lesson moves as it was last saved, so unsaved words are saved or
          // dropped first.
          <select className={cx("kmoveto")} aria-label="Move this lesson to another course" value="" disabled={moving || Boolean(patch)}
            title={patch ? "Save or cancel your changes first" : undefined}
            onChange={(event) => {
              const courseId = event.target.value;
              if (!courseId) return;
              setMoving(true);
              void props.onMove!(courseId).catch(() => setError("The lesson couldn't be moved. Try again.")).finally(() => setMoving(false));
            }}>
            <option value="">{moving ? "Moving…" : "Move to another course"}</option>
            {props.moveTargets.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
        ) : null}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn small txt onClick={props.onCancel}>Cancel</Btn>
          <button type="button" className={cx("btn sm go")} disabled={saving || !patch} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
        </span>
      </div>
    </div>
  );
}
