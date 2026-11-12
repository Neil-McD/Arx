// Design system v1: Knowledge in the mock's markup (docs/design/hifi-mock,
// Knowledge): what the community has learned, as a map of its notes and a
// plain list, with the open note in the right column. Built from what exists
// (Neil, Nov 11): notes hosts write and earlier saved notes. Waiting for
// review (guide-drafted notes behind approval) comes later on the same page.
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createCommunityNote,
  deleteCommunityNote,
  fetchCommunityNotes,
  updateCommunityNote,
  type CommunityNoteView,
} from "../../../../shared/cloudCommunityNotesGateway";
import { COMMUNITY_NOTES_MAX_PER_COMMUNITY } from "../../../../shared/communityNotes";
import { layoutNotes, relatedNotes } from "../../../../shared/communityKnowledgeMap";
import { Btn, cx, Icon, KitApp, Rail, Sec, Sep } from "./kit";

const WEEK_MS = 7 * 86_400_000;
const LABELED = 9;
const MAP_W = 848;
const MAP_H = 560;

type Filter = "all" | "new" | "hosts" | "earlier";

export function noteIsNew(note: Pick<CommunityNoteView, "created_at" | "updated_at">, now: number): boolean {
  const at = Date.parse(note.created_at ?? note.updated_at);
  return Number.isFinite(at) && now - at <= WEEK_MS;
}

// Where a note came from, in the record's words; never names a member whose
// conversation it was saved from.
export function noteOrigin(note: Pick<CommunityNoteView, "kind" | "written_by">): string {
  if (note.kind === "founder") return note.written_by ? `Written by ${note.written_by}` : "Written by a host";
  if (note.kind === "ask") return "Saved from a conversation with the guide";
  if (note.kind === "tag") return "Saved from a conversation in a channel";
  return "From earlier community memory";
}

