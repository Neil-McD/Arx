import { useCallback, useEffect, useState } from "react";

import {
  deleteCommunityNote,
  fetchCommunityNotes,
  updateCommunityNote,
  type CommunityNoteView,
  type CommunityNotesView,
} from "../../../../shared/cloudCommunityNotesGateway";
import { resolveUsableSession, type EnsureSessionFn } from "../../../../shared/ensureUsableSession";
import { COMMUNITY_NOTES_MAX_PER_COMMUNITY } from "../../../../shared/communityNotes";
import "./WebCommunityNotes.css";

const COMPACT_LIMIT = 5;

// Community notes: what the founder keeps for everyone. Compact in the
// channel panel (titles only); full on the Knowledge page, where owners and
// admins can edit or delete a note.
export function WebCommunityNotes<SessionT>(props: {
  communityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  compact?: boolean;
}) {
  const [view, setView] = useState<CommunityNotesView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<{ slug: string; title: string; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!props.communityId) return;
    const session = await resolveUsableSession(props.session, props.ensureSession);
    if (!session) { setError("Sign in again to see community notes."); return; }
    try {
      setView(await fetchCommunityNotes({ session, communityId: props.communityId, limit: props.compact ? COMPACT_LIMIT : COMMUNITY_NOTES_MAX_PER_COMMUNITY }));
      setError(null);
    } catch {
      setError("Couldn't load community notes.");
    }
  }, [props.communityId, props.session, props.ensureSession, props.compact]);

  useEffect(() => { setView(null); void load(); }, [load, retry]);

  const act = async (action: (session: SessionT, communityId: string) => Promise<void>) => {
    if (!props.communityId) return;
    const session = await resolveUsableSession(props.session, props.ensureSession);
    if (!session) { setError("Sign in again to change notes."); return; }
    setBusy(true);
    try {
      await action(session, props.communityId);
      setEditing(null);
      setConfirmingDelete(null);
      await load();
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !view) {
    return <div className="community-notes" role="status">{error} <button type="button" onClick={() => setRetry((n) => n + 1)}>Retry</button></div>;
  }
  if (!view) return <div className="community-notes" aria-label="Loading community notes"><div className="web-skeleton-row" /></div>;

  if (props.compact) {
    return (
      <div className="community-notes community-notes-compact">
        {view.notes.length === 0
          ? <p className="model-note">No notes yet. The agent saves what's worth sharing.</p>
          : <ul>{view.notes.map((note) => <li key={note.slug}>{note.title}</li>)}</ul>}
      </div>
    );
  }

  return (
    <div className="settings-section community-notes">
      <p className="model-note">
        What the community agent saved for everyone to read, learned from members' questions and tags.
        {view.can_manage ? " You can edit or delete any note." : ""}
      </p>
      {error ? <div className="auth-error">{error}</div> : null}
      {view.notes.length === 0 ? <p className="model-note">No notes yet.</p> : null}
      <ul className="community-notes-list">
        {view.notes.map((note: CommunityNoteView) => (
          <li key={note.slug} className="community-note">
            {editing?.slug === note.slug ? (
              <div className="community-note-edit">
                <input
                  aria-label="Note title"
                  value={editing.title}
                  disabled={busy}
                  onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                />
                <textarea
                  aria-label="Note text"
                  className="system-prompt-input"
                  rows={6}
                  value={editing.text}
                  disabled={busy}
                  onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                />
                <div className="agent-preview-actions">
                  <button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                  <button
                    type="button"
                    className="platform-save-button is-dirty"
                    disabled={busy || !editing.title.trim() || !editing.text.trim()}
                    onClick={() => void act((session, communityId) => updateCommunityNote({
                      session, communityId, slug: note.slug, title: editing.title, text: editing.text,
                    }))}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="community-note-title">{note.title}</h3>
                <p className="community-note-body">{note.body_md}</p>
                <p className="model-note">Saved {note.source}, updated {note.updated_at.slice(0, 10)}.</p>
                {view.can_manage ? (
                  confirmingDelete === note.slug ? (
                    <div className="agent-preview-actions">
                      <span className="model-note">Delete this note for everyone?</span>
                      <button type="button" disabled={busy} onClick={() => setConfirmingDelete(null)}>Keep it</button>
                      <button
                        type="button"
                        className="platform-save-button is-dirty"
                        disabled={busy}
                        onClick={() => void act((session, communityId) => deleteCommunityNote({ session, communityId, slug: note.slug }))}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div className="agent-preview-actions">
                      <button type="button" onClick={() => setEditing({ slug: note.slug, title: note.title, text: note.body_md })}>Edit</button>
                      <button type="button" onClick={() => setConfirmingDelete(note.slug)}>Delete</button>
                    </div>
                  )
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
