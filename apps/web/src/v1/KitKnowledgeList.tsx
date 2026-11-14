// Design system v1, Knowledge: "Notes, files and links" (Neil, Nov 14 mock).
// One list of everything the community knows beyond its courses, and for
// hosts one row that adds to it in place: write and it's a note, paste a link
// or choose a file and Polynet reads it. No menu, no pop-up.
import { useEffect, useRef, useState } from "react";
import { FileText, Link2, StickyNote } from "lucide-react";
import type { CommunityNoteView } from "../../../../shared/cloudCommunityNotesGateway";
import type { CommunityResource } from "../components/communityResourcesContracts";
import { noteIsNew } from "./KitKnowledgeNotes";
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
  return "";
}

function sourceState(resource: CommunityResource): string {
  const status = (resource as { source_ingestion_status?: string }).source_ingestion_status;
  if (status === "queued" || status === "processing") return "Reading…";
  if (status === "failed") return "Couldn't read it";
  return resource.type === "file" ? "File" : "Link";
}

export function KitKnowledgeList(props: {
  notes: CommunityNoteView[];
  // Files and links Polynet has read; shown to hosts.
  sources: CommunityResource[];
  now: number;
  onOpenNote: (slug: string) => void;
  // Hosts only: add a note, or hand links and files to be read.
  onAddNote?: (title: string, text: string) => Promise<KnowledgeAddResult>;
  onAddSources?: (input: { links: string[]; files: File[] }) => Promise<KnowledgeAddResult>;
  // Open the add box already holding this (an unanswered question to answer).
  seed?: { text: string; nonce: number } | null;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const canAdd = Boolean(props.onAddNote || props.onAddSources);
  const seedNonce = props.seed?.nonce;
  useEffect(() => {
    if (!props.seed || !canAdd) return;
    setText(props.seed.text);
    setFiles([]);
    setError(null);
    setAdding(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);
  const draft = readKnowledgeDraft(text);
  const close = () => { setAdding(false); setText(""); setFiles([]); setError(null); };

  const add = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Files (or links) and words together: both are kept. The files go
      // first; once they are in, they leave the box so a retry never adds
      // them twice.
      let result: KnowledgeAddResult = { ok: true };
      if (files.length > 0 || draft?.kind === "links") {
        if (!props.onAddSources) return;
        result = await props.onAddSources({ links: draft?.kind === "links" ? draft.links : [], files });
        if (result.ok) setFiles([]);
      }
      if (result.ok && draft?.kind === "note") {
        if (!props.onAddNote) return;
        result = await props.onAddNote(draft.title, draft.text);
      }
      if (result.ok) close(); else setError(result.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    ...props.sources.map((source) => ({ key: `s:${source.id}`, at: Date.parse(source.created_at) || 0, source, note: null as CommunityNoteView | null })),
    ...props.notes.map((note) => ({ key: `n:${note.slug}`, at: Date.parse(note.created_at ?? note.updated_at) || 0, source: null as CommunityResource | null, note })),
  ].sort((a, b) => b.at - a.at);
  if (!canAdd && rows.length === 0) return null;

  const hint = files.length > 0
    ? `${files.length === 1 ? files[0].name : `${files.length} files`}. Polynet reads ${files.length === 1 ? "it" : "them"}.${draft?.kind === "note" ? ` Your words are saved as a note, "${draft.title}".` : ""}`
    : draft?.kind === "links" ? (draft.links.length === 1 ? "A link. Polynet reads the page." : `${draft.links.length} links. Polynet reads each page.`)
      : draft?.kind === "note" ? `A note, "${draft.title}". Every member and the guide can read it.`
        : "Write a note, paste a link, or choose a file.";

  return (
    <>
      <div className={cx("khead")}><span className={cx("lab")}>Notes, files and links</span></div>
      {adding ? (
        <div className={cx("kadd")}>
          <textarea autoFocus rows={2} value={text}
            onFocus={(event) => { const end = event.currentTarget.value.length; event.currentTarget.setSelectionRange(end, end); }} disabled={busy} aria-label="Add a note, a link or a file"
            placeholder="Write what Polynet should know, or paste a link" onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") close(); }} />
          <div className={cx("khint")}>{hint}</div>
          {error ? <div className={cx("khint")} role="alert" style={{ color: "var(--danger, #f1a3a3)" }}>{error}</div> : null}
          <div className={cx("acts")} style={{ marginTop: 10 }}>
            {props.onAddSources ? (
              <>
                <input ref={fileInput} type="file" multiple hidden onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
                <button type="button" className={cx("btn sm txt")} disabled={busy} onClick={() => fileInput.current?.click()}>Choose a file</button>
              </>
            ) : null}
            <span style={{ flex: 1 }} />
            <button type="button" className={cx("btn sm")} disabled={busy} onClick={close}>Cancel</button>
            <button type="button" className={cx("btn sm go")} disabled={busy || (!draft && files.length === 0)} onClick={() => void add()}>{busy ? "Adding…" : "Add"}</button>
          </div>
        </div>
      ) : null}
      <div className={cx("krows")}>
        {canAdd && !adding ? (
          <button type="button" className={cx("krow add")} onClick={() => setAdding(true)}>
            <Icon name="plus" /><span className={cx("t")}>Add a note, a link or a file</span><span className={cx("from")}>Write, paste or choose</span>
          </button>
        ) : null}
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
            <span className={cx("from")}>{sourceState(row.source)}</span>
          </div>
        ) : null)}
      </div>
    </>
  );
}