function noteDay(iso: string | undefined): string {
  const at = Date.parse(iso ?? "");
  return Number.isFinite(at) ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

export function notesForFilter(notes: CommunityNoteView[], filter: Filter, now: number): CommunityNoteView[] {
  if (filter === "new") return notes.filter((note) => noteIsNew(note, now));
  if (filter === "hosts") return notes.filter((note) => note.kind === "founder");
  if (filter === "earlier") return notes.filter((note) => note.kind !== "founder");
  return notes;
}

export function KitKnowledgePage(props: {
  communityId: string;
  communityName: string;
  session: unknown;
  onOpenResources: () => void;
  renderRail: (rail: ReactNode) => ReactNode;
}) {
  const [notes, setNotes] = useState<CommunityNoteView[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [mode, setMode] = useState<"read" | "edit" | "new">("read");
  const [now] = useState(Date.now);

  const load = useCallback(async () => {
    try {
      const view = await fetchCommunityNotes({ session: props.session, communityId: props.communityId, limit: COMMUNITY_NOTES_MAX_PER_COMMUNITY });
      setNotes(view.notes);
      setCanManage(view.can_manage);
      setFailed(false);
      return view.notes;
    } catch {
      setFailed(true);
      return null;
    }
  }, [props.session, props.communityId]);
  useEffect(() => { setNotes(null); setOpenSlug(null); void load(); }, [load]);

  const all = notes ?? [];
  const shown = useMemo(() => notesForFilter(all, filter, now), [all, filter, now]);
  const related = useMemo(() => relatedNotes(all), [all]);
  const newCount = all.filter((note) => noteIsNew(note, now)).length;
  const hostsCount = all.filter((note) => note.kind === "founder").length;
  const earlierCount = all.length - hostsCount;

  // The newest open first; a filter that hides the open note opens its first.
  useEffect(() => {
    if (!notes || mode === "new") return;
    if (!openSlug || !shown.some((note) => note.slug === openSlug)) setOpenSlug(shown[0]?.slug ?? null);
  }, [notes, shown, openSlug, mode]);

  const open = all.find((note) => note.slug === openSlug) ?? null;
  const labeled = useMemo(() => new Set(shown.slice(0, LABELED).map((note) => note.slug)), [shown]);
  const points = useMemo(() => layoutNotes(shown.map((note) => note.slug), labeled, MAP_W, MAP_H), [shown, labeled]);
  const at = useMemo(() => new Map(points.map((point) => [point.slug, point])), [points]);
  const bySlug = useMemo(() => new Map(all.map((note) => [note.slug, note])), [all]);
  const openNote = (slug: string) => { setMode("read"); setOpenSlug(slug); };

  const chip = (id: Filter, label: string, count: number) => (
    <button key={id} type="button" className={cx("chip", filter === id && "sel")} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} · {count}</button>
  );

  const edges: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const note of shown) {
    for (const other of related.get(note.slug) ?? []) {
      const key = [note.slug, other].sort().join("|");
      if (!at.has(other) || seen.has(key)) continue;
      seen.add(key);
      edges.push([note.slug, other]);
    }
  }

  const page = (
    <KitApp view="know" host={canManage} part="flow">
      <div className={cx("page")} style={{ padding: 0, overflow: "visible" }}>
        <h2 className={cx("kn-title")}>What {props.communityName} has learned</h2>
        <p className={cx("kn-sub")}>
          {failed ? "Knowledge couldn't load." : !notes ? " "
            : all.length === 0 ? "Nothing yet. Notes your hosts write show here, and members and the guide read them."
              : `${all.length} ${all.length === 1 ? "note" : "notes"}${newCount ? `, ${newCount} new this week` : ""}.`}
        </p>
        <div className={cx("filters")} style={{ marginTop: 16, flexWrap: "wrap" }} role="group" aria-label="Show">
          {chip("all", "Everything", all.length)}
          {newCount ? chip("new", "New this week", newCount) : null}
          {hostsCount && earlierCount ? chip("hosts", "Written by hosts", hostsCount) : null}
          {hostsCount && earlierCount ? chip("earlier", "Saved earlier", earlierCount) : null}
          <button type="button" className={cx("chip")} onClick={props.onOpenResources}>Resources</button>
          {canManage ? <button type="button" className={cx("btn sm")} style={{ marginLeft: "auto" }} onClick={() => { setMode("new"); setOpenSlug(null); }}><Icon name="plus" />New note</button> : null}
        </div>

        {shown.length ? (
          <svg className={cx("map kn-map")} viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="Map of the community's notes">
            <defs>
              <radialGradient id="kn-aur" cx="50%" cy="50%" r="50%">
                <stop offset="0" style={{ stopColor: "var(--aurora)" }} stopOpacity=".55" />
                <stop offset="1" style={{ stopColor: "var(--aurora)" }} stopOpacity="0" />
              </radialGradient>
              <radialGradient id="kn-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="currentColor" stopOpacity=".5" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
            </defs>
            {edges.map(([a, b]) => {
              const p = at.get(a)!; const q = at.get(b)!;
              const lit = a === openSlug || b === openSlug;
              return <path key={`${a}|${b}`} d={`M${p.x} ${p.y}L${q.x} ${q.y}`} stroke="currentColor" strokeOpacity={lit ? 0.34 : 0.1} strokeWidth={lit ? 1 : 0.8} />;
            })}
            {points.map((point) => {
              const note = bySlug.get(point.slug)!;
              const selected = point.slug === openSlug;
              const fresh = noteIsNew(note, now);
              return (
                <g key={point.slug} className={cx("kn-pt")} role="button" tabIndex={-1} onClick={() => openNote(point.slug)}>
                  <title>{note.title}</title>
                  <circle cx={point.x} cy={point.y} r="18" fill="transparent" />
                  {selected ? (
                    <>
                      <circle cx={point.x} cy={point.y} r="46" fill="url(#kn-aur)" />
                      <circle cx={point.x} cy={point.y} r="13" fill="none" stroke="currentColor" strokeOpacity=".5" />
                      <circle cx={point.x} cy={point.y} r="5.5" fill="currentColor" />
                    </>
                  ) : (
                    <>
                      {fresh ? <circle cx={point.x} cy={point.y} r="24" fill="url(#kn-aur)" opacity=".8" /> : null}
                      {point.labeled ? <circle cx={point.x} cy={point.y} r="14" fill="url(#kn-glow)" opacity=".5" /> : null}
                      <circle cx={point.x} cy={point.y} r={point.labeled ? 3.6 : 2} fill="currentColor" opacity={point.labeled ? 1 : 0.6} />
                    </>
                  )}
                  {point.labeled || selected ? (
                    <text x={point.x + (selected ? 22 : 14)} y={point.y + (selected ? 5 : 4)} className={cx("star-l", selected && "sel")}>{note.title}</text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}

        {shown.length ? (
          <>
            <span className={cx("lab")} style={{ display: "block", marginTop: 8 }}>All notes</span>
            <div className={cx("list")} style={{ marginTop: 8 }}>
              {shown.map((note) => (
                <button key={note.slug} type="button" className={cx("erow kn-row", note.slug === openSlug && "sel")} onClick={() => openNote(note.slug)}>
                  <span className={cx("kn-dot", noteIsNew(note, now) && "kn-fresh")} aria-hidden="true" />
                  <div><b>{note.title}</b><span className={cx("s")}>{noteOrigin(note)} · {noteDay(note.created_at ?? note.updated_at)}</span></div>
                  {noteIsNew(note, now) ? <span className={cx("recap")}><Icon name="spark" />New</span> : <span />}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </KitApp>
  );

  const rail = (
    <KitApp view="know" host={canManage} part="rail" className="kit-page-rail">
      <Rail index={2} label={open ? open.title : "Note"}>
        {mode === "new" && canManage ? (
          <NoteForm title="" text="" submitLabel="Save note" onCancel={() => setMode("read")}
            onSubmit={async (title, text) => {
              const created = await createCommunityNote({ session: props.session, communityId: props.communityId, title, text });
              await load();
              setFilter("all");
              setMode("read");
              setOpenSlug(created.slug);
            }} />
        ) : open && mode === "edit" && canManage ? (
          <NoteForm title={open.title} text={open.body_md} submitLabel="Save changes" onCancel={() => setMode("read")}
            onSubmit={async (title, text) => {
              await updateCommunityNote({ session: props.session, communityId: props.communityId, slug: open.slug, title, text });
              await load();
              setMode("read");
            }} />
        ) : open ? (
          <OpenNote note={open} now={now} canManage={canManage}
            related={(related.get(open.slug) ?? []).map((slug) => bySlug.get(slug)).filter((note): note is CommunityNoteView => Boolean(note))}
            onOpen={openNote} onEdit={() => setMode("edit")}
            onDelete={async () => {
              await deleteCommunityNote({ session: props.session, communityId: props.communityId, slug: open.slug });
              setOpenSlug(null);
              await load();
            }} />
        ) : (
          <Sec label="Knowledge"><p>{notes ? "Choose a note to read it here." : " "}</p></Sec>
        )}
      </Rail>
    </KitApp>
  );

  return <>{page}{props.renderRail(rail)}</>;
}

function OpenNote(props: {
  note: CommunityNoteView;
  now: number;
  canManage: boolean;
  related: CommunityNoteView[];
  onOpen: (slug: string) => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [props.note.slug]);
  const paragraphs = props.note.body_md.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return (
    <>
      <div className={cx("sec")}>
        {noteIsNew(props.note, props.now) ? <span className={cx("kick")}><Icon name="spark" />New this week</span> : null}
        <h2 className={cx("kn-note-title")}>{props.note.title}</h2>
        <div className={cx("kn-body")}>
          {paragraphs.map((part, index) => <p key={index}>{part.split("\n").map((line, i) => <Fragment key={i}>{i ? <br /> : null}{line}</Fragment>)}</p>)}
        </div>
      </div>
      <Sep />
      <Sec label="Learned from">
        <div className={cx("src")}><Icon name={props.note.kind === "founder" ? "users" : "spark"} />{noteOrigin(props.note)}<em>{noteDay(props.note.created_at ?? props.note.updated_at)}</em></div>
      </Sec>
      {props.related.length ? (
        <>
          <Sep />
          <Sec label="Related">
            {props.related.map((note, index) => (
              <button key={note.slug} type="button" className={cx("src")} style={index ? { marginTop: -8 } : undefined} onClick={() => props.onOpen(note.slug)}>
                <span className={cx("sdot")} />{note.title}
              </button>
            ))}
          </Sec>
        </>
      ) : null}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className={cx("lab")}>Who can read it</span>
          <span className={cx("sub2")}>All members and the guide</span>
        </div>
        {props.canManage ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={props.onEdit}>Edit</Btn>
            {confirming ? (
              <>
                <button type="button" className={cx("btn sm no")} onClick={() => void props.onDelete()}>Delete for good</button>
                <Btn small txt onClick={() => setConfirming(false)}>Keep it</Btn>
              </>
            ) : <Btn small txt onClick={() => setConfirming(true)}>Delete</Btn>}
          </div>
        ) : null}
      </div>
    </>
  );
}

function NoteForm(props: { title: string; text: string; submitLabel: string; onSubmit: (title: string, text: string) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(props.title);
  const [text, setText] = useState(props.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!title.trim() || !text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSubmit(title.trim(), text.trim());
    } catch {
      setError("It couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className={cx("kn-form")} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <span className={cx("lab")}>{props.title ? "Edit note" : "New note"}</span>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" aria-label="Title" maxLength={120} autoFocus />
      <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="What should members and the guide know?" aria-label="Note" rows={10} />
      <p className={cx("sub")}>Every member and the guide can read it.</p>
      {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn small go onClick={() => void submit()}>{saving ? "Saving…" : props.submitLabel}</Btn>
        <Btn small txt onClick={props.onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}
