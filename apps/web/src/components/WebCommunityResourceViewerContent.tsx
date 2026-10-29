import {
  lazy,
  Suspense,
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { normalizeExternalUrl, parseEmbedUrl, StableMediaEmbedFrame } from "../../../../shared/linkEmbedUi";
import { CONTENT_MARKDOWN_OPTIONS, renderMarkdown } from "../../../../shared/markdownUi";
import { parseChapterLine } from "../../../../shared/youtubeChapters";
import { loadCloudYouTubeChapters } from "../../../../shared/cloudYouTubeChaptersGateway";
import { useWebCommunityFrame } from "../controllers/useWebCommunityFrame";
import type { CommunityEmbedContext } from "../../../../shared/communityEmbedUi";
import type { CommunityEmbedStorage } from "../../../../shared/communityEmbed";
import { buildCommunityResourceEvidenceRef } from "../../../../shared/communityEvidenceContract";
import {
  parseCommunityLessonElements,
  publicCommunityLessonElement,
  splitCommunityLessonSlides,
  type CommunityLessonElement,
} from "../../../../shared/communityLessonContract";
import { markCommunityLessonElementBlocks } from "../../../../shared/communityLessonElementMarkdown";
import type { WebCommunityLessonProgress } from "../controllers/useWebCommunityLessonProgress";
import { WebLessonElement, type WebLessonFormAccess } from "./WebLessonElement";
import { DeferredYouTubeEmbed } from "./DeferredYouTubeEmbed";
import { ArrowRight, Check, Eye, FileText, History, ListOrdered, PenLine, PlayCircle } from "lucide-react";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import {
  isLessonFileLink,
  LESSON_TOC_MIN_ENTRIES,
  lessonBodyForPlatform,
  lessonPlatforms,
  lessonTocSlug,
  type LessonTocEntry,
} from "../../../../shared/lessonReadingView";
import { WebPlatformTabList } from "./WebPlatformChoiceControls";
import { WebLessonSlideDeck } from "./WebLessonSlideDeck";
import type { CommunityResource } from "./communityResourcesContracts";

// How long a member reads a lesson before it counts as started.
const LESSON_START_AFTER_MS = 15_000;

// Only owners and their team edit, so the editor loads when editing starts.
const LessonEditor = lazy(() => import("./lessonEditor/LessonEditor"));

// The server keeps a page body to this many characters.
const LESSON_BODY_MAX_CHARS = 20_000;

const LESSON_BLOCK_PROBLEMS: Record<string, string> = {
  duplicate_id: "two blocks share the id",
  too_many_elements: "a lesson can hold up to 40 buttons, checklists, quizzes and forms; this one is past it at",
};

/** Why the server would refuse this body, in words, or null. */
function lessonBodyProblem(body: string): string | null {
  if (body.length > LESSON_BODY_MAX_CHARS) {
    return `This lesson is ${body.length.toLocaleString()} characters; a page holds ${LESSON_BODY_MAX_CHARS.toLocaleString()}. Split it into two lessons to save it.`;
  }
  try {
    parseCommunityLessonElements(body, { strict: true });
    return null;
  } catch (error) {
    const [, id = "", problem = ""] = (error instanceof Error ? error.message : "").split(":");
    const known = LESSON_BLOCK_PROBLEMS[problem];
    return known ? `Not saved yet: ${known} "${id}".` : `Not saved yet: the block "${id}" needs fixing (see the note on it).`;
  }
}

// A lesson's buttons, checklists, quizzes and forms read their answers and
// handlers from here, so answering one updates it in place. Rendering the body
// again would replace the control the member is using and drop their focus
// (and, between a key's press and release, the answer itself).
type LessonElementScope = {
  byId: ReadonlyMap<string, CommunityLessonElement>;
  activity: WebLessonActivity;
  responses: WebCommunityLessonProgress["responsesByRef"][string] | undefined;
  resourceId: string;
  lessonRef: string;
};
const LessonElementScopeContext = createContext<LessonElementScope | null>(null);

function LessonElementSlot(props: { id: string }) {
  const scope = useContext(LessonElementScopeContext);
  const element = scope?.byId.get(props.id);
  if (!scope || !element) return null;
  const { activity, resourceId, lessonRef } = scope;
  return (
    <WebLessonElement
      element={element}
      response={scope.responses?.[props.id] ?? null}
      signedIn={activity.signedIn}
      onRequireSignIn={activity.onRequireSignIn}
      onAnswer={(value) => activity.progress.answer(resourceId, lessonRef, props.id, value)}
      onMarkDone={() => activity.progress.setStatus(resourceId, lessonRef, "done")}
      onAskAgent={activity.onAskAgent ?? null}
      forms={activity.forms}
    />
  );
}

// A draft can be mid-edit; Preview shows whatever elements already read cleanly.
function previewLessonElements(body: string) {
  try {
    return parseCommunityLessonElements(body).map(publicCommunityLessonElement);
  } catch {
    return [];
  }
}

type WebCommunityResourceViewerContentProps = {
  resource: CommunityResource;
  editor?: WebCommunityResourceInlineEditor | null;
  communityEmbeds?: CommunityEmbedContext | null;
  lessonActivity?: WebLessonActivity | null;
  /** Replaces the lesson's own Mark as done row (a page with its own Mark done / Next). */
  actions?: ReactNode;
  /** The lesson's place in its course: the line over the title and the Next button. */
  course?: WebLessonCoursePlace | null;
};

export type WebLessonCoursePlace = {
  name: string;
  position: number;
  total: number;
  next: { title: string; open: () => void } | null;
};

/** About 230 words a minute, as Medium counts it. */
function lessonReadMinutes(body: string | null): number {
  const words = (body ?? "").replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  return words < 40 ? 0 : Math.max(1, Math.round(words / 230));
}

/** What a lesson's buttons, checklists, quizzes and forms need from the page. */
export type WebLessonActivity = {
  progress: WebCommunityLessonProgress;
  signedIn: boolean;
  onRequireSignIn: () => void;
  forms: WebLessonFormAccess | null;
  onAskAgent?: ((text: string) => void) | null;
  /** Where widget answers are kept for this member; the browser when absent. */
  embedStorage?: CommunityEmbedStorage | null;
};

export type WebCommunityResourceInlineEditorField = "title" | "body" | "pin";

export type WebCommunityResourceInlineEditor = {
  canEdit: boolean;
  isEditing: boolean;
  activeField: WebCommunityResourceInlineEditorField | null;
  titleInput: string;
  bodyInput: string;
  pinnedInput: boolean;
  error: string | null;
  isSaving: boolean;
  isDirty: boolean;
  canSave: boolean;
  onBeginEdit: (field: WebCommunityResourceInlineEditorField) => void;
  onSetActiveField: (field: WebCommunityResourceInlineEditorField) => void;
  onChangeTitle: (value: string) => void;
  onChangeBody: (value: string) => void;
  onChangePinned: (value: boolean) => void;
  onSave: () => Promise<boolean> | boolean;
  /** Saves and keeps editing (autosave). */
  onSaveInPlace?: (() => Promise<boolean>) | null;
  onUploadImage?: ((file: File) => Promise<string>) | null;
  /** The course's Article / Video course switch, shown while editing. */
  styleControl?: ReactNode;
  /** Opens the lesson's Version history. */
  onOpenVersions?: (() => void) | null;
  onCancel: () => void;
};

// The member's platform (Cowork, Claude Code, Codex…), shared with the Roadmap.
const LESSON_PLATFORM_KEY = "polynet-lesson-platform";
function readLessonPlatform(): string {
  try { return localStorage.getItem(LESSON_PLATFORM_KEY) || ""; } catch { return ""; }
}

type LessonFileLink = { href: string; label: string };
type LessonChapter = { id: string; label: string; time: string; seconds: number };

// A lesson's YouTube video shows its chapters beside it, read automatically
// from the video's description (convex/youtubeChapters.ts). Timestamp lines
// written in the lesson itself ("02:15 Title") take their place when present,
// so an owner or their agent can still set their own.
const LESSON_CHAPTER_MIN = 2;
export const parseLessonChapterLine = parseChapterLine;
const YOUTUBE_FRAME_SELECTOR = 'iframe[src*="youtube.com/embed/"], iframe[src*="youtube-nocookie.com/embed/"]';

function lessonYouTubeId(root: HTMLElement): string | null {
  const src = root.querySelector<HTMLIFrameElement>(YOUTUBE_FRAME_SELECTOR)?.src;
  const match = src ? /\/embed\/([A-Za-z0-9_-]{6,20})/.exec(src) : null;
  return match?.[1] ?? null;
}

/** Plays the lesson's YouTube video from `seconds`, scrolling it into view. */
function seekLessonVideo(root: HTMLElement | null, seconds: number) {
  // The video can be the lesson's own, shown wide above the body, or one in it.
  const scope = root?.closest<HTMLElement>(".resource-viewer-content") ?? root;
  const frame = scope?.querySelector<HTMLIFrameElement>(YOUTUBE_FRAME_SELECTOR);
  if (!frame) return;
  frame.scrollIntoView({ behavior: "smooth", block: "center" });
  const url = new URL(frame.src);
  if (url.searchParams.get("enablejsapi") === "1" && frame.contentWindow) {
    // The player already listens: jump without reloading it.
    for (const [func, args] of [["seekTo", [seconds, true]], ["playVideo", []]] as const) {
      frame.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    }
    return;
  }
  url.searchParams.set("start", String(seconds));
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("enablejsapi", "1");
  frame.src = url.href;
}

// Reads the lesson for its contents (sections, then videos under the section
// they sit in) and the files it links to. In the read view each stop gets an
// id to jump to; in the editor the headings are tracked by element, because
// the editor owns its DOM and must not be written to. Rescans as the body
// changes, so the editor's contents follow typing.
function isStandaloneBoldLine(node: HTMLElement): boolean {
  if (node.closest("blockquote, li, table, .md-callout")) return false;
  const only = node.children.length === 1 ? node.children[0] : null;
  if (!only || !/^(STRONG|B)$/.test(only.tagName)) return false;
  const text = node.textContent?.trim() ?? "";
  return text.length > 0 && text.length <= 90 && text === only.textContent?.trim();
}

function useLessonContents(root: { current: HTMLElement | null }, mode: "read" | "edit", renderKey: unknown, session: unknown, heroVideoId: string | null) {
  const [toc, setToc] = useState<LessonTocEntry[]>([]);
  const [files, setFiles] = useState<LessonFileLink[]>([]);
  const [writtenChapters, setChapters] = useState<LessonChapter[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoChapters, setVideoChapters] = useState<{ videoId: string; chapters: LessonChapter[] } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const targetsRef = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    const element = root.current;
    if (!element) {
      setToc([]);
      setFiles([]);
      setChapters([]);
      return;
    }
    let frame = 0;
    const scan = () => {
      frame = 0;
      const taken = new Set<string>();
      const entries: LessonTocEntry[] = [];
      const targets = new Map<string, HTMLElement>();
      // The read view renders "##" and "###" one level down (h3, h4); the editor
      // shows them as h2 and h3. Platform section markers are not contents.
      // A short line that is bold on its own is a section title too: many
      // lessons title their sections that way instead of with "##".
      const selector = mode === "edit"
        ? ".ProseMirror h2, .ProseMirror h3:not(.lesson-editor-platform-heading), .ProseMirror > p"
        : "h3.md-header, h4.md-header, .md-media-embed, .md-video, p";
      element.querySelectorAll<HTMLElement>(selector).forEach((node) => {
        if (node.closest(".lesson-slide-deck")) return;
        if (node.tagName === "P" && !isStandaloneBoldLine(node)) return;
        const isVideo = mode === "read" && !node.matches(".md-header, p");
        const label = isVideo
          ? (node.querySelector("iframe")?.getAttribute("title") || node.getAttribute("aria-label") || "Video").replace(/\s+embed$/i, "")
          : node.textContent?.trim() ?? "";
        if (!label) return;
        const id = mode === "read" ? (node.id || lessonTocSlug(label, taken)) : lessonTocSlug(label, taken);
        if (mode === "read") node.id = id;
        targets.set(id, node);
        const isSub = isVideo || node.tagName === (mode === "edit" ? "H3" : "H4");
        entries.push({ id, label, level: isSub ? 3 : 2, kind: isVideo ? "video" : "section" });
      });
      targetsRef.current = targets;
      const nextToc = entries.length >= LESSON_TOC_MIN_ENTRIES ? entries : [];
      setToc((current) => (JSON.stringify(current) === JSON.stringify(nextToc) ? current : nextToc));
      const seen = new Set<string>();
      const nextFiles = Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]"))
        .filter((link) => isLessonFileLink(link.href) && !seen.has(link.href) && Boolean(seen.add(link.href)))
        .map((link) => ({ href: link.href, label: link.textContent?.trim() || decodeURIComponent(link.pathname.split("/").pop() ?? "File") }));
      setFiles((current) => (JSON.stringify(current) === JSON.stringify(nextFiles) ? current : nextFiles));
      // Chapters: timestamp lines, once the lesson has a YouTube video to play.
      const nextChapters: LessonChapter[] = [];
      const shownVideo = mode === "read" ? heroVideoId ?? lessonYouTubeId(element) : null;
      setVideoId(shownVideo);
      if (shownVideo) {
        element.querySelectorAll<HTMLElement>("p, li").forEach((node) => {
          if (node.closest(".lesson-slide-deck, .code-block-wrapper") || node.querySelector("p, li")) return;
          const chapter = parseLessonChapterLine(node.textContent ?? "");
          if (!chapter) return;
          node.classList.add("lesson-chapter-line");
          node.dataset.seconds = String(chapter.seconds);
          nextChapters.push({ id: `chapter-${chapter.seconds}-${nextChapters.length}`, ...chapter });
        });
      }
      const shownChapters = nextChapters.length >= LESSON_CHAPTER_MIN ? nextChapters : [];
      setChapters((current) => (JSON.stringify(current) === JSON.stringify(shownChapters) ? current : shownChapters));
    };
    scan();
    // A chapter line in the lesson itself plays the video from there too, so it
    // works on a phone, where the right panel folds away.
    const onChapterClick = (event: Event) => {
      const line = (event.target as HTMLElement | null)?.closest<HTMLElement>(".lesson-chapter-line");
      if (!line || (event.target as HTMLElement).closest("a, button") || !line.dataset.seconds) return;
      seekLessonVideo(element, Number(line.dataset.seconds));
    };
    if (mode === "read") element.addEventListener("click", onChapterClick);
    // Ids are attributes, so watching only content can't loop on our own writes.
    const observer = new MutationObserver(() => {
      if (!frame) frame = window.requestAnimationFrame(scan);
    });
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("click", onChapterClick);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [root, mode, renderKey, heroVideoId]);
  // The section being read is the last heading that has scrolled past the top third.
  useEffect(() => {
    if (!toc.length) return;
    const targets = toc.map((entry) => targetsRef.current.get(entry.id)).filter((node): node is HTMLElement => Boolean(node));
    const ids = new Map(toc.map((entry) => [targetsRef.current.get(entry.id), entry.id] as const));
    const update = () => {
      const line = window.innerHeight / 3;
      let current: string | null = toc[0]?.id ?? null;
      for (const target of targets) if (target.getBoundingClientRect().top <= line) current = ids.get(target) ?? current;
      setActiveId(current);
    };
    const observer = new IntersectionObserver(update, { rootMargin: "0px 0px -66% 0px", threshold: [0, 1] });
    targets.forEach((target) => observer.observe(target));
    update();
    return () => observer.disconnect();
  }, [toc]);
  const jumpTo = useCallback((id: string) => {
    targetsRef.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  // No chapters written in the lesson: ask for the video's own.
  useEffect(() => {
    if (!videoId || writtenChapters.length || !session) return;
    let live = true;
    void loadCloudYouTubeChapters(session, videoId).then((rows) => {
      if (live) setVideoChapters({ videoId, chapters: rows.map((row, index) => ({ id: `video-chapter-${row.seconds}-${index}`, ...row })) });
    });
    return () => { live = false; };
  }, [videoId, writtenChapters.length, session]);
  const chapters = writtenChapters.length ? writtenChapters
    : videoChapters && videoChapters.videoId === videoId ? videoChapters.chapters : [];
  const playFrom = useCallback((seconds: number) => seekLessonVideo(root.current, seconds), [root]);
  return { toc, files, chapters, activeId, jumpTo, playFrom };
}

function LessonChapters(props: { chapters: LessonChapter[]; onPlay: (seconds: number) => void }) {
  return (
    <ol className="lesson-chapter-list">
      {props.chapters.map((chapter) => (
        <li key={chapter.id}>
          <button type="button" onClick={() => props.onPlay(chapter.seconds)} aria-label={`Play from ${chapter.time}: ${chapter.label}`}>
            <span className="lesson-chapter-time">{chapter.time}</span>
            <span className="lesson-chapter-label">{chapter.label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function LessonContents(props: { toc: LessonTocEntry[]; activeId: string | null; onJump: (id: string) => void }) {
  return (
    <ol className="lesson-toc-list">
      {props.toc.map((entry) => (
        <li key={entry.id} className={`lesson-toc-item is-level-${entry.level}${entry.kind === "video" ? " is-video" : ""}${props.activeId === entry.id ? " is-active" : ""}`}>
          <a
            href={`#${entry.id}`}
            aria-current={props.activeId === entry.id ? "location" : undefined}
            onClick={(event) => {
              event.preventDefault();
              props.onJump(entry.id);
            }}
          >
            {entry.kind === "video" ? <PlayCircle aria-hidden="true" /> : null}
            <span>{entry.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

function getHostLabel(rawUrl: string | null): string {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return "External";
  return url.hostname.replace(/^www\./i, "");
}

function getEmbedProviderLabel(provider: string | null | undefined): string {
  if (provider === "youtube") return "YouTube";
  if (provider === "wistia") return "Wistia";
  if (provider === "descript") return "Descript";
  return "Video";
}

const RESOURCE_BODY_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  "iframe",
  "video",
  "audio",
  "embed",
  "object",
  "figure",
  "[role='button']",
  "[contenteditable='true']",
  "[data-resource-media='true']",
  ".md-media-embed",
  ".md-media-embed-frame",
  ".resource-viewer-embed",
].join(", ");

function PinIcon() {
  return (
    <svg className="resource-viewer-pin-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6" />
      <path d="M10 3v6l-3 3v1h10v-1l-3-3V3" />
      <path d="M12 13v8" />
    </svg>
  );
}

function ExternalArrowIcon() {
  return (
    <svg className="resource-viewer-external-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

export function WebCommunityResourceViewerContent(props: WebCommunityResourceViewerContentProps) {
  const { resource, editor = null } = props;
  // A lesson's video (lesson.video_url) plays at the top, like a video page's link.
  const currentUrl = resource.url || resource.lesson?.video_url || null;
  const embed = currentUrl ? parseEmbedUrl(currentUrl) : null;
  const sourceUrl = normalizeExternalUrl(currentUrl);
  const hostLabel = getHostLabel(currentUrl);
  const persistedBody = resource.body_md?.trim() ?? "";
  const trimmedBody = editor?.isEditing ? editor.bodyInput.trim() : persistedBody;
  const titleText = editor?.isEditing ? editor.titleInput : resource.title;
  const hasBody = trimmedBody.length > 0;
  const verificationLink: { label: string; href: string } | null = sourceUrl
    ? {
        label: embed
          ? `Watch on ${getEmbedProviderLabel(embed.provider)}`
          : `Read on ${hostLabel}`,
        href: sourceUrl.toString(),
      }
    : null;
  const isEmpty = !embed && !hasBody && !verificationLink;
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyFocusAtRef = useRef<{ x: number; y: number } | null>(null);
  const canEdit = Boolean(editor?.canEdit);
  const isEditing = Boolean(editor?.isEditing);
  const activeField = editor?.activeField ?? null;
  const isTitleEditing = isEditing && activeField === "title";
  const isBodyEditing = isEditing && activeField === "body";
  const isPinned = editor?.isEditing ? editor.pinnedInput : resource.pinned;
  // Preview shows the lesson as members will read it, from the draft being edited.
  const [previewing, setPreviewing] = useState(false);
  const isPreviewing = isEditing && previewing;
  useEffect(() => {
    if (!isEditing) setPreviewing(false);
  }, [isEditing, resource.id]);
  const fullShownBody = isPreviewing && editor ? editor.bodyInput.trim() : persistedBody;
  // Members pick their platform once; the lesson shows that platform's steps.
  const [platform, setPlatform] = useState(readLessonPlatform);
  const choosePlatform = (key: string) => {
    setPlatform(key);
    try { localStorage.setItem(LESSON_PLATFORM_KEY, key); } catch { /* storage can be blocked */ }
  };
  const platforms = useMemo(() => (isEditing && !isPreviewing ? [] : lessonPlatforms(fullShownBody)), [isEditing, isPreviewing, fullShownBody]);
  const activePlatform = platforms.find((entry) => entry.key === platform)?.key ?? platforms[0]?.key ?? null;
  const shownBody = activePlatform ? lessonBodyForPlatform(fullShownBody, activePlatform) : fullShownBody;
  // Follow-along elements work only in lessons (pages with lesson fields),
  // the same rule the server uses when it saves an answer.
  const lessonActivity = props.lessonActivity && resource.lesson ? props.lessonActivity : null;
  const lessonElements = useMemo(
    () =>
      !lessonActivity
        ? []
        : isPreviewing
          ? previewLessonElements(shownBody)
          : resource.lesson_elements ?? parseCommunityLessonElements(persistedBody).map(publicCommunityLessonElement),
    [lessonActivity, isPreviewing, shownBody, resource.lesson_elements, persistedBody],
  );
  const lessonRef = buildCommunityResourceEvidenceRef(resource.id);
  const lessonResponses = lessonActivity?.progress.responsesByRef[lessonRef];
  // Opening a lesson starts it, in whichever view the member opened it from,
  // so "started" means the same thing on the client record everywhere.
  const lessonStatus = lessonActivity?.progress.loaded ? lessonActivity.progress.statusByRef[lessonRef] ?? "not_started" : null;
  const startLesson = lessonActivity?.signedIn ? lessonActivity.progress.setStatus : null;
  // Once per lesson per page: a failed or refused write puts the status back
  // to not_started, and retrying from here looped thousands of times a minute
  // (2026-10-28). Mark as done still writes on click.
  // A lesson counts as started after a short read, so opening a course (which
  // lands on its first lesson) to look around doesn't start it.
  const autoStarted = useRef(new Set<string>());
  useEffect(() => {
    if (!startLesson || lessonStatus !== "not_started" || autoStarted.current.has(lessonRef)) return;
    const timer = window.setTimeout(() => {
      autoStarted.current.add(lessonRef);
      startLesson(resource.id, lessonRef, "in_progress");
    }, LESSON_START_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [startLesson, lessonStatus, resource.id, lessonRef]);
  // Every lesson ends with Mark as done, unless its body has its own button for it.
  // It writes the same progress the course outline reads, so the tick shows there at once.
  const hasOwnDoneButton = lessonElements.some((element) => "action" in element && element.action === "mark_done");
  const nextLesson = isEditing && !isPreviewing ? null : props.course?.next ?? null;
  // The video's height, for the chapters column beside it.
  const heroRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const hero = heroRef.current;
    const content = contentRef.current;
    if (!hero || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => content.style.setProperty("--lesson-hero-height", `${Math.round(hero.getBoundingClientRect().height)}px`));
    observer.observe(hero);
    return () => { observer.disconnect(); content.style.removeProperty("--lesson-hero-height"); };
  }, [embed?.src, embed?.id]);
  const readMinutes = useMemo(() => lessonReadMinutes(resource.body_md), [resource.body_md]);
  const showDoneFooter = Boolean(lessonActivity?.signedIn && lessonStatus !== null && !hasOwnDoneButton && (!isEditing || isPreviewing));
  const lessonScope = useMemo<LessonElementScope | null>(
    () => lessonActivity ? { byId: new Map(lessonElements.map((element) => [element.id, element])), activity: lessonActivity,
      responses: lessonResponses, resourceId: resource.id, lessonRef } : null,
    [lessonActivity, lessonElements, lessonResponses, resource.id, lessonRef],
  );
  // The body renders again only when its text or its set of elements changes.
  const hasLessonActivity = Boolean(lessonActivity);
  const lessonElementIds = lessonElements.map((element) => element.id).join(" ");
  const renderedBodyMarkdown = useMemo(() => {
    if (!shownBody) return null;
    const ids = new Set(lessonElementIds ? lessonElementIds.split(" ") : []);
    const render = (markdown: string) => renderMarkdown(ids.size ? markCommunityLessonElementBlocks(markdown, ids) : markdown, {
      ...CONTENT_MARKDOWN_OPTIONS,
      headingLevelOffset: 1,
      communityEmbeds: props.communityEmbeds ?? null,
      renderLessonElement: hasLessonActivity ? (id) => ids.has(id) ? <LessonElementSlot key={id} id={id} /> : null : null,
    });
    // A "## Slides" section reads as a deck, one slide at a time, in place.
    const deck = splitCommunityLessonSlides(shownBody);
    if (!deck) return render(shownBody);
    return (
      <>
        {deck.before ? render(deck.before) : null}
        <WebLessonSlideDeck key={resource.id} slides={deck.slides} renderNote={render} />
        {deck.after ? render(deck.after) : null}
      </>
    );
  }, [shownBody, props.communityEmbeds, hasLessonActivity, lessonElementIds, resource.id]);

  const readingRef = useRef<HTMLDivElement | null>(null);
  const frameSession = useWebCommunityFrame().session;
  const contents = useLessonContents(readingRef, isEditing && !isPreviewing ? "edit" : "read", renderedBodyMarkdown, frameSession,
    embed?.provider === "youtube" ? embed.id : null);
  const [compactTocOpen, setCompactTocOpen] = useState(false);
  const hasRail = contents.toc.length > 0 || contents.files.length > 0 || contents.chapters.length > 0;

  useEffect(() => {
    if (!isTitleEditing) return;
    const timeoutId = window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isTitleEditing, resource.id]);

  // A click on the read view places the caret once; other ways in start at the end.
  useEffect(() => {
    if (!isEditing) bodyFocusAtRef.current = null;
  }, [isEditing]);

  // Autosave: a moment after the owner stops typing, the page saves and
  // editing carries on. A body the server would refuse waits, with the reason shown.
  const bodyProblem = isEditing && editor ? lessonBodyProblem(editor.bodyInput) : null;
  const hasSavableChanges = Boolean(editor?.isEditing && editor.isDirty && editor.titleInput.trim() && !bodyProblem);
  const canAutosave = Boolean(hasSavableChanges && editor?.canSave && editor.onSaveInPlace);
  // The panel hands a new save function each render; the timer keys on the content.
  const saveInPlaceRef = useRef(editor?.onSaveInPlace ?? null);
  saveInPlaceRef.current = editor?.onSaveInPlace ?? null;
  useEffect(() => {
    if (!canAutosave) return;
    const timeoutId = window.setTimeout(() => void saveInPlaceRef.current?.(), 1200);
    return () => window.clearTimeout(timeoutId);
  }, [canAutosave, editor?.titleInput, editor?.bodyInput, editor?.pinnedInput]);

  // Leaving the lesson saves what the timer hadn't yet. These refs are set
  // after each commit, so the cleanup below still sees the lesson being left.
  const leavingRef = useRef<{ pending: boolean; save: (() => Promise<boolean>) | null }>({ pending: false, save: null });
  useEffect(() => {
    leavingRef.current = { pending: hasSavableChanges, save: editor?.onSaveInPlace ?? null };
  });
  useEffect(() => () => {
    if (leavingRef.current.pending) void leavingRef.current.save?.();
  }, [resource.id]);
  const hasUnsaved = Boolean(editor?.isEditing && editor.isDirty);
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);

  // Done waits for a save in flight, then saves anything left and closes.
  const [closeWhenSaved, setCloseWhenSaved] = useState(false);
  useEffect(() => {
    if (!closeWhenSaved || !editor || editor.isSaving) return;
    setCloseWhenSaved(false);
    if (!editor.isEditing) return;
    if (!editor.isDirty) editor.onCancel();
    else if (editor.canSave && !bodyProblem) void editor.onSave();
  }, [closeWhenSaved, editor, bodyProblem]);
  const finishEditing = () => setCloseWhenSaved(true);

  const beginEdit = (field: WebCommunityResourceInlineEditorField) => {
    if (!editor?.canEdit || editor.isSaving) return;
    if (editor.isEditing) {
      editor.onSetActiveField(field);
      return;
    }
    editor.onBeginEdit(field);
  };

  const handleEditableKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (!editor) return;
    if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
      event.preventDefault();
      event.stopPropagation();
      finishEditing();
    }
  };

  const handleBodyTriggerClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const interactiveTarget =
      target && target !== event.currentTarget
        ? target.closest(RESOURCE_BODY_INTERACTIVE_SELECTOR)
        : null;
    if (interactiveTarget && interactiveTarget !== event.currentTarget) {
      return;
    }
    // Measured from the body's corner: the editor's toolbar pushes the text down.
    const body = event.currentTarget.getBoundingClientRect();
    bodyFocusAtRef.current = { x: event.clientX - body.left, y: event.clientY - body.top };
    beginEdit("body");
  };

  // Only keys pressed on the body itself start editing. Enter or Space on a
  // checklist, quiz, button or form inside it (or a dialog one opens) is theirs.
  const handleBodyTriggerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    beginEdit("body");
  };

  const renderTitleContent = () => {
    if (isTitleEditing && editor) {
      return (
        // Edited in place like Substack's: the title's own size and wrapping,
        // no box, and Enter moves on to the text.
        <textarea
          ref={titleInputRef}
          className="resource-viewer-title-input"
          value={editor.titleInput}
          placeholder="Lesson title"
          rows={1}
          aria-label="Lesson title"
          onChange={(event) => editor.onChangeTitle(event.target.value.replace(/\s*\n\s*/g, " "))}
          onFocus={() => editor.onSetActiveField("title")}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              editor.onSetActiveField("body");
              return;
            }
            handleEditableKeyDown(event);
          }}
        />
      );
    }

    if (canEdit) {
      return (
        <button
          className={`resource-viewer-title-edit-trigger${titleText.trim() ? "" : " is-empty"}`}
          type="button"
          disabled={editor?.isSaving}
          onClick={() => beginEdit("title")}
        >
          <span>{titleText.trim() || "Untitled lesson"}</span>
        </button>
      );
    }

    return <span>{resource.title}</span>;
  };

  const togglePinned = () => {
    if (!editor?.canEdit || editor.isSaving) return;
    if (!editor.isEditing) {
      editor.onBeginEdit("pin");
    } else {
      editor.onSetActiveField("pin");
    }
    editor.onChangePinned(!isPinned);
  };

  const renderPinControl = () => {
    if (canEdit && editor) {
      return (
        <button
          className={`resource-viewer-pin-toggle${isPinned ? " is-active" : ""}`}
          type="button"
          disabled={editor.isSaving}
          aria-pressed={isPinned}
          title={isPinned ? "Unpin lesson" : "Pin lesson"}
          onClick={togglePinned}
        >
          <PinIcon />
        </button>
      );
    }

    return isPinned ? <PinIcon /> : null;
  };

  const renderBodyContent = () => {
    // While the page is being edited the body is always the editor, so moving
    // between the title and the body never reloads it.
    if (isPreviewing) {
      return (
        <>
          <div className="lesson-editor-preview-note" role="status">
            <Eye aria-hidden="true" />
            <span>This is how members see the lesson. Your changes keep saving.</span>
          </div>
          {renderedBodyMarkdown ? <div className="resource-viewer-prose">{renderedBodyMarkdown}</div> : null}
        </>
      );
    }
    if (isEditing && editor) {
      const readView = renderedBodyMarkdown ? <div className="resource-viewer-prose">{renderedBodyMarkdown}</div> : null;
      return (
        <Suspense fallback={readView}>
          <LessonEditor
            key={resource.id}
            initialMarkdown={editor.bodyInput}
            followAlong={Boolean(resource.lesson)}
            onChange={editor.onChangeBody}
            onUploadImage={editor.onUploadImage ?? null}
            autoFocus={isBodyEditing}
            focusAt={bodyFocusAtRef.current}
            onFocus={() => {
              if (editor.activeField !== "body") editor.onSetActiveField("body");
            }}
            onDone={finishEditing}
            onSaveNow={() => {
              if (canAutosave) void editor.onSaveInPlace?.();
            }}
          />
        </Suspense>
      );
    }

    if (hasBody) {
      const prose = renderedBodyMarkdown;
      if (canEdit) {
        return (
          <div
            className="resource-viewer-prose resource-viewer-prose-edit-trigger"
            role="button"
            tabIndex={0}
            onClick={handleBodyTriggerClick}
            onKeyDown={handleBodyTriggerKeyDown}
          >
            {prose}
          </div>
        );
      }
      return <div className="resource-viewer-prose">{prose}</div>;
    }

    if (canEdit) {
      return (
        <button
          className="resource-viewer-empty resource-viewer-empty-edit-trigger"
          type="button"
          disabled={editor?.isSaving}
          onClick={() => beginEdit("body")}
        >
          This lesson has no body text. Click to write it.
        </button>
      );
    }

    if (resource.paywalled) {
      return <div className="resource-viewer-empty">This lesson is part of a track you can add to your plan. Open the Roadmap to see what's inside.</div>;
    }
    return isEmpty ? <div className="resource-viewer-empty">This lesson hasn't been written yet.</div> : null;
  };

  return (
    <div className={`resource-viewer-content${embed ? " is-video-lesson" : ""}`} ref={contentRef}>
      <div className="resource-viewer-header">
        {/* Course · Lesson 2 of 8 · 4 min read, over the title. */}
        {props.course && !isEditing ? (
          <p className="lesson-kicker">
            <span>{props.course.name}</span>
            <span>Lesson {props.course.position} of {props.course.total}</span>
            {readMinutes ? <span>{readMinutes} min read</span> : null}
          </p>
        ) : null}
        <div className="resource-viewer-title-row">
          <h1 className="resource-viewer-title">
            {renderTitleContent()}
            {renderPinControl()}
          </h1>
          <div className="resource-viewer-header-aside">
            {isEditing && editor ? (
              <div className="resource-viewer-edit-actions">
                <span
                  className={`lesson-editor-save-pill${bodyProblem ? " is-blocked" : editor.isSaving || closeWhenSaved || editor.isDirty ? " is-pending" : ""}`}
                  role="status"
                  aria-live="polite"
                >
                  {editor.isSaving || closeWhenSaved
                    ? "Saving…"
                    : bodyProblem
                      ? "Not saved"
                      : editor.isDirty
                        ? "Editing"
                        : "Saved"}
                </span>
                <button
                  className="lesson-editor-header-button"
                  type="button"
                  aria-pressed={isPreviewing}
                  onClick={() => {
                    bodyFocusAtRef.current = null;
                    setPreviewing(!previewing);
                  }}
                  title={isPreviewing ? "Back to editing" : "See the lesson as members will"}
                >
                  {isPreviewing ? <PenLine aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  <span className="lesson-editor-header-label">{isPreviewing ? "Edit" : "Preview"}</span>
                </button>
                {editor.styleControl ?? null}
                {editor.onOpenVersions ? (
                  <button
                    className="lesson-editor-header-button"
                    type="button"
                    onClick={() => editor.onOpenVersions?.()}
                    title="Earlier versions of this lesson"
                  >
                    <History aria-hidden="true" />
                    <span className="lesson-editor-header-label">History</span>
                  </button>
                ) : null}
                <button
                  className="lesson-editor-header-button is-primary"
                  type="button"
                  onClick={finishEditing}
                  disabled={closeWhenSaved || Boolean(bodyProblem && editor.isDirty)}
                  title="Save and stop editing (Ctrl+Enter)"
                >
                  Done
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {isEditing && bodyProblem ? <div className="auth-error resource-viewer-edit-error" role="alert">{bodyProblem}</div> : null}
        {isEditing && editor?.error ? <div className="auth-error resource-viewer-edit-error">{editor.error}</div> : null}
      </div>
      <div className={`resource-viewer-body${hasRail ? " has-lesson-rail" : ""}`}>
        <div className="resource-viewer-column">
          {/* The lesson's video, under the title and as wide as the text, with its chapters in the side column. */}
          {embed ? (
            <div className="resource-viewer-hero" ref={heroRef}>
              <div className="resource-viewer-embed" data-resource-media="true">
                {embed.provider === "youtube" ? (
                  <DeferredYouTubeEmbed
                    key={embed.id}
                    embed={embed}
                    title={`${resource.title} video`}
                  />
                ) : (
                  <StableMediaEmbedFrame
                    src={embed.src}
                    title={`${resource.title} video`}
                  />
                )}
              </div>
            </div>
          ) : null}
          {platforms.length > 1 && activePlatform ? (
            <div className="lesson-platform-row">
              <span>I build in</span>
              <WebPlatformTabList
                tabs={platforms.map((entry) => ({ id: entry.key, label: entry.label }))}
                activeTab={activePlatform}
                onSelectTab={choosePlatform}
                ariaLabel="I build in"
                idPrefix="lesson-platform"
                style={buildPlatformSwitcherStyle(platforms.length, platforms.findIndex((entry) => entry.key === activePlatform))}
              />
            </div>
          ) : null}

          {contents.toc.length || contents.chapters.length ? (
            <details className="lesson-toc-compact" open={compactTocOpen} onToggle={(event) => setCompactTocOpen(event.currentTarget.open)}>
              <summary><ListOrdered aria-hidden="true" /><span>{contents.toc.length ? "Contents" : "Chapters"}</span></summary>
              {/* Too narrow for the side column: the video's chapters come here too. */}
              {contents.chapters.length ? <>
                {contents.toc.length ? <p className="lesson-toc-compact-label">Chapters</p> : null}
                <LessonChapters chapters={contents.chapters} onPlay={(seconds) => { setCompactTocOpen(false); contents.playFrom(seconds); }} />
              </> : null}
              {contents.toc.length ? <>
                {contents.chapters.length ? <p className="lesson-toc-compact-label">Contents</p> : null}
                <LessonContents toc={contents.toc} activeId={contents.activeId} onJump={(id) => { setCompactTocOpen(false); contents.jumpTo(id); }} />
              </> : null}
            </details>
          ) : null}

          {/* Around every place the body shows, read view or editor fallback alike. */}
          <div className="lesson-reading" ref={readingRef}>
            <LessonElementScopeContext.Provider value={lessonScope}>{renderBodyContent()}</LessonElementScopeContext.Provider>
          </div>

          {props.actions !== undefined ? (
            props.actions ? <div className="lesson-done-row">{props.actions}</div> : null
          ) : (showDoneFooter && lessonActivity) || nextLesson ? (
            <div className="lesson-done-row">
              {showDoneFooter && lessonActivity?.progress.statusError?.ref === lessonRef ? (
                <p className="lesson-done-note" role="alert">{lessonActivity.progress.statusError.message}</p>
              ) : null}
              {showDoneFooter && lessonActivity ? <button
                type="button"
                className={`lesson-done-button${lessonStatus === "done" ? " is-done" : ""}`}
                aria-pressed={lessonStatus === "done"}
                onClick={() => lessonActivity.progress.setStatus(resource.id, lessonRef, lessonStatus === "done" ? "in_progress" : "done")}
              >
                <Check aria-hidden="true" />
                <span>{lessonStatus === "done" ? "Done" : "Mark as done"}</span>
              </button> : null}
              {nextLesson ? (
                <button
                  type="button"
                  className="lesson-next-button"
                  title={`Next: ${nextLesson.title}`}
                  onClick={(event) => {
                    const top = event.currentTarget.closest(".resource-viewer-content");
                    nextLesson.open();
                    window.requestAnimationFrame(() => top?.scrollIntoView({ block: "start" }));
                  }}
                >
                  <span>Next<span className="lesson-next-title">: {nextLesson.title}</span></span>
                  <ArrowRight aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}

          {verificationLink ? (
            <a
              className="resource-viewer-verification-link"
              href={verificationLink.href}
              target="_blank"
              rel="noreferrer"
            >
              <span>{verificationLink.label}</span>
              <ExternalArrowIcon />
            </a>
          ) : null}
        </div>
        {hasRail ? (
          <aside className="lesson-rail" aria-label="In this lesson">
            {contents.chapters.length ? (
              <nav className="lesson-rail-section lesson-chapters-section" aria-label="Video chapters">
                <p className="lesson-rail-label">Chapters</p>
                <LessonChapters chapters={contents.chapters} onPlay={contents.playFrom} />
              </nav>
            ) : null}
            {contents.toc.length ? (
              <nav className="lesson-rail-section" aria-label="Contents">
                <p className="lesson-rail-label">Contents</p>
                <LessonContents toc={contents.toc} activeId={contents.activeId} onJump={contents.jumpTo} />
              </nav>
            ) : null}
            {contents.files.length ? (
              <div className="lesson-rail-section">
                <p className="lesson-rail-label">Files</p>
                <ul className="lesson-rail-files">
                  {contents.files.map((file) => (
                    <li key={file.href}>
                      <a href={file.href} target="_blank" rel="noreferrer"><FileText aria-hidden="true" /><span>{file.label}</span></a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
