// Design system v1, Knowledge: the builders' one list of what the guide
// answers from, the notes, files and links (KitKnowledgeList). Things are
// added with plain buttons beside it (KitKnowledgeAddButtons): a new note, a
// link, files. Nothing is added by typing into the bar at the top of
// Knowledge; that bar only asks the guide (Neil, Nov 15).
import { useRef, useState } from "react";
import { FileText, Link2, StickyNote } from "lucide-react";
import type { CommunityNoteView } from "../../../../shared/cloudCommunityNotesGateway";
import type { CommunityResource } from "../components/communityResourcesContracts";
import { noteIsNew } from "./KitKnowledgeNotes";
import { askInApp } from "../../../../shared/inAppConfirm";
import { cx, Icon } from "./kit";

export type KnowledgeAddResult = { ok: true } | { ok: false; message: string };

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

// The ways to add to what the guide answers from, as buttons: a note (its
// form opens in the side panel), a link to read, files to read.
export function KitKnowledgeAddButtons(props: {
  onNewNote?: () => void;
  onAddSources?: (input: { links: string[]; files: File[] }) => Promise<KnowledgeAddResult>;
}) {
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  if (!props.onNewNote && !props.onAddSources) return null;
  const add = async (input: { links: string[]; files: File[] }) => {
    if (busy || !props.onAddSources) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.onAddSources(input);
      if (result.ok) { setLinking(false); setLink(""); } else setError(result.message);
    } catch { setError("That couldn't be added. Try again."); } finally { setBusy(false); }
  };
  const url = link.trim();
  const isLink = /^https?:\/\/\S+$/i.test(url);
  return (
    <div className={cx("kbtns")}>
      <div className={cx("kbtns-row")}>
        {props.onNewNote ? <button type="button" className={cx("btn sm")} onClick={props.onNewNote}><Icon name="plus" />New note</button> : null}
        {props.onAddSources ? (
          <>
            <button type="button" className={cx("btn sm")} aria-expanded={linking} disabled={busy} onClick={() => { setLinking(!linking); setError(null); }}>Add a link</button>
            <input ref={fileInput} type="file" multiple hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void add({ links: [], files }); }} />
            <button type="button" className={cx("btn sm")} disabled={busy} onClick={() => fileInput.current?.click()}>{busy && !linking ? "Uploading…" : "Upload files"}</button>
          </>
        ) : null}
      </div>
      {linking ? (
        <form className={cx("kbtns-link")} onSubmit={(event) => { event.preventDefault(); if (isLink) void add({ links: [url], files: [] }); }}>
          <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" aria-label="A link for your guide to read" autoFocus disabled={busy} />
          <button type="submit" className={cx("btn sm go")} disabled={busy || !isLink}>{busy ? "Adding…" : "Add"}</button>
          <button type="button" className={cx("btn sm txt")} onClick={() => { setLinking(false); setLink(""); setError(null); }}>Cancel</button>
        </form>
      ) : null}
      {error ? <div className={cx("khint")} role="alert" style={{ color: "var(--bad)" }}>{error}</div> : null}
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
