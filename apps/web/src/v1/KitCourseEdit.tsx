// Design system v1, Knowledge: a course's name, the line about it and its
// cover are changed in the page. A new cover starts centred and can be
// reframed on demand through the shared cover framing modal.
import { lazy, Suspense, useRef, useState } from "react";
import { clampCoverFocus, clampCoverZoom } from "../../../../shared/coverFrameUi";
import { readBannerFileAsWideDataUrlWithinLimit } from "../../../../shared/imageTransforms";
import { StableFramedMedia } from "../../../../shared/StableFramedMedia";
import { cx, Icon } from "./kit";

const WebCommunityBannerEditorModal = lazy(() =>
  import("../components/WebCommunityBannerEditorModal").then((mod) => ({
    default: mod.WebCommunityBannerEditorModal,
  })),
);

const COVER_DATA_URL_CHAR_LIMIT = 1_200_000;

export type CourseCoverChange =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "new"; dataUrl: string; focusX?: number; focusY?: number; zoom?: number }
  | { kind: "frame"; focusX: number; focusY: number; zoom: number };
export type CourseEditPatch = { name: string; description: string; cover: CourseCoverChange };

// What Save sends: the trimmed words, and the cover only as a change.
export function courseEditPatch(draft: { name: string; description: string; cover: CourseCoverChange }): CourseEditPatch | null {
  const name = draft.name.trim();
  if (!name) return null;
  return { name: name.slice(0, 80), description: draft.description.trim(), cover: draft.cover };
}

