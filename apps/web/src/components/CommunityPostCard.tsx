import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Check, ClipboardList, Lock, Plus, Trash2, X } from "lucide-react";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import { MemberFormRunner, type MemberFormSource } from "./WebCommunityNextStep";
import type { AuthSession } from "../auth";
import type { UserProfile } from "../../../../shared/communityTypes";
import type { CommunityInteractionRootBundle } from "../../../../shared/cloudCommunityInteractionsGateway";
import {
  POLL_MAX_OPTIONS,
  POLL_OPTION_MAX_CHARS,
  POLL_QUESTION_MAX_CHARS,
  POST_FORM_NOTE_MAX_CHARS,
  normalizePollInput,
  postCardIssueText,
  type PostCardPerson,
  type PostFormCard,
  type PostFormResponseRow,
  type PostPollCard,
} from "../../../../shared/communityPostCards";
import {
  createCommunityFormPost,
  createCommunityPollPost,
  getPostFormForViewer,
  listCommunityInteractionReactors,
  listPostFormResponses,
  listShareablePostForms,
  savePostFormAnswers,
  setCommunityPollClosed,
  voteCommunityPoll,
  type CommunityReactorGroup,
  type ShareablePostForm,
} from "../../../../shared/cloudCommunityPostCardsGateway";
import { UserAvatar } from "../../../../shared/UserAvatar";
import "./CommunityPostCard.css";

// Polls and shared Forms drawn on a post, the "+" composer dialogs that make
// them, and the "who reacted" lists. One set of parts for both layouts:
// Channels (chat timeline) and Classroom (post cards).

export type PostPeople = {
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  profilesByUserId: Record<string, UserProfile>;
  onOpenProfile?: (userId: string) => void;
  agentName: string;
};
export const PostPeopleContext = createContext<PostPeople | null>(null);

function PersonFace(props: { person: { user_id: string | null; name: string; avatar_url: string | null }; className?: string }) {
  const people = useContext(PostPeopleContext);
  const profile = props.person.user_id ? people?.profilesByUserId[props.person.user_id] : undefined;
  const name = profile?.display_name || props.person.name;
  return (
    <UserAvatar
      className={props.className ?? "post-card-face"}
      readyClassName="has-image"
      name={name}
      imageUrl={profile?.avatar_url ?? props.person.avatar_url}
      focusX={profile?.avatar_focus_x ?? 0.5}
      focusY={profile?.avatar_focus_y ?? 0.5}
      zoom={profile?.avatar_zoom ?? 1}
      alt=""
      aria-hidden={true}
      fallback={<span>{people?.getInitials(name) ?? name.slice(0, 1)}</span>}
      fallbackStyle={{ backgroundColor: people?.getAvatarColor(props.person.user_id ?? name) }}
    />
  );
}

function FaceStack(props: { people: PostCardPerson[]; total: number; max?: number }) {
  const shown = props.people.slice(0, props.max ?? 3);
  if (!shown.length) return null;
  return (
    <span className="post-card-faces" aria-hidden="true">
      {shown.map((person) => <PersonFace key={person.user_id} person={person} />)}
      {props.total > shown.length ? <span className="post-card-face-more">+{props.total - shown.length}</span> : null}
    </span>
  );
}

