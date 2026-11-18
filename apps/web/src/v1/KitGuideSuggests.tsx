// Design system v1, Home: "Your guide suggests". What the guide prepared on
// its own and offers to do, kept apart from "Needs you" (which is the host's
// own decisions). One kind so far: a reply it drafted, from a lesson, to a
// member's question nobody answered for a day (shared/communityReplyDrafts.ts).
// A row opens to the exact words; the host posts them, changes them first,
// or skips. Nothing is posted without that click. Empty, it isn't drawn.
import { useState } from "react";
import { BookOpen, ChevronDown, Sparkles } from "lucide-react";
import { REPLY_DRAFT_EDIT_MAX_CHARS, replyDraftWaited, type ReplyDraftView } from "../../../../shared/communityReplyDrafts";
import { Btn, cx } from "./kit";

export function replyDraftTitle(draft: Pick<ReplyDraftView, "author">): string {
  return `A reply to ${draft.author}'s question is ready`;
}

export function replyDraftDetail(draft: Pick<ReplyDraftView, "question" | "channel" | "hours_waiting">): string {
  return `“${draft.question}” in #${draft.channel} · no answer for ${replyDraftWaited(draft.hours_waiting)}.`;
}

export function GuideSuggests(props: {
  drafts: ReplyDraftView[];
  // Posts the draft (with the host's words, when given). Resolves to what
  // went wrong, in plain words, or null.
  onPost: (id: string, text?: string) => Promise<string | null>;
  onSkip: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (props.drafts.length === 0) return null;
  const post = async (draft: ReplyDraftView) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const problem = await props.onPost(draft.id, editing !== null && editing.trim() !== draft.text.trim() ? editing : undefined);
    setBusy(false);
    if (problem) setError(problem);
    else { setOpenId(null); setEditing(null); }
  };
  return (
    <section className={cx("gsug")} aria-label="Your guide suggests">
      <h3><Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />Your guide suggests <i>{props.drafts.length}</i></h3>
      <div className={cx("nlist")}>
        {props.drafts.map((draft) => {
          const open = openId === draft.id;
          return (
            <div key={draft.id} className={cx("nrow")}>
              <button type="button" className={cx("nhead")} aria-expanded={open}
                onClick={() => { setOpenId(open ? null : draft.id); setEditing(null); setError(null); }}>
                <span className={cx("nicon", "guide")} aria-hidden="true"><Sparkles size={16} strokeWidth={1.7} /></span>
                <span className={cx("ntext")}><b>{replyDraftTitle(draft)}</b><span>{replyDraftDetail(draft)}</span></span>
                <ChevronDown className={cx("nchev", open && "up")} size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
              {open ? (
                <div className={cx("nopen")}>
                  {editing === null ? <p className={cx("gdraft")}>{draft.text}</p> : (
                    <textarea className={cx("gdraft", "edit")} aria-label="The reply" value={editing} maxLength={REPLY_DRAFT_EDIT_MAX_CHARS} rows={5}
                      autoFocus onChange={(event) => setEditing(event.target.value)} />
                  )}
                  {draft.source ? <span className={cx("gsrc")}><BookOpen size={13} strokeWidth={1.8} aria-hidden="true" />From {draft.source}</span> : null}
                  {error ? <p className={cx("gerr")}>{error}</p> : null}
                  <div className={cx("gacts")}>
                    <Btn small go disabled={busy || (editing !== null && !editing.trim())} onClick={() => void post(draft)}>{busy ? "…" : "Post reply"}</Btn>
                    {editing === null
                      ? <Btn small disabled={busy} onClick={() => setEditing(draft.text)}>Edit</Btn>
                      : <Btn small disabled={busy} onClick={() => { setEditing(null); setError(null); }}>Cancel</Btn>}
                    {editing === null ? <Btn small txt disabled={busy} onClick={() => props.onSkip(draft.id)}>Skip</Btn> : null}
                    <small>Posts in #{draft.channel} as your guide</small>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