// A course's cover, name and one line about it, changed where they sit at the
// top of the lesson panel (Nov 17: no form, no edit mode). Click the cover to
// pick a picture; click the name or the line and type. Enter or clicking away
// saves; Escape puts it back.
export function KitCourseInline(props: {
  course: {
    name: string;
    description_md: string | null;
    banner_url: string | null;
    banner_focus_x?: number | null;
    banner_focus_y?: number | null;
    banner_zoom?: number | null;
  };
  coverClassName: string;
  stats: string;
  // With this, the stats line opens who has started the course (hosts).
  onOpenStats?: () => void;
  statsOpen?: boolean;
  // A course just made: its name is ready to type over.
  startRenaming?: boolean;
  // Told once the name has been typed or left alone.
  onRenameEnd?: () => void;
  onSave: (patch: CourseEditPatch) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const { course } = props;
  const about = (course.description_md ?? "").split("\n")[0].trim();
  const [field, setField] = useState<"name" | "about" | null>(props.startRenaming ? "name" : null);
  const [value, setValue] = useState(props.startRenaming ? course.name : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [framingOpen, setFramingOpen] = useState(false);
  const [pendingFrame, setPendingFrame] = useState<{ focusX: number; focusY: number; zoom: number } | null>(null);
  const [frameDraft, setFrameDraft] = useState(() => ({
    focusX: clampCoverFocus(course.banner_focus_x),
    focusY: clampCoverFocus(course.banner_focus_y),
    zoom: clampCoverZoom(course.banner_zoom),
  }));
  const frameDirtyRef = useRef(false);
  const frameDraftRef = useRef(frameDraft);
  frameDraftRef.current = frameDraft;
  const fileInput = useRef<HTMLInputElement | null>(null);

  const send = async (patch: CourseEditPatch | null) => {
    if (!patch) { setError("A course needs a name."); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await props.onSave(patch);
      if (result.ok) { setField(null); props.onRenameEnd?.(); } else setError(result.message);
    } finally {
      setBusy(false);
      setPendingFrame(null);
    }
  };
  const openFraming = () => {
    if (!course.banner_url || busy) return;
    const initial = {
      focusX: clampCoverFocus(course.banner_focus_x),
      focusY: clampCoverFocus(course.banner_focus_y),
      zoom: clampCoverZoom(course.banner_zoom),
    };
    frameDraftRef.current = initial;
    frameDirtyRef.current = false;
    setFrameDraft(initial);
    setError(null);
    setFramingOpen(true);
  };
  const updateFrameDraft = (patch: Partial<{ focusX: number; focusY: number; zoom: number }>) => {
    const next = { ...frameDraftRef.current, ...patch };
    frameDraftRef.current = next;
    setFrameDraft(next);
  };
  const closeFraming = () => {
    setFramingOpen(false);
    if (!frameDirtyRef.current || !course.banner_url) return;
    frameDirtyRef.current = false;
    const next = frameDraftRef.current;
    setPendingFrame(next);
    void send(courseEditPatch({
      name: course.name,
      description: course.description_md ?? "",
      cover: { kind: "frame", focusX: next.focusX, focusY: next.focusY, zoom: next.zoom },
    }));
  };
  const commit = () => {
    if (!field || busy) return;
    const next = value.trim();
    if (next === (field === "name" ? course.name : about)) { setField(null); props.onRenameEnd?.(); return; }
    // Only the first line of the description is edited here; the rest is kept.
    const rest = (course.description_md ?? "").split("\n").slice(1).join("\n");
    void send(courseEditPatch({
      name: field === "name" ? next : course.name,
      description: field === "about" ? [next, rest].filter(Boolean).join("\n") : course.description_md ?? "",
      cover: { kind: "keep" },
    }));
  };
  const choose = async (file: File | null) => {
    if (!file) return;
    if (!file.type.toLowerCase().startsWith("image/")) { setError("A cover is an image file."); return; }
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await readBannerFileAsWideDataUrlWithinLimit(file, COVER_DATA_URL_CHAR_LIMIT);
      await send(courseEditPatch({ name: course.name, description: course.description_md ?? "", cover: { kind: "new", dataUrl } }));
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "That image couldn't be used. Try another.");
      setBusy(false);
    }
  };
  const start = (which: "name" | "about") => { setValue(which === "name" ? course.name : about); setError(null); setField(which); };
  const input = (label: string, max: number) => (
    <input className={cx("kinline-input")} value={value} autoFocus maxLength={max} aria-label={label} disabled={busy}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } else if (event.key === "Escape") { event.stopPropagation(); setField(null); setError(null); props.onRenameEnd?.(); } }} />
  );
  return (
    <>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => { void choose(event.target.files?.[0] ?? null); event.target.value = ""; }} />
      <button type="button" className={`${props.coverClassName} ${cx("kinline-cover")}`} disabled={busy}
        onClick={() => fileInput.current?.click()} aria-label={course.banner_url ? "Change the cover" : "Add a cover"} title={course.banner_url ? "Change the cover" : "Add a cover"}>
        {course.banner_url ? (
          <StableFramedMedia
            className={cx("kinline-cover-media")}
            imageUrl={course.banner_url}
            frame={framingOpen ? frameDraft : pendingFrame ?? {
              focusX: course.banner_focus_x,
              focusY: course.banner_focus_y,
              zoom: course.banner_zoom,
            }}
            alt=""
            aria-hidden
          />
        ) : <Icon name="image" />}
      </button>
      <span className={cx("kinline")} aria-busy={busy}>
        {field === "name" ? input("Course name", 80) : <button type="button" className={cx("kinline-name")} onClick={() => start("name")} title="Rename the course">{course.name}</button>}
        {field === "about" ? input("One line about this course", 160)
          : <button type="button" className={cx("kinline-about", about ? "" : "empty")} onClick={() => start("about")}>{about || "Add a line about it"}</button>}
        <em className={cx("kinline-meta")} role={error ? "alert" : undefined}>
          {error ?? (
            <>
              {props.onOpenStats && props.stats
                ? <StatsButton stats={props.stats} open={Boolean(props.statsOpen)} onClick={props.onOpenStats} />
                : props.stats}
              {course.banner_url ? (
                <>
                  {props.stats ? <span aria-hidden="true">·</span> : null}
                  <button
                    type="button"
                    className={cx("kinline-stats")}
                    disabled={busy}
                    onClick={openFraming}
                    title="Adjust course cover framing"
                  >
                    Reframe cover
                  </button>
                </>
              ) : null}
            </>
          )}
        </em>
      </span>
      {framingOpen && course.banner_url ? (
        <Suspense fallback={null}>
          <WebCommunityBannerEditorModal
            isOpen
            bannerUrl={course.banner_url}
            focusX={frameDraft.focusX}
            focusY={frameDraft.focusY}
            zoom={frameDraft.zoom}
            title="Adjust course cover framing"
            imageAlt="Course cover preview"
            hint="Drag the image to frame it inside the course cover."
            aspectRatio="16 / 9"
            onChangeFocusX={(focusX) => updateFrameDraft({ focusX })}
            onChangeFocusY={(focusY) => updateFrameDraft({ focusY })}
            onChangeZoom={(zoom) => updateFrameDraft({ zoom })}
            onDirty={() => { frameDirtyRef.current = true; }}
            onClose={closeFraming}
          />
        </Suspense>
      ) : null}
    </>
  );
}

// "3 started · 1 finished", which opens (and closes) who they are.
export function StatsButton(props: { stats: string; open: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cx("kinline-stats")} aria-expanded={props.open} title={props.open ? "Back to the lessons" : "See who has started"} onClick={props.onClick}>
      {props.stats}
    </button>
  );
}
