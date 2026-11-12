// Design system v1: a community note, read and (for hosts) written in the
// right column of Knowledge. Notes only ever appear there (Neil, Nov 11):
// they are what the guide has learned, not a list to browse.
import { Fragment, useEffect, useState } from "react";
import type { CommunityNoteView } from "../../../../shared/cloudCommunityNotesGateway";
import { Btn, cx, Icon, Sec, Sep } from "./kit";

const WEEK_MS = 7 * 86_400_000;

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

export function OpenNote(props: {
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

export function NoteForm(props: { title: string; text: string; submitLabel: string; onSubmit: (title: string, text: string) => Promise<void>; onCancel: () => void }) {
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
