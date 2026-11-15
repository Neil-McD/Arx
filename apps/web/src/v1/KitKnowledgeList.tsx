// Design system v1, Knowledge (Neil, Nov 14 mocks). One box at the top of the
// page adds anything (KitKnowledgeAdd): write and it's a note, paste a link or
// choose a file and Polynet reads it, or switch it to Course and an outline
// becomes a draft course with its lessons. Below the shelf, one list of the
// notes, files and links (KitKnowledgeList). No menu, no pop-up.
import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, Link2, StickyNote } from "lucide-react";
import type { CommunityNoteView } from "../../../../shared/cloudCommunityNotesGateway";
import type { CommunityResource } from "../components/communityResourcesContracts";
import { noteIsNew } from "./KitKnowledgeNotes";
import { askInApp } from "../../../../shared/inAppConfirm";
import { cx, Icon } from "./kit";

export type KnowledgeAddResult = { ok: true } | { ok: false; message: string };

// What the box holds: links (every line is one), or words for a note.
export function readKnowledgeDraft(text: string): { kind: "links"; links: string[] } | { kind: "note"; title: string; text: string } | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  if (lines.every((line) => /^https?:\/\/\S+$/i.test(line))) return { kind: "links", links: lines };
  const body = text.trim();
  const first = lines[0];
  // A short first line is the title; otherwise the note is named by how it starts.
  if (lines.length > 1 && first.length <= 80) return { kind: "note", title: first, text: body.slice(body.indexOf(first) + first.length).trim() };
  return { kind: "note", title: first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first, text: body };
}

function noteFrom(note: CommunityNoteView): string {
  if (note.from_pod) return `From the ${note.from_pod} pod`;
  if (note.kind === "founder") return note.written_by ? `By ${note.written_by}` : "By a host";
  if (note.kind === "ask") return "From a question";
  if (note.kind === "tag") return "From a channel";
  if (note.kind === "learned") return note.evidence_count ? `Learned from ${note.evidence_count} ${note.evidence_count === 1 ? "post" : "posts"}` : "Learned by your guide";
  return "";
}

const sourceFailed = (resource: CommunityResource) => (resource as { source_ingestion_status?: string }).source_ingestion_status === "failed";

function sourceState(resource: CommunityResource): string {
  const status = (resource as { source_ingestion_status?: string }).source_ingestion_status;
  if (status === "queued" || status === "processing") return "Reading…";
  if (status === "failed") return "Couldn't read it";
  return resource.type === "file" ? "File" : "Link";
}

// A course typed as an outline: the first line is the course, each line after
// is a lesson. "1.", "-" and "•" at the start of a line are how people write
// lists, not part of the name.
export const COURSE_OUTLINE_LESSON_LIMIT = 30;
export function readCourseOutline(text: string): { name: string; lessons: string[] } | null {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/^\s*(?:\d{1,3}[.)]|[-*•–])\s+/, "").trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return { name: lines[0].slice(0, 80), lessons: lines.slice(1, 1 + COURSE_OUTLINE_LESSON_LIMIT).map((line) => line.slice(0, 120)) };
}

export type KnowledgeAddMode = "ask" | "note" | "course";

