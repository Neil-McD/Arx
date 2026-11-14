// Design system v1, Knowledge (Nov 14 mock, "Edit course"): a course's name,
// what members will learn and its cover are changed in the page, in the same
// box Knowledge and Events add things with. No pop-up, and no crop step: a
// new cover is centred.
import { useEffect, useRef, useState, type FormEvent } from "react";
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

export function KitCourseEdit(props: {
  course: { name: string; description_md: string | null; banner_url: string | null };
  onSave: (patch: CourseEditPatch) => Promise<{ ok: true } | { ok: false; message: string }>;
  onClose: () => void;
}) {
  const [name, setName] = useState(props.course.name);
  const [description, setDescription] = useState(props.course.description_md ?? "");
  const [cover, setCover] = useState<CourseCoverChange>({ kind: "keep" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const box = useRef<HTMLFormElement | null>(null);
  useEffect(() => { box.current?.scrollIntoView({ block: "nearest" }); }, []);

  const shown = cover.kind === "new" ? cover.dataUrl : cover.kind === "remove" ? null : props.course.banner_url;
  const choose = async (file: File | null) => {
    if (!file) return;
    if (!file.type.toLowerCase().startsWith("image/")) { setError("A cover is an image file."); return; }
    setError(null);
    setBusy(true);
    try {
      setCover({ kind: "new", dataUrl: await readBannerFileAsWideDataUrlWithinLimit(file, COVER_DATA_URL_CHAR_LIMIT) });
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "That image couldn't be used. Try another.");
    } finally {
      setBusy(false);
    }
  };
  const patch = courseEditPatch({ name, description, cover });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !patch) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.onSave(patch);
      if (result.ok) props.onClose(); else setError(result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={box} className={cx("kadd", "kaddbox", "kcedit")} aria-label="Change this course" aria-busy={busy} onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.stopPropagation(); props.onClose(); } }}>
      <div className={cx("evhead")}>Change this course</div>
      <div className={cx("kcgrid")}>
        <div>
          <div className={cx("kcthumb")} style={shown ? { backgroundImage: `url(${JSON.stringify(shown)})` } : undefined}>{shown ? null : <Icon name="book" />}</div>
          <div className={cx("kcbtns")}>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => { void choose(event.target.files?.[0] ?? null); event.target.value = ""; }} />
            <button type="button" className={cx("btn sm")} disabled={busy} onClick={() => fileInput.current?.click()}>{shown ? "Change cover" : "Add a cover"}</button>
            {shown ? <button type="button" className={cx("btn sm txt")} disabled={busy} onClick={() => setCover({ kind: "remove" })}>Remove</button> : null}
          </div>
        </div>
        <div className={cx("evparts")} style={{ marginTop: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
          <label><span>Name</span><input value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} /></label>
          <label><span>What members will learn</span><textarea rows={3} value={description} maxLength={1200} onChange={(event) => setDescription(event.target.value)} /></label>
        </div>
      </div>
      {error ? <div className={cx("everr")} role="alert">{error}</div> : null}
      <div className={cx("evfoot")}>
        <span>Lessons are written and ordered below and on the right.</span>
        <button type="button" className={cx("btn sm")} disabled={busy} onClick={props.onClose}>Cancel</button>
        <button type="submit" className={cx("btn sm go")} disabled={busy || !patch}>{busy ? "Saving" : "Save"}</button>
      </div>
    </form>
  );
}
