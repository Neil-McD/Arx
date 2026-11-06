// The community's public page (its doorstep): the sales sections the owner
// fills in. Fixed sections, no builder; each shows on the page only when it has
// something in it. "Draft with AI" suggests the empty ones from what the owner
// already wrote, never results or a guarantee, and never saves on its own.
import { useEffect, useRef, useState } from "react";

import {
  getCloudCommunityPublicPage,
  requestCloudCommunityPublicPageDraft,
  saveCloudCommunityPublicPage,
} from "../../../../shared/cloudCommunityAdminGateway";
import {
  COMMUNITY_PUBLIC_PAGE_LIMITS as LIMITS,
  type CommunityPublicPage,
  type CommunityPublicPageDraft,
  communityPublicPageVideoWatchUrl,
} from "../../../../shared/communityPublicPage";

type Form = {
  forYou: string[];
  notFor: string[];
  steps: Array<{ title: string; text: string }>;
  results: Array<{ quote: string; name: string; role: string }>;
  bio: string;
  video: string;
  guarantee: string;
  objections: Array<{ question: string; answer: string }>;
};

// Every slot shown, filled or blank: the form is the page's fixed sections.
function slots<T>(items: T[], count: number, blank: () => T): T[] {
  return Array.from({ length: count }, (_, index) => items[index] ?? blank());
}

function formOf(page: CommunityPublicPage): Form {
  return {
    forYou: slots(page.for_you, LIMITS.forYou.items, () => ""),
    notFor: slots(page.not_for, LIMITS.notFor.items, () => ""),
    steps: slots(page.first_steps, LIMITS.firstSteps.items, () => ({ title: "", text: "" })),
    results: slots(page.results, LIMITS.results.items, () => ({ quote: "", name: "", role: "" })),
    bio: page.founder_bio,
    video: page.video ? communityPublicPageVideoWatchUrl(page.video) : "",
    guarantee: page.guarantee,
    objections: slots(page.objections, LIMITS.objections.items, () => ({ question: "", answer: "" })),
  };
}

// A draft goes only into what's still blank: the owner's own words are never replaced.
function withDraft(form: Form, draft: CommunityPublicPageDraft): Form {
  const fill = <T,>(current: T[], suggested: T[], blank: (item: T) => boolean) => {
    const queue = [...suggested];
    return current.map((item) => (blank(item) && queue.length ? queue.shift()! : item));
  };
  const allBlank = <T,>(items: T[], blank: (item: T) => boolean) => items.every(blank);
  return {
    ...form,
    forYou: allBlank(form.forYou, (item) => !item.trim()) ? fill(form.forYou, draft.for_you, (item) => !item.trim()) : form.forYou,
    notFor: allBlank(form.notFor, (item) => !item.trim()) ? fill(form.notFor, draft.not_for, (item) => !item.trim()) : form.notFor,
    steps: allBlank(form.steps, (item) => !item.title.trim() && !item.text.trim())
      ? fill(form.steps, draft.first_steps, (item) => !item.title.trim() && !item.text.trim()) : form.steps,
    objections: allBlank(form.objections, (item) => !item.question.trim() && !item.answer.trim())
      ? fill(form.objections, draft.objections, (item) => !item.question.trim() && !item.answer.trim()) : form.objections,
  };
}

const FIELD_ERRORS: Array<[string, string]> = [
  ["community_public_page_changed", "Someone saved this page in another tab. Reload Settings to see their version."],
  ["video_url_unsupported", "Use a YouTube, Vimeo or Loom video link."],
  ["results_incomplete", "Each result needs the member's words and their name."],
  ["objections_incomplete", "Each question needs an answer."],
  ["first_steps_incomplete", "Each step needs a title."],
  ["_too_long", "One of the lines is too long. Keep each one short."],
  ["community_owner_required", "Only the community's owner can change the public page."],
];

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return FIELD_ERRORS.find(([code]) => message.includes(code))?.[1] ?? "That didn't save. Try again.";
}

