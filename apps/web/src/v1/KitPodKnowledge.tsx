// Pod knowledge (docs/specs/pods-v0.md, slice 3b): the pod's own notes, in
// its right column. Everyone in the pod reads them; its hosts write them. A
// builder can publish one to the community's Knowledge, on purpose; nothing
// else leaves the pod.
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  deleteCloudPodNote,
  fetchCloudPodNotes,
  formatPodDate,
  publishCloudPodNote,
  saveCloudPodNote,
  type CloudPodNotes,
} from "../../../../shared/cloudCommunityPodsGateway";
import { Btn, Sec, cx } from "./kit";

type Draft = { slug: string | null; title: string; text: string };

export function KitPodKnowledge(props: { session: unknown; communityId: string; channelId: string }) {
  const [state, setState] = useState<CloudPodNotes | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState("");
  const [confirm, setConfirm] = useState<{ slug: string; what: "delete" | "publish" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const call = { session: props.session, communityId: props.communityId, channelId: props.channelId };

  // Answers are kept only for the pod still on screen: switching pods clears
  // the list at once, and a late answer for the previous pod is dropped.
  const scope = `${props.communityId}:${props.channelId}`;
  const current = useRef(scope);
  current.current = scope;
  const load = useCallback(async () => {
    const asked = `${props.communityId}:${props.channelId}`;
    try {
      const next = await fetchCloudPodNotes(call);
      if (current.current === asked) setState(next);
    } catch { if (current.current === asked) setState(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.session, props.communityId, props.channelId]);
  useEffect(() => { setState(null); setOpen(null); setDraft(null); setFilter(""); setConfirm(null); setError(null); void load(); }, [load]);

  const run = async (work: () => Promise<void>, failed: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await work(); await load(); } catch { setError(failed); } finally { setBusy(false); }
  };

  if (!state) return null;
  const words = filter.trim().toLowerCase();
  const notes = words ? state.notes.filter((note) => `${note.title}\n${note.body_md}`.toLowerCase().includes(words)) : state.notes;
  if (!state.notes.length && !state.can_write) return null;

  return (
    <Sec label={`Pod knowledge${state.notes.length ? ` · ${state.notes.length}` : ""}`}>
      {draft ? (
        <div className={cx("podform")} style={{ marginTop: 0 }}>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Title" aria-label="Note title" maxLength={120} autoFocus />
          <textarea value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} placeholder="What the pod should remember." aria-label="Note" rows={7} maxLength={4000} />
          {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
          <div className={cx("acts")}>
            <Btn go small disabled={busy || !draft.title.trim() || !draft.text.trim()} onClick={() => void run(async () => {
              await saveCloudPodNote({ ...call, title: draft.title, text: draft.text, ...(draft.slug ? { slug: draft.slug } : {}) });
              setDraft(null);
            }, "Couldn't save. Try again.")}>{busy ? "Saving…" : "Save"}</Btn>
            <Btn txt small onClick={() => { setDraft(null); setError(null); }}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <>
          {!state.notes.length ? <p className={cx("sub")}>Notes only this pod can read: decisions, call takeaways, what's working.</p> : null}
          {state.notes.length > 5 ? (
            <div className={cx("podform")} style={{ marginTop: 0, marginBottom: 8 }}>
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find in pod knowledge" aria-label="Find in pod knowledge" />
            </div>
          ) : null}
          {notes.map((note) => (
            <div key={note.slug} className={cx("podnote")}>
              <button type="button" className={cx("podnote-title")} aria-expanded={open === note.slug} onClick={() => { setOpen(open === note.slug ? null : note.slug); setConfirm(null); setError(null); }}>
                {note.title}
              </button>
              {open === note.slug ? (
                <>
                  <div className={cx("podnote-body")}>
                    {note.body_md.split(/\n{2,}/).map((part, index) => (
                      <p key={index}>{part.split("\n").map((line, i) => <Fragment key={i}>{i ? <br /> : null}{line}</Fragment>)}</p>
                    ))}
                  </div>
                  <span className={cx("sub2")}>
                    {[note.written_by ? `Written by ${note.written_by}` : "Written by a host", formatPodDate(note.updated_at), note.published ? "Shared with the community" : null].filter(Boolean).join(" · ")}
                  </span>
                  {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
                  {confirm?.slug === note.slug ? (
                    <div className={cx("podleave")}>
                      <span className={cx("sub2")}>
                        {confirm.what === "publish"
                          ? "Everyone in the community will be able to read this note in Knowledge. The pod's other notes stay private."
                          : "Delete this note for the whole pod?"}
                      </span>
                      <span className={cx("acts")}>
                        <Btn small disabled={busy} onClick={() => void run(async () => {
                          if (confirm.what === "publish") await publishCloudPodNote({ ...call, slug: note.slug });
                          else { await deleteCloudPodNote({ ...call, slug: note.slug }); setOpen(null); }
                          setConfirm(null);
                        }, confirm.what === "publish" ? "Couldn't share it. Try again." : "Couldn't delete it. Try again.")}>
                          {confirm.what === "publish" ? (note.published ? "Update the shared copy" : "Share with the community") : "Delete"}
                        </Btn>
                        <Btn small txt onClick={() => setConfirm(null)}>Cancel</Btn>
                      </span>
                    </div>
                  ) : state.can_write || state.can_publish ? (
                    <div className={cx("acts")} style={{ marginTop: 6 }}>
                      {state.can_write ? <Btn small txt onClick={() => setDraft({ slug: note.slug, title: note.title, text: note.body_md })}>Edit</Btn> : null}
                      {state.can_publish ? <Btn small txt onClick={() => setConfirm({ slug: note.slug, what: "publish" })}>{note.published ? "Update shared copy" : "Share with community"}</Btn> : null}
                      {state.can_write ? <Btn small txt onClick={() => setConfirm({ slug: note.slug, what: "delete" })}>Delete</Btn> : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ))}
          {words && !notes.length ? <p className={cx("sub")}>Nothing matches.</p> : null}
          {state.can_write ? (
            <div className={cx("acts")} style={{ marginTop: 8 }}>
              <Btn small txt onClick={() => { setDraft({ slug: null, title: "", text: "" }); setError(null); }}>New note</Btn>
            </div>
          ) : null}
        </>
      )}
    </Sec>
  );
}