// The one box at the top of Knowledge, for people who can add to it. Closed
// it is one bar whose words alternate between asking and adding (Neil, Nov
// 14: one bar, not two). Open, it asks the guide, or holds what is being
// added and says back how it was read.
export function KitKnowledgeAdd(props: {
  // Add a note, or hand links and files to be read.
  onAddNote?: (title: string, text: string) => Promise<KnowledgeAddResult>;
  onAddSources?: (input: { links: string[]; files: File[] }) => Promise<KnowledgeAddResult>;
  // Hosts only: make a draft course with these lessons.
  onCreateCourse?: (name: string, lessons: string[]) => Promise<KnowledgeAddResult>;
  // Sends a question to the guide (when the community has one).
  onAsk?: (question: string) => void;
  communityName: string;
  // What the closed bar says when it only teaches (the builders' list).
  closedLabel?: string;
  // Open the box already holding this (an unanswered question to answer),
  // or already switched to Course (the shelf's "New course").
  seed?: { text: string; mode?: KnowledgeAddMode; nonce: number } | null;
}) {
  const [adding, setAdding] = useState(false);
  const firstMode: KnowledgeAddMode = props.onAsk ? "ask" : "note";
  const [mode, setMode] = useState<KnowledgeAddMode>(firstMode);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const canAdd = Boolean(props.onAddNote || props.onAddSources || props.onCreateCourse);
  const seedNonce = props.seed?.nonce;
  useEffect(() => {
    if (!props.seed || !canAdd) return;
    const wantsCourse = props.seed.mode === "course" && Boolean(props.onCreateCourse);
    // "New course" on a box that already holds words keeps the words.
    if (!(wantsCourse && adding)) setText(props.seed.text);
    setFiles([]);
    setError(null);
    // A seed is something to add: a course, or an answer to write down.
    setMode(wantsCourse ? "course" : "note");
    setAdding(true);
    box.current?.focus();
    box.current?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);
  // The box grows with what is typed, as Home's does.
  useEffect(() => {
    const area = box.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 260)}px`;
  }, [text, adding, mode]);
  if (!canAdd) return null;

  const isCourse = mode === "course" && Boolean(props.onCreateCourse);
  const isAsk = !isCourse && mode === "ask" && Boolean(props.onAsk);
  const draft = isCourse || isAsk ? null : readKnowledgeDraft(text);
  const outline = isCourse ? readCourseOutline(text) : null;
  const close = () => { setAdding(false); setMode(firstMode); setText(""); setFiles([]); setError(null); };
  const ask = () => {
    if (!text.trim() || !props.onAsk) return;
    props.onAsk(text);
    close();
  };

  const add = async () => {
    if (busy) return;
    if (isAsk) { ask(); return; }
    setBusy(true);
    setError(null);
    try {
      let result: KnowledgeAddResult = { ok: true };
      if (isCourse) {
        if (!outline || !props.onCreateCourse) return;
        result = await props.onCreateCourse(outline.name, outline.lessons);
      } else {
        // Files (or links) and words together: both are kept. The files go
        // first; once they are in, they leave the box so a retry never adds
        // them twice.
        if (files.length > 0 || draft?.kind === "links") {
          if (!props.onAddSources) return;
          result = await props.onAddSources({ links: draft?.kind === "links" ? draft.links : [], files });
          if (result.ok) setFiles([]);
        }
        if (result.ok && draft?.kind === "note") {
          if (!props.onAddNote) return;
          result = await props.onAddNote(draft.title, draft.text);
        }
      }
      if (result.ok) close(); else setError(result.message);
    } finally {
      setBusy(false);
    }
  };

  if (!adding) return (
    <button type="button" className={cx("kaddrow")} onClick={() => setAdding(true)} aria-label={props.onAsk ? `Ask anything ${props.communityName} knows, or teach your guide` : (props.closedLabel ?? "Teach your guide")}>
      {props.onAsk ? <Icon name="spark" extra="sp" /> : <Icon name="plus" />}
      {props.onAsk ? (
        // The two things this bar does, taking turns (CSS only; still when
        // the reader asks for less motion).
        <span className={cx("krot")} aria-hidden="true"><b>Ask anything {props.communityName} knows</b><b>{props.onCreateCourse ? "Teach your guide, or start a course" : "Teach your guide"}</b></span>
      ) : (props.closedLabel ?? "Teach your guide")}
    </button>
  );

  const hint = isAsk ? "Your guide answers from everything here."
    : isCourse
    ? (outline ? "First line is the course. Each line after is a lesson. It starts as a draft only hosts see." : "Name the course on the first line, then one lesson per line.")
    : files.length > 0
      ? `${files.length === 1 ? files[0].name : `${files.length} files`}. Polynet reads ${files.length === 1 ? "it" : "them"}.${draft?.kind === "note" ? ` Your words are taught to the guide as "${draft.title}".` : ""}`
      : draft?.kind === "links" ? (draft.links.length === 1 ? "A link. Polynet reads the page." : `${draft.links.length} links. Polynet reads each page.`)
        : draft?.kind === "note" ? "Your guide will know this. Members get it through its answers."
          : props.onAddSources ? "Write it, paste a link, or choose a file." : "Write what your guide should know.";
  const ready = isAsk ? Boolean(text.trim()) : isCourse ? Boolean(outline) : Boolean(draft) || files.length > 0;
  const goLabel = isAsk ? "Ask" : isCourse ? "Create course" : draft?.kind === "note" && files.length === 0 ? "Teach" : "Add";

  return (
    <div className={cx("kadd", "kaddbox")}>
      <textarea ref={box} autoFocus rows={isCourse ? 3 : 2} value={text} disabled={busy}
        onFocus={(event) => { const end = event.currentTarget.value.length; event.currentTarget.setSelectionRange(end, end); }}
        aria-label={isAsk ? `Ask anything ${props.communityName} knows` : isCourse ? "The course, then one lesson per line" : "Teach your guide: write it, paste a link or choose a file"}
        placeholder={isAsk ? `Ask anything ${props.communityName} knows` : isCourse ? "Client onboarding\nKickoff call\nAccess checklist" : "Write what your guide should know, or paste a link"}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); close(); }
          // A question goes on Enter, as it does on Home; notes and outlines keep their lines.
          if (isAsk && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(); }
        }} />
      {outline || draft?.kind === "note" ? (
        <>
          <div className={cx("kreadlab")}>Read as</div>
          <div className={cx("kread")}>
            {outline ? (
              <>
                <span><BookOpen aria-hidden="true" />{outline.name}</span>
                {outline.lessons.map((lesson, index) => <span key={`${index}:${lesson}`}><em>{index + 1}.</em>{lesson}</span>)}
                {outline.lessons.length === 0 ? <span className={cx("dim")}>No lessons yet</span> : null}
              </>
            ) : draft?.kind === "note" ? <span><StickyNote aria-hidden="true" />Your guide learns: {draft.title}</span> : null}
          </div>
        </>
      ) : null}
      {error ? <div className={cx("khint")} role="alert" style={{ color: "var(--danger, #f1a3a3)" }}>{error}</div> : null}
      <div className={cx("kaddfoot")}>
        {props.onCreateCourse || props.onAsk ? (
          <span className={cx("kseg")} role="group" aria-label="What this is">
            {props.onAsk ? <button type="button" aria-pressed={isAsk} disabled={busy} onClick={() => { setMode("ask"); setFiles([]); box.current?.focus(); }}>Ask</button> : null}
            <button type="button" aria-pressed={!isCourse && !isAsk} disabled={busy} onClick={() => { setMode("note"); box.current?.focus(); }}>Teach</button>
            {props.onCreateCourse ? <button type="button" aria-pressed={isCourse} disabled={busy} onClick={() => { setMode("course"); setFiles([]); box.current?.focus(); }}>Course</button> : null}
          </span>
        ) : null}
        <span className={cx("khint")} style={{ marginTop: 0, flex: 1, minWidth: 0 }}>{hint}</span>
        {props.onAddSources && !isCourse && !isAsk ? (
          <>
            <input ref={fileInput} type="file" multiple hidden onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            <button type="button" className={cx("btn sm txt")} disabled={busy} onClick={() => fileInput.current?.click()}>Choose a file</button>
          </>
        ) : null}
        <button type="button" className={cx("btn sm")} disabled={busy} onClick={close}>Cancel</button>
        <button type="button" className={cx("btn sm go")} disabled={busy || !ready} onClick={() => void add()}>{busy ? (isCourse ? "Creating…" : "Adding…") : goLabel}</button>
      </div>
    </div>
  );
}

export function KitKnowledgeList(props: {
  notes: CommunityNoteView[];
  // Files and links Polynet has read; shown to hosts.
  sources: CommunityResource[];
  now: number;
  onOpenNote: (slug: string) => void;
  // Read everything that couldn't be read again; take one source away.
  onRetrySources?: () => Promise<KnowledgeAddResult>;
  onRemoveSource?: (resourceId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const retry = async () => {
    if (busy || !props.onRetrySources) return;
    setBusy("retry");
    setProblem(null);
    try {
      const result = await props.onRetrySources();
      if (!result.ok) setProblem(result.message);
    } finally { setBusy(null); }
  };
  const remove = async (source: CommunityResource) => {
    if (busy || !props.onRemoveSource) return;
    const yes = await askInApp({ message: `Remove "${source.title}"? Your guide forgets what it read there.`, yes: "Remove", no: "Keep", danger: true });
    if (!yes) return;
    setBusy(source.id);
    setProblem(null);
    try { await props.onRemoveSource(source.id); } catch { setProblem("That couldn't be removed. Try again."); } finally { setBusy(null); }
  };
  const rows = [
    ...props.sources.map((source) => ({ key: `s:${source.id}`, at: Date.parse(source.created_at) || 0, source, note: null as CommunityNoteView | null })),
    ...props.notes.map((note) => ({ key: `n:${note.slug}`, at: Date.parse(note.created_at ?? note.updated_at) || 0, source: null as CommunityResource | null, note })),
  ].sort((a, b) => b.at - a.at);
  if (rows.length === 0) return null;

  return (
    <>
      {problem ? <div className={cx("khint")} role="alert" style={{ color: "var(--bad)" }}>{problem}</div> : null}
      <div className={cx("krows")}>
        {rows.map((row) => row.note ? (
          <button key={row.key} type="button" className={cx("krow")} onClick={() => props.onOpenNote(row.note!.slug)}>
            <StickyNote className={cx("ic")} aria-hidden="true" />
            <span className={cx("t")}><b>{row.note.title}</b>{row.note.body_md.replace(/\s+/g, " ").slice(0, 140)}</span>
            <span className={cx("from")}>{noteIsNew(row.note, props.now) ? <i className={cx("sdot fresh")} /> : null}{noteFrom(row.note)}</span>
          </button>
        ) : row.source ? (
          <div key={row.key} className={cx("krow")}>
            {row.source.type === "file" ? <FileText className={cx("ic")} aria-hidden="true" /> : <Link2 className={cx("ic")} aria-hidden="true" />}
            <span className={cx("t")}><b>{row.source.title}</b></span>
            <span className={cx("from")}>
              <span style={sourceFailed(row.source) ? { color: "var(--bad)" } : undefined}>{sourceState(row.source)}</span>
              {sourceFailed(row.source) && props.onRetrySources ? <button type="button" className={cx("btn sm")} disabled={Boolean(busy)} onClick={() => void retry()}>{busy === "retry" ? "Reading…" : "Try again"}</button> : null}
              {props.onRemoveSource ? <button type="button" className={cx("btn sm txt")} disabled={Boolean(busy)} onClick={() => void remove(row.source!)}>{busy === row.source.id ? "Removing…" : "Remove"}</button> : null}
            </span>
          </div>
        ) : null)}
      </div>
    </>
  );
}
