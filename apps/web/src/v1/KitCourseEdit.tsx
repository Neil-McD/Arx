// Design system v1, Knowledge: a course's name, the line about it and its
// cover are changed in the page. No pop-up, and no crop step: a new cover is
// centred.
import { useRef, useState } from "react";
import type * as React from "react";
import { readBannerFileAsWideDataUrlWithinLimit } from "../../../../shared/imageTransforms";
import { cx, Icon } from "./kit";

const COVER_DATA_URL_CHAR_LIMIT = 1_200_000;

export type CourseCoverChange = { kind: "keep" } | { kind: "remove" } | { kind: "new"; dataUrl: string };
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
  course: { name: string; description_md: string | null; banner_url: string | null };
  coverClassName: string;
  coverStyle?: React.CSSProperties;
  stats: string;
  onSave: (patch: CourseEditPatch) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const { course } = props;
  const about = (course.description_md ?? "").split("\n")[0].trim();
  const [field, setField] = useState<"name" | "about" | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const send = async (patch: CourseEditPatch | null) => {
    if (!patch) { setError("A course needs a name."); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await props.onSave(patch);
      if (result.ok) setField(null); else setError(result.message);
    } finally {
      setBusy(false);
    }
  };
  const commit = () => {
    if (!field || busy) return;
    const next = value.trim();
    if (next === (field === "name" ? course.name : about)) { setField(null); return; }
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
      onChange={(event) => setValue(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } else if (event.key === "Escape") { event.stopPropagation(); setField(null); setError(null); } }} />
  );
  return (
    <>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => { void choose(event.target.files?.[0] ?? null); event.target.value = ""; }} />
      <button type="button" className={`${props.coverClassName} ${cx("kinline-cover")}`} style={props.coverStyle} disabled={busy}
        onClick={() => fileInput.current?.click()} aria-label={course.banner_url ? "Change the cover" : "Add a cover"} title={course.banner_url ? "Change the cover" : "Add a cover"}>
        {course.banner_url ? null : <Icon name="book" />}
      </button>
      <span className={cx("kinline")} aria-busy={busy}>
        {field === "name" ? input("Course name", 80) : <button type="button" className={cx("kinline-name")} onClick={() => start("name")} title="Rename the course">{course.name}</button>}
        {field === "about" ? input("One line about this course", 160)
          : <button type="button" className={cx("kinline-about", about ? "" : "empty")} onClick={() => start("about")}>{about || "Add a line about it"}</button>}
        <em role={error ? "alert" : undefined}>{error ?? props.stats}</em>
      </span>
    </>
  );
}