function draftError(code: string | null): string {
  if (code === "nothing_to_draft_from") return "Write your one-liner or About first; the draft is made from them.";
  if (code?.startsWith("funding_unavailable")) return "Your AI allowance is used up, so it couldn't draft this. Fill it in yourself, or add credit.";
  return "The draft didn't come through. Try again in a moment.";
}

const DRAFT_POLL_MS = 2500;
const DRAFT_WAIT_MS = 90_000;

export function CommunityPublicPageSection(props: {
  communityId: string;
  publicPageUrl: string | null;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<Form | null>(null);
  formRef.current = form;

  useEffect(() => {
    let cancelled = false;
    setForm(null);
    setDirty(false);
    setNotice(null);
    setError(null);
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        if (!session) return;
        const loaded = await getCloudCommunityPublicPage({ session, communityId: props.communityId });
        if (cancelled) return;
        setForm(formOf(loaded.page));
        setRevision(loaded.revision);
      } catch {
        if (!cancelled) setError("Couldn't load your public page. Reload to try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communityId]);

  if (!form) {
    return (
      <div className="settings-section community-public-page-section">
        <div className="settings-section-title">Your public page</div>
        {error ? <div className="auth-error">{error}</div> : <div className="settings-section-desc">Loading…</div>}
      </div>
    );
  }

  const change = (next: Form) => {
    setForm(next);
    setDirty(true);
    setNotice(null);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      const saved = await saveCloudCommunityPublicPage({
        session,
        communityId: props.communityId,
        expectedRevision: revision,
        page: {
          for_you: form.forYou,
          not_for: form.notFor,
          first_steps: form.steps,
          results: form.results,
          founder_bio: form.bio,
          video_url: form.video,
          guarantee: form.guarantee,
          objections: form.objections,
        },
      });
      setForm(formOf(saved.page));
      setRevision(saved.revision);
      setDirty(false);
      setNotice("Saved. Your public page shows it now.");
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setSaving(false);
    }
  };

  const draft = async () => {
    if (drafting) return;
    setDrafting(true);
    setError(null);
    setNotice(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      let ai = await requestCloudCommunityPublicPageDraft({ session, communityId: props.communityId });
      const startedAt = Date.now();
      while (ai.status === "drafting" && Date.now() - startedAt < DRAFT_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, DRAFT_POLL_MS));
        ai = (await getCloudCommunityPublicPage({ session, communityId: props.communityId })).ai;
      }
      if (ai.status === "ready" && ai.draft && formRef.current) {
        change(withDraft(formRef.current, ai.draft));
        setNotice("Drafted from your one-liner, About and courses. Read it over, change anything, then Save.");
      } else if (ai.status === "drafting") {
        setError("The draft is taking longer than usual. Try again in a moment.");
      } else {
        setError(draftError(ai.error));
      }
    } catch {
      setError("The draft didn't come through. Try again in a moment.");
    } finally {
      setDrafting(false);
    }
  };

  const line = (value: string, max: number, placeholder: string, onChange: (value: string) => void, label: string) => (
    <input type="text" aria-label={label} value={value} maxLength={max} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  );
  const setAt = <T,>(items: T[], index: number, item: T) => items.map((current, at) => (at === index ? item : current));

  return (
    <div className="settings-section community-public-page-section">
      <div className="settings-section-title">Your public page</div>
      <div className="settings-section-desc">
        What people see before they join. Fill in what you have; anything left blank simply doesn't show.
        {props.publicPageUrl ? (
          <> <a href={props.publicPageUrl} target="_blank" rel="noreferrer">View your public page</a></>
        ) : null}
      </div>
      <div className="community-public-page-ai">
        <button type="button" className="secondary" disabled={drafting || saving} onClick={() => void draft()}>
          {drafting ? "Drafting…" : "Draft with AI"}
        </button>
        <span className="create-community-hint">Fills the empty sections from your one-liner, About and courses. Never results or a guarantee: those have to be real.</span>
      </div>

      <div className="community-public-page-group">
        <span className="community-public-page-label">This is for you if…</span>
        {form.forYou.map((value, index) => line(value, LIMITS.forYou.chars, index === 0 ? "You run a business and your day disappears into admin." : "", (next) => change({ ...form, forYou: setAt(form.forYou, index, next) }), `This is for you if, line ${index + 1}`))}
      </div>
      <div className="community-public-page-group">
        <span className="community-public-page-label">It's not for you if…</span>
        {form.notFor.map((value, index) => line(value, LIMITS.notFor.chars, index === 0 ? "You want hacks to squeeze more hours out of the day." : "", (next) => change({ ...form, notFor: setAt(form.notFor, index, next) }), `It's not for you if, line ${index + 1}`))}
      </div>
      <div className="community-public-page-group">
        <span className="community-public-page-label">Your first steps</span>
        {form.steps.map((step, index) => (
          <div key={index} className="community-public-page-pair">
            {line(step.title, LIMITS.firstSteps.title, `Step ${index + 1}`, (title) => change({ ...form, steps: setAt(form.steps, index, { ...step, title }) }), `Step ${index + 1} title`)}
            {line(step.text, LIMITS.firstSteps.text, "One line on what they do", (text) => change({ ...form, steps: setAt(form.steps, index, { ...step, text }) }), `Step ${index + 1} detail`)}
          </div>
        ))}
      </div>
      <div className="community-public-page-group">
        <span className="community-public-page-label">Results from members</span>
        <span className="create-community-hint">Real members' words only, with their name.</span>
        {form.results.map((result, index) => (
          <div key={index} className="community-public-page-result">
            <textarea aria-label={`Result ${index + 1}`} rows={2} maxLength={LIMITS.results.quote} placeholder="What changed for them, in their words" value={result.quote}
              onChange={(event) => change({ ...form, results: setAt(form.results, index, { ...result, quote: event.target.value }) })} />
            <div className="community-public-page-pair">
              {line(result.name, LIMITS.results.name, "Their name", (name) => change({ ...form, results: setAt(form.results, index, { ...result, name }) }), `Result ${index + 1} name`)}
              {line(result.role, LIMITS.results.role, "What they do (optional)", (role) => change({ ...form, results: setAt(form.results, index, { ...result, role }) }), `Result ${index + 1} role`)}
            </div>
          </div>
        ))}
      </div>
      <label className="create-community-field">
        <span>About you, the host</span>
        <textarea rows={2} maxLength={LIMITS.founderBio} placeholder="One or two lines: who you are and why you started this." value={form.bio}
          onChange={(event) => change({ ...form, bio: event.target.value })} />
      </label>
      <label className="create-community-field">
        <span>Intro video</span>
        <input type="url" placeholder="A YouTube, Vimeo or Loom link" value={form.video} onChange={(event) => change({ ...form, video: event.target.value })} />
      </label>
      <label className="create-community-field">
        <span>Guarantee</span>
        <input type="text" maxLength={LIMITS.guarantee} placeholder="Only if you offer one, e.g. a refund in your first 30 days" value={form.guarantee}
          onChange={(event) => change({ ...form, guarantee: event.target.value })} />
        <span className="create-community-hint">Shown under the Join button.</span>
      </label>
      <div className="community-public-page-group">
        <span className="community-public-page-label">Fair questions</span>
        {form.objections.map((item, index) => (
          <div key={index} className="community-public-page-result">
            {line(item.question, LIMITS.objections.question, index === 0 ? "\"I don't have time for another program.\"" : "A question people ask before joining", (question) => change({ ...form, objections: setAt(form.objections, index, { ...item, question }) }), `Question ${index + 1}`)}
            <textarea aria-label={`Answer ${index + 1}`} rows={2} maxLength={LIMITS.objections.answer} placeholder="Your answer" value={item.answer}
              onChange={(event) => change({ ...form, objections: setAt(form.objections, index, { ...item, answer: event.target.value }) })} />
          </div>
        ))}
      </div>

      {error ? <div className="auth-error">{error}</div> : null}
      {notice ? <div className="auth-status">{notice}</div> : null}
      <div className="create-community-actions">
        <button type="button" className={`platform-save-button${dirty ? " is-dirty" : ""}`} disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save public page"}
        </button>
      </div>
    </div>
  );
}