// A list of people, each opening their profile: who voted, who answered, who reacted.
function PeopleList(props: { people: Array<{ user_id: string | null; name: string; avatar_url: string | null; is_agent?: boolean }>; onPicked?: () => void }) {
  const people = useContext(PostPeopleContext);
  return (
    <ul className="post-card-people">
      {props.people.map((person, index) => {
        const name = person.is_agent ? people?.agentName ?? person.name
          : (person.user_id && people?.profilesByUserId[person.user_id]?.display_name) || person.name;
        const canOpen = Boolean(person.user_id && people?.onOpenProfile);
        return (
          <li key={`${person.user_id ?? "agent"}:${index}`}>
            <button
              type="button"
              disabled={!canOpen}
              onClick={() => {
                if (!person.user_id) return;
                props.onPicked?.();
                people?.onOpenProfile?.(person.user_id);
              }}
            >
              <PersonFace person={{ ...person, name }} />
              <span>{name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
}

export function PostCardDialog(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("input, textarea, button:not(.post-card-dialog-close)")?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  return createPortal(
    <div className="post-card-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <div
        ref={dialog}
        className={`post-card-dialog${props.wide ? " is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); props.onClose(); } }}
      >
        <header>
          <h2>{props.title}</h2>
          <button type="button" className="post-card-dialog-close" aria-label="Close" onClick={props.onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}

function PollCardView(props: { rootId: string; card: PostPollCard; showQuestion: boolean }) {
  const scope = useContext(CommunityChannelSessionContext);
  const [card, setCard] = useState(props.card);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whoFor, setWhoFor] = useState<string | null>(null);
  // The live post replaces any answer this view got back from its own vote.
  useEffect(() => { setCard(props.card); }, [props.card]);
  const total = card.options.reduce((sum, option) => sum + option.count, 0);
  const chosen = new Set(card.viewer_choices);
  const run = async (work: () => Promise<PostPollCard>) => {
    if (!scope?.session || busy) return;
    setBusy(true); setError(null);
    try { setCard(await work()); } catch (problem) { setError(postCardIssueText(problem, "That didn't save. Try again.")); }
    finally { setBusy(false); }
  };
  const pick = (key: string) => {
    if (card.closed) return;
    const next = card.multiple
      ? (chosen.has(key) ? [...chosen].filter((value) => value !== key) : [...chosen, key])
      : (chosen.has(key) ? [] : [key]);
    void run(() => voteCommunityPoll(scope!.session, props.rootId, next));
  };
  const who = whoFor ? card.options.find((option) => option.key === whoFor) : null;
  return (
    <div className={`post-card post-card-poll${card.closed ? " is-closed" : ""}`} onClick={(event) => event.stopPropagation()}>
      <div className="post-card-kicker">
        <BarChart3 size={14} aria-hidden="true" />
        <span>Poll{card.multiple ? " · Pick any" : ""}{card.closed ? " · Closed" : ""}</span>
      </div>
      {props.showQuestion ? <p className="post-card-title">{card.question}</p> : null}
      <div className="post-card-options" role="group" aria-label={card.question}>
        {card.options.map((option) => {
          const percent = total ? Math.round((option.count / total) * 100) : 0;
          const mine = chosen.has(option.key);
          return (
            <div key={option.key} className={`post-card-option${mine ? " is-mine" : ""}`}>
              <button
                type="button"
                className="post-card-option-choice"
                role={card.multiple ? "checkbox" : "radio"}
                aria-checked={mine}
                disabled={busy || card.closed || !scope?.session}
                onClick={() => pick(option.key)}
              >
                <span className="post-card-option-bar" style={{ width: `${percent}%` }} aria-hidden="true" />
                <span className={`post-card-option-mark${card.multiple ? " is-box" : ""}`} aria-hidden="true">{mine ? <Check size={12} strokeWidth={3} /> : null}</span>
                <span className="post-card-option-label">{option.label}</span>
                <span className="post-card-option-percent">{percent}%</span>
              </button>
              <button
                type="button"
                className="post-card-option-voters"
                disabled={option.count === 0}
                aria-label={option.count === 1 ? `1 vote for ${option.label}: see who` : `${option.count} votes for ${option.label}: see who`}
                onClick={() => setWhoFor(option.key)}
              >
                <FaceStack people={option.voters} total={option.count} />
                <span>{option.count}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="post-card-footer">
        <span>{card.total_voters === 1 ? "1 person voted" : `${card.total_voters} people voted`}</span>
        {card.can_close ? (
          <button type="button" className="post-card-link" disabled={busy} onClick={() => void run(() => setCommunityPollClosed(scope!.session, props.rootId, !card.closed))}>
            {card.closed ? "Reopen poll" : <><Lock size={12} aria-hidden="true" /> Close poll</>}
          </button>
        ) : null}
      </div>
      {error ? <p className="post-card-error" role="alert">{error}</p> : null}
      {who ? (
        <PostCardDialog title={`Voted “${who.label}”`} onClose={() => setWhoFor(null)}>
          <PeopleList people={who.voters} onPicked={() => setWhoFor(null)} />
          {who.count > who.voters.length ? <p className="post-card-muted">and {who.count - who.voters.length} more</p> : null}
        </PostCardDialog>
      ) : null}
    </div>
  );
}

function FormResponsesDialog(props: { rootId: string; formName: string; onClose: () => void }) {
  const scope = useContext(CommunityChannelSessionContext);
  const [state, setState] = useState<{ rows: PostFormResponseRow[]; can_view_answers: boolean } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!scope?.session) return;
    let alive = true;
    listPostFormResponses(scope.session, props.rootId).then((value) => { if (alive) setState(value); }, () => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [scope?.session, props.rootId]);
  return (
    <PostCardDialog title={`Answers to ${props.formName}`} onClose={props.onClose} wide>
      {error ? <p className="post-card-error" role="alert">Answers couldn't be loaded.</p>
        : !state ? <p className="post-card-muted" role="status">Loading…</p>
        : state.rows.length === 0 ? <p className="post-card-muted">No answers yet.</p>
        : state.can_view_answers ? (
          <div className="post-card-responses">
            {state.rows.map((row) => (
              <section key={row.person.user_id} className="post-card-response">
                <PeopleList people={[row.person]} onPicked={props.onClose} />
                <dl>
                  {(row.answers ?? []).map((entry, index) => (
                    <div key={index}><dt>{entry.question}</dt><dd>{entry.answer || "—"}</dd></div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        ) : (
          <>
            <p className="post-card-muted">Only the community's team sees the answers. Here's who has answered.</p>
            <PeopleList people={state.rows.map((row) => row.person)} onPicked={props.onClose} />
          </>
        )}
    </PostCardDialog>
  );
}

function FormCardView(props: { rootId: string; card: PostFormCard; showNote: boolean }) {
  const scope = useContext(CommunityChannelSessionContext);
  const [filling, setFilling] = useState(false);
  const [answersOpen, setAnswersOpen] = useState(false);
  const card = props.card;
  const source: MemberFormSource = {
    load: async (session) => {
      const form = await getPostFormForViewer(session, props.rootId);
      return { id: form.id, name: form.name, questions: form.questions, answers: form.answers, revision: form.revision };
    },
    save: (session, row, answers, submit) => savePostFormAnswers(session, props.rootId, { expectedRevision: row.revision, answers, submit }),
  };
  const action = card.viewer_status === "submitted" ? null : card.viewer_status === "draft" ? "Continue" : "Fill in";
  return (
    <div className="post-card post-card-form" onClick={(event) => event.stopPropagation()}>
      <div className="post-card-kicker"><ClipboardList size={14} aria-hidden="true" /><span>Form</span></div>
      {card.note && props.showNote ? <p className="post-card-note">{card.note}</p> : null}
      <div className="post-card-form-row">
        <div className="post-card-form-name">
          <p className="post-card-title">{card.form_name}</p>
          <span>{card.question_count === 1 ? "1 question" : `${card.question_count} questions`}</span>
        </div>
        {action ? (
          <button type="button" className="post-card-primary" disabled={!scope?.session} onClick={() => setFilling(true)}>{action}</button>
        ) : (
          <span className="post-card-done"><Check size={14} aria-hidden="true" /> Sent</span>
        )}
      </div>
      <div className="post-card-footer">
        <button type="button" className="post-card-voters-button" disabled={card.response_count === 0} onClick={() => setAnswersOpen(true)}>
          <FaceStack people={card.responders} total={card.response_count} />
          <span>
            {card.response_count === 0 ? "No answers yet" : card.response_count === 1 ? "1 person answered" : `${card.response_count} people answered`}
            {card.response_count > 0 ? (card.can_view_answers ? " · See answers" : " · See who") : ""}
          </span>
        </button>
      </div>
      {filling && scope?.session ? createPortal(
        <div className="member-form-backdrop">
          <div className="member-form-dialog" role="dialog" aria-modal="true" aria-label={card.form_name}>
            <MemberFormRunner
              communityId={scope.communityId}
              session={scope.session as AuthSession}
              ensureSession={async (session) => session}
              requestId={`post-form-${props.rootId}`}
              source={source}
              onClose={() => setFilling(false)}
            />
          </div>
        </div>,
        document.body,
      ) : null}
      {answersOpen ? <FormResponsesDialog rootId={props.rootId} formName={card.form_name} onClose={() => setAnswersOpen(false)} /> : null}
    </div>
  );
}

// The card on a post. `showQuestion` is off where the post's title already is the poll question or form note.
export function PostCardView(props: { bundle: CommunityInteractionRootBundle; showQuestion?: boolean }) {
  const card = props.bundle.post_card;
  if (!card) return null;
  return card.kind === "poll"
    ? <PollCardView rootId={props.bundle.root.id} card={card} showQuestion={props.showQuestion !== false} />
    : <FormCardView rootId={props.bundle.root.id} card={card} showNote={props.showQuestion !== false} />;
}

// The title a card post shows in the Classroom feed: the question, or the note / form name.
export function postCardTitle(bundle: CommunityInteractionRootBundle): string | null {
  const card = bundle.post_card;
  if (!card) return null;
  return card.kind === "poll" ? card.question : card.note.split("\n")[0]?.slice(0, 120) || card.form_name;
}

// ---- Composer "+" dialogs -------------------------------------------------

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function PollComposerDialog(props: { communityId: string; channelId: string | null; channelName: string | null; onClose: () => void; onPosted?: () => void }) {
  const scope = useContext(CommunityChannelSessionContext);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per draft, so a retry after a lost response can't post twice.
  const key = useRef(newKey());
  const checked = normalizePollInput({ question, options, multiple });
  const submit = async () => {
    if ("issue" in checked) { setError(postCardIssueText(checked.issue, "Check the poll.")); return; }
    if (!scope?.session || busy) return;
    setBusy(true); setError(null);
    try {
      await createCommunityPollPost(scope.session, { communityId: props.communityId, channelId: props.channelId, idempotencyKey: `poll:${key.current}`, ...checked });
      props.onPosted?.();
      props.onClose();
    } catch (problem) { setError(postCardIssueText(problem, "The poll couldn't be posted. Try again.")); setBusy(false); }
  };
  return (
    <PostCardDialog title="New poll" onClose={props.onClose}>
      <form className="post-card-compose" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="post-card-field">
          <span>Question</span>
          <textarea rows={2} maxLength={POLL_QUESTION_MAX_CHARS} value={question} placeholder="What should we cover next?"
            onChange={(event) => { setQuestion(event.target.value); setError(null); }} />
        </label>
        <fieldset className="post-card-field">
          <legend>Options</legend>
          {options.map((option, index) => (
            <div className="post-card-option-input" key={index}>
              <input
                value={option}
                maxLength={POLL_OPTION_MAX_CHARS}
                placeholder={`Option ${index + 1}`}
                aria-label={`Option ${index + 1}`}
                onChange={(event) => { setOptions(options.map((value, i) => (i === index ? event.target.value : value))); setError(null); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && index === options.length - 1 && options.length < POLL_MAX_OPTIONS) {
                    event.preventDefault();
                    setOptions([...options, ""]);
                    requestAnimationFrame(() => (event.currentTarget.closest("fieldset")?.querySelectorAll("input")[index + 1] as HTMLInputElement | undefined)?.focus());
                  }
                }}
              />
              {options.length > 2 ? (
                <button type="button" className="post-card-icon" aria-label={`Remove option ${index + 1}`} onClick={() => setOptions(options.filter((_, i) => i !== index))}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
          {options.length < POLL_MAX_OPTIONS ? (
            <button type="button" className="post-card-link" onClick={() => setOptions([...options, ""])}><Plus size={14} aria-hidden="true" /> Add option</button>
          ) : null}
        </fieldset>
        <label className="post-card-toggle">
          <input type="checkbox" checked={multiple} onChange={(event) => setMultiple(event.target.checked)} />
          <span>Let people pick more than one</span>
        </label>
        <p className="post-card-muted">Everyone in {props.channelName ? `#${props.channelName}` : "the channel"} sees the results and who voted.</p>
        {error ? <p className="post-card-error" role="alert">{error}</p> : null}
        <footer>
          <button type="button" className="post-card-secondary" onClick={props.onClose}>Cancel</button>
          <button type="submit" className="post-card-primary" disabled={busy}>{busy ? "Posting…" : "Post poll"}</button>
        </footer>
      </form>
    </PostCardDialog>
  );
}

export function FormShareDialog(props: { communityId: string; channelId: string | null; channelName: string | null; onClose: () => void; onPosted?: () => void }) {
  const scope = useContext(CommunityChannelSessionContext);
  const [forms, setForms] = useState<ShareablePostForm[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formKey, setFormKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [everyone, setEveryone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());
  useEffect(() => {
    if (!scope?.session) return;
    let alive = true;
    listShareablePostForms(scope.session, props.communityId).then(
      (rows) => { if (alive) { setForms(rows); setFormKey(rows[0]?.key ?? null); } },
      () => { if (alive) setLoadError(true); },
    );
    return () => { alive = false; };
  }, [scope?.session, props.communityId]);
  const submit = async () => {
    if (!scope?.session || !formKey || busy) return;
    setBusy(true); setError(null);
    try {
      await createCommunityFormPost(scope.session, {
        communityId: props.communityId, channelId: props.channelId, idempotencyKey: `form:${key.current}`,
        formKey, note, answersVisibleTo: everyone ? "everyone" : "builders",
      });
      props.onPosted?.();
      props.onClose();
    } catch (problem) { setError(postCardIssueText(problem, "The form couldn't be posted. Try again.")); setBusy(false); }
  };
  return (
    <PostCardDialog title="Share a form" onClose={props.onClose}>
      <form className="post-card-compose" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {loadError ? <p className="post-card-error" role="alert">Your forms couldn't be loaded.</p>
          : !forms ? <p className="post-card-muted" role="status">Loading your forms…</p>
          : forms.length === 0 ? <p className="post-card-muted">No published forms yet. Make one in Workflows › Forms, publish it, then share it here.</p>
          : (
            <fieldset className="post-card-field">
              <legend>Form</legend>
              <div className="post-card-form-picks">
                {forms.map((form) => (
                  <label key={form.key} className={`post-card-form-pick${formKey === form.key ? " is-picked" : ""}`}>
                    <input type="radio" name="post-card-form" checked={formKey === form.key} onChange={() => setFormKey(form.key)} />
                    <span>{form.name}</span>
                    <small>{form.question_count === 1 ? "1 question" : `${form.question_count} questions`}</small>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        <label className="post-card-field">
          <span>Note <small>(optional)</small></span>
          <textarea rows={2} maxLength={POST_FORM_NOTE_MAX_CHARS} value={note} placeholder="A line about why you're asking"
            onChange={(event) => setNote(event.target.value)} />
        </label>
        <label className="post-card-toggle">
          <input type="checkbox" checked={everyone} onChange={(event) => setEveryone(event.target.checked)} />
          <span>Members can see each other's answers</span>
        </label>
        <p className="post-card-muted">
          {everyone ? "Everyone" : "Only you and your admins"} in {props.channelName ? `#${props.channelName}` : "the channel"} {everyone ? "sees the answers" : "see the answers; members see who answered"}.
        </p>
        {error ? <p className="post-card-error" role="alert">{error}</p> : null}
        <footer>
          <button type="button" className="post-card-secondary" onClick={props.onClose}>Cancel</button>
          <button type="submit" className="post-card-primary" disabled={busy || !formKey}>{busy ? "Posting…" : "Post form"}</button>
        </footer>
      </form>
    </PostCardDialog>
  );
}

// The composer's "+": files as before, plus a poll, plus (for the community's team) a Form.
export function ComposerAddMenu(props: {
  disabled: boolean;
  attachDisabled: boolean;
  attachLabel: string;
  onAttach: () => void;
  onPoll?: () => void;
  onForm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useDismiss(open, () => setOpen(false), ref);
  if (!props.onPoll && !props.onForm) {
    return (
      <button className="ask-icon-btn community-composer-add" type="button" onClick={props.onAttach} disabled={props.attachDisabled}
        aria-label={props.attachLabel} title={props.attachLabel}>
        <Plus size={17} strokeWidth={1.8} aria-hidden="true" />
      </button>
    );
  }
  const choose = (run?: () => void) => { setOpen(false); run?.(); };
  return (
    <div className="community-composer-add-menu" ref={ref}>
      <button className={`ask-icon-btn community-composer-add${open ? " is-active" : ""}`} type="button" disabled={props.disabled}
        aria-label="Add a file, poll or form" title="Add" aria-haspopup="menu" aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((value) => !value)}>
        <Plus size={17} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open ? (
        <div className="community-composer-add-popover" role="menu">
          <button type="button" role="menuitem" disabled={props.attachDisabled} onClick={() => choose(props.onAttach)}>
            <Plus size={16} aria-hidden="true" /><span>Upload a file</span>
          </button>
          {props.onPoll ? (
            <button type="button" role="menuitem" onClick={() => choose(props.onPoll)}>
              <BarChart3 size={16} aria-hidden="true" /><span>Poll</span>
            </button>
          ) : null}
          {props.onForm ? (
            <button type="button" role="menuitem" onClick={() => choose(props.onForm)}>
              <ClipboardList size={16} aria-hidden="true" /><span>Form</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---- Who reacted ------------------------------------------------------------

const reactorCache = new Map<string, Promise<CommunityReactorGroup[]>>();

function useReactors(target: { type: "root" | "reply"; id: string } | null, signature: string, enabled: boolean) {
  const scope = useContext(CommunityChannelSessionContext);
  const [groups, setGroups] = useState<CommunityReactorGroup[] | null>(null);
  const cacheKey = target ? `${target.type}:${target.id}:${signature}` : "";
  useEffect(() => {
    if (!enabled || !target || !scope?.session) return;
    let alive = true;
    if (!reactorCache.has(cacheKey)) {
      const request = listCommunityInteractionReactors(scope.session, target);
      reactorCache.set(cacheKey, request);
      request.catch(() => reactorCache.delete(cacheKey));
    }
    reactorCache.get(cacheKey)!.then((value) => { if (alive) setGroups(value); }, () => { if (alive) setGroups([]); });
    return () => { alive = false; };
  }, [enabled, cacheKey, scope?.session]);
  return groups;
}

function namesSentence(names: string[], total: number): string {
  if (total <= 0 || names.length === 0) return "";
  const shown = names.slice(0, 3);
  const rest = total - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest === 1 ? "1 other" : `${rest} others`}`;
  if (shown.length === 1) return shown[0]!;
  return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

/**
 * Wraps a reaction chip. Channels ("names"): hovering shows "Ana, Ben and 2 others
 * reacted with 👍". Classroom ("faces"): a small card with each person's picture
 * and name, each opening their profile.
 */
export function ReactorsHover(props: {
  target: { type: "root" | "reply"; id: string } | null;
  emoji: string | null;
  count: number;
  signature: string;
  variant: "names" | "faces";
  children: ReactNode;
  className?: string;
}) {
  const people = useContext(PostPeopleContext);
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const timer = useRef<number | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);
  const groups = useReactors(props.target, props.signature, wanted);
  useDismiss(open && props.variant === "faces", () => setOpen(false), ref);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  if (!props.target || props.count <= 0) return <>{props.children}</>;
  const show = () => {
    setWanted(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 250);
  };
  const hide = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 160);
  };
  const group = groups?.filter((row) => props.emoji === null || row.emoji === props.emoji) ?? null;
  const list = group?.flatMap((row) => row.people) ?? [];
  const nameOf = (person: CommunityReactorGroup["people"][number]) => person.is_agent ? people?.agentName ?? person.name
    : (person.user_id && people?.profilesByUserId[person.user_id]?.display_name) || person.name;
  const label = props.emoji
    ? `${namesSentence(list.map(nameOf), props.count)} reacted with ${props.emoji}`
    : `Liked by ${namesSentence(list.map(nameOf), props.count)}`;
  return (
    <span
      ref={ref}
      className={`post-reactors${props.className ? ` ${props.className}` : ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide(); }}
    >
      {props.children}
      {open ? (
        props.variant === "names" ? (
          <span className="post-reactors-tip" role="tooltip">
            {group === null ? "Loading…" : list.length ? <><span className="post-reactors-tip-emoji" aria-hidden="true">{props.emoji ?? "👍"}</span>{label}</> : "No one yet"}
          </span>
        ) : (
          <span className="post-reactors-card" role="dialog" aria-label={props.emoji ? `People who reacted with ${props.emoji}` : "People who liked this"}
            onMouseEnter={show} onMouseLeave={hide}>
            <span className="post-reactors-card-head">{props.emoji ?? "👍"} {props.count === 1 ? "1 person" : `${props.count} people`}</span>
            {group === null ? <span className="post-card-muted">Loading…</span> : <PeopleList people={list} onPicked={() => setOpen(false)} />}
          </span>
        )
      ) : null}
    </span>
  );
}
