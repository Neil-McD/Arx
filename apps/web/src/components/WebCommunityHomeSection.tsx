// Home (design system v1): the guide briefs you, then the few things that
// need you, then the box to ask it anything. One column and nothing else.
//
// - The brief: what's happening here, in one to three sentences the guide
//   wrote (shared/communityBriefs.ts). Without a guide, or before it has
//   written one, a plain sentence of facts stands in.
// - The list (KitNeedsYou): first, for everyone, the tags of you nobody has
//   seen yet (shared/communityHomeTags.ts), live; then for a host, people
//   asking to join and what was noticed; for a member, what is for them. The
//   three most important show and the rest stack. Only what came forward on its own is here; work done
//   through an agent is approved where the agent is being worked with.
// - What the guide suggests (KitGuideSuggests), for a host with a guide: a
//   reply it drafted to a question nobody answered. It is kept apart from the
//   list above: that is what the host must decide, this is an offer.
// - The right column (KitHomeRail) keeps what is glanceable: the next event,
//   what the community knows, who is here.
//
// A member sees only what any member can already see
// (convex/communityFounderBrief.ts, convex/communityHomeMoments.ts).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { KitHomeRail } from "../v1/KitHomeRail";
import { usePlaceBriefRead } from "../v1/KitBrief";
import { dismissOwnerMoment, fetchOwnerNoticed } from "../../../../shared/cloudCommunityOwnerMomentsGateway";
import type { OwnerNoticed } from "../../../../shared/communityOwnerMoments";
import { fetchMemberHomeSteps } from "../../../../shared/cloudCommunityHomeMomentsGateway";
import { formatMomentWhen, type MemberNextStep } from "../../../../shared/communityHomeMoments";
import { briefAge } from "../../../../shared/communityBriefs";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import {
  getCloudCommunityHomeSnapshot,
  type CloudCommunityHomeSnapshot,
} from "../../../../shared/cloudCommunityAdminGateway";
import { NeedsYou, homeThingsCount, type HomeThing, type NeedsYouJoinReview } from "../v1/KitNeedsYou";
import { GuideSuggests } from "../v1/KitGuideSuggests";
import { fetchReplyDrafts, postReplyDraft, skipReplyDraft } from "../../../../shared/cloudCommunityReplyDraftsGateway";
import type { ReplyDraftView } from "../../../../shared/communityReplyDrafts";
import { Eyebrow, Hello, HomeBody, KitApp, Rail, TextLink, cx } from "../v1/kit";
import type { HomeTags } from "../../../../shared/communityHomeTags";
import { useLiveQuery } from "../../../../shared/liveQuery";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { PanelBlockSkeleton } from "./WebLoadingSkeleton";

export type WebCommunityHomeSectionProps = {
  communityId: string;
  communityName: string;
  firstName: string;
  audience: "host" | "member";
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  onOpenJoinRequests: () => void;
  // The Members page itself (the people who have joined), not the requests.
  onOpenMembers?: () => void;
  onOpenChannelByName: (channelName: string) => void;
  onOpenEvents: () => void;
  onOpenKnowledge?: () => void;
  // A tag line opens its message (the thread, in its channel or pod); the
  // "and N more" line opens the next one's room (rootId null).
  onOpenTag?: (channelSlug: string, rootId: string | null) => void;
  // Changes each time Home is opened, so the facts are read again.
  refreshKey?: number;
  // Home stays mounted, hidden, while you are on another page. Its facts are
  // read only while it is the page you are on; refreshKey changes when it
  // opens, so they are read then.
  open?: boolean;
  // Where the right-hand column goes on wide windows (the page's own rail).
  // The rail stays open, narrowing with the window, and hides only below 1024px.
  asideContainer?: HTMLElement | null;
  now?: Date;
  // The dock supplies the conversation and whether it is open.
  // `hasConversation`: the one thread has something to read, so a quiet Home
  // still offers a way back into it.
  kit?: { talking: boolean; talk: ReactNode; onTalkItOver: () => void; hasConversation?: boolean } | null;
  // Whether the community's agent is on (docs/specs/community-agent-gateway-v0.md).
  // Off: no brief and nothing "for you"; a host's noticed rows say what a
  // guide would do, and the first offers to turn it on.
  agentOn?: boolean;
  onTurnOnAgent?: () => void;
  // The people waiting to join, with approve and decline, so the host decides
  // on Home. Absent, the row shows the count and links to Members.
  joinReview?: NeedsYouJoinReview | null;
  // Who is here now.
  presence?: CommunityPresenceSummary | null;
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// The plain sentence under the greeting when there is no brief: who joined,
// and for a host how many things need them.
export function homeSentenceFor(
  snapshot: CloudCommunityHomeSnapshot,
  audience: "host" | "member" = "host",
  needs = 0,
  // A member's tags not seen yet: a quiet day isn't quiet for them.
  tags = 0,
): string {
  const joined = snapshot.newMembers.count;
  const joinedPart = joined > 0 ? `${plural(joined, "person", "people")} joined since yesterday` : "";
  if (audience === "member") {
    const said = snapshot.activity.posts + snapshot.activity.replies;
    if (joinedPart && said > 0) return `${joinedPart}, and there ${said === 1 ? "is 1 new message" : `are ${said} new messages`}.`;
    if (joinedPart) return `${joinedPart}.`;
    if (said > 0) return `${plural(said, "new message", "new messages")} since yesterday.`;
    if (tags > 0) return tags === 1 ? "Someone tagged you." : `You were tagged ${tags} times.`;
    return "It's quiet today.";
  }
  const needsPart = needs === 1 ? "1 thing needs you" : `${needs} things need you`;
  if (needs > 0 && joinedPart) return `${joinedPart}, and ${needsPart}.`;
  if (needs > 0) return `${needsPart} today.`;
  if (joinedPart) return `${joinedPart}. Nothing needs you today.`;
  return "Nothing needs you today.";
}

// "8:40 pm", as the mock's eyebrow has it.
export function homeClockFor(now: Date): string {
  return now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s+/g, " ").toLowerCase();
}

type HomeTargets = Pick<WebCommunityHomeSectionProps, "onOpenJoinRequests" | "onOpenMembers" | "onOpenChannelByName" | "onOpenEvents" | "onOpenKnowledge">;

function opener(target: OwnerNoticed["target"] | MemberNextStep["target"], actions: HomeTargets): () => void {
  return () => {
    if (target.kind === "channel") actions.onOpenChannelByName(target.name);
    else if (target.kind === "knowledge") actions.onOpenKnowledge?.();
    else if (target.kind === "events") actions.onOpenEvents();
    // People who have joined are on the Members page; only requests are in its drawer.
    else (actions.onOpenMembers ?? actions.onOpenJoinRequests)();
  };
}

// A waiting question the guide has drafted a reply for shows once, under
// "Your guide suggests", not also as a row of its own.
export function noticedWithoutDrafted(noticed: OwnerNoticed[], drafts: Array<Pick<ReplyDraftView, "author" | "channel">>): OwnerNoticed[] {
  return noticed.filter((entry) => !(entry.key === "questions_waiting" && entry.target.kind === "channel"
    && drafts.some((draft) => entry.target.kind === "channel" && entry.target.name === draft.channel && entry.title.startsWith(`${draft.author}'s question `))));
}

const NOTICED_ICON = { questions_waiting: "question", quiet_newcomers: "people", course_stall: "lesson" } as const;

// A host's rows from what was noticed. Without a guide, each says what a
// guide would do about it.
export function hostThingsFor(noticed: OwnerNoticed[], args: { agentOn: boolean; actions: HomeTargets; onNotNow: (key: string) => void }): HomeThing[] {
  return noticed.map((entry) => ({
    key: entry.key,
    icon: NOTICED_ICON[entry.key],
    title: entry.title,
    detail: args.agentOn ? entry.detail : `${entry.detail} With a guide, it ${entry.guide}.`,
    action: entry.action,
    onAction: opener(entry.target, args.actions),
    onNotNow: () => args.onNotNow(entry.key),
  }));
}

const STEP_ICON = { say_hello: "hello", continue_lesson: "lesson", next_event: "event" } as const;

// A member's rows: the first is the one to do now.
export function memberThingsFor(steps: MemberNextStep[], actions: HomeTargets): HomeThing[] {
  return steps.map((step, index) => ({
    key: step.kind,
    icon: STEP_ICON[step.kind],
    title: step.title,
    detail: [step.when ? formatMomentWhen(step.when) : "", step.detail].filter(Boolean).join(". "),
    action: step.action,
    strong: index === 0,
    onAction: opener(step.target, actions),
  }));
}

// The tag lines, the same for every role: each opens its message, and the
// last ("and N more") the next one's room. Nothing to decide, so no "Not now":
// opening the room is what clears them.
export function tagThingsFor(tags: HomeTags | null | undefined, onOpenTag?: (channelSlug: string, rootId: string | null) => void): HomeThing[] {
  if (!tags) return [];
  const rows: HomeThing[] = tags.lines.map((line) => ({
    key: line.key, icon: "tag", title: line.title, detail: line.detail, action: "Open",
    onAction: () => onOpenTag?.(line.channelSlug, line.rootId),
  }));
  if (tags.more) {
    const more = tags.more;
    rows.push({ key: "tag:more", icon: "tag", title: more.title, detail: more.detail, action: more.action, onAction: () => onOpenTag?.(more.channelSlug, null) });
  }
  return rows;
}

// How many tags are waiting, the stacked ones included.
export function homeTagsTotal(tags: HomeTags | null | undefined): number {
  return tags ? tags.lines.length + (tags.more?.count ?? 0) : 0;
}

// The way back into the conversation without typing: whenever there is one
// and the guide is on, whatever else needs you. Only once Home is drawn (or
// could not be), as its last line, so nothing moves under it.
export function offersConversation(args: { agentOn: boolean; talking: boolean; hasConversation: boolean; drawn: boolean }): boolean {
  return args.agentOn && !args.talking && args.hasConversation && args.drawn;
}

export function WebCommunityHomeSection(props: WebCommunityHomeSectionProps) {
  const [snapshot, setSnapshot] = useState<CloudCommunityHomeSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  // What was noticed (a host) or what is for them (a member). null: not read yet.
  const [noticed, setNoticed] = useState<OwnerNoticed[] | null>(null);
  const [steps, setSteps] = useState<MemberNextStep[] | null>(null);
  // What the guide drafted and offers to post (a host with a guide).
  const [drafts, setDrafts] = useState<ReplyDraftView[] | null>(null);
  const loadedCommunityIdRef = useRef<string | null>(null);
  const isHost = props.audience === "host";
  const agentOn = props.agentOn !== false;
  const { brief, settled: briefSettled } = usePlaceBriefRead(props.session, props.communityId, null, agentOn);
  // The tags of you not seen yet, live while Home is the page you are on
  // (they come and go with the unread dots).
  const subject = props.session ? resolveAuthSubject(props.session as AuthSessionLike) : null;
  const tagsRead = useLiveQuery<HomeTags>(props.session, "communityAttention:listMyHomeTags",
    subject && props.open !== false ? { authSubject: subject, communityId: props.communityId } : null);
  // Coming back to Home draws the last answer at once, not a blank page.
  const lastTagsRef = useRef<{ communityId: string; tags: HomeTags } | null>(null);
  if (tagsRead.data) lastTagsRef.current = { communityId: props.communityId, tags: tagsRead.data };
  const liveTags = tagsRead.data ?? (lastTagsRef.current?.communityId === props.communityId ? lastTagsRef.current.tags : undefined);
  // While the pointer is over Home the lines hold still; a tag that arrives
  // then is drawn when it leaves, so nothing moves under it. A hold belongs to
  // one opening of Home.
  const [heldTags, setHeldTags] = useState<{ refreshKey: number | undefined; tags: HomeTags } | null>(null);
  const shownTags = heldTags && heldTags.refreshKey === props.refreshKey ? heldTags.tags : liveTags;
  // Tags are extra: if they can't be read, Home shows without them.
  const tagsSettled = liveTags !== undefined || Boolean(tagsRead.error) || !subject;

  useEffect(() => {
    if (props.open === false) return;
    let cancelled = false;
    // A new community starts blank; reopening the same one keeps what is shown
    // until the fresh facts arrive.
    if (loadedCommunityIdRef.current !== props.communityId) {
      loadedCommunityIdRef.current = props.communityId;
      setSnapshot(null);
      setNoticed(null);
      setSteps(null);
      setDrafts(null);
    }
    setFailed(false);
    void (async () => {
      const session = await props.ensureSession(props.session).catch(() => null);
      if (!session || cancelled) { if (!cancelled) setFailed(true); return; }
      // The list is extra: if it can't be read, Home shows without it.
      const list = isHost
        ? fetchOwnerNoticed({ session, communityId: props.communityId }).then((rows) => { if (!cancelled) setNoticed(rows); })
          .catch(() => { if (!cancelled) setNoticed([]); })
        : agentOn
          ? fetchMemberHomeSteps({ session, communityId: props.communityId }).then((rows) => { if (!cancelled) setSteps(rows); })
            .catch(() => { if (!cancelled) setSteps([]); })
          : Promise.resolve().then(() => { if (!cancelled) setSteps([]); });
      // The guide's suggestions are extra too.
      const suggested = isHost && agentOn
        ? fetchReplyDrafts({ session, communityId: props.communityId }).then((rows) => { if (!cancelled) setDrafts(rows); })
          .catch(() => { if (!cancelled) setDrafts([]); })
        : Promise.resolve().then(() => { if (!cancelled) setDrafts([]); });
      try {
        const loaded = await getCloudCommunityHomeSnapshot({ session, communityId: props.communityId, audience: props.audience });
        if (!cancelled) setSnapshot(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
      await Promise.all([list, suggested]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId, props.refreshKey, props.audience, agentOn]);

  const notNow = (key: string) => {
    setNoticed((current) => (current ?? []).filter((entry) => entry.key !== key));
    void (async () => {
      const session = await props.ensureSession(props.session).catch(() => null);
      // If it isn't saved it shows again next time; nothing is lost.
      if (session) await dismissOwnerMoment({ session, communityId: props.communityId, key }).catch(() => undefined);
    })();
  };

  const postDraft = async (id: string, text?: string): Promise<string | null> => {
    try {
      const session = await props.ensureSession(props.session);
      if (!session) return "You're signed out. Sign in and try again.";
      await postReplyDraft({ session, communityId: props.communityId, draftId: id, ...(text !== undefined ? { text } : {}) });
      // Answered: its question is no longer waiting either.
      const posted = (drafts ?? []).filter((draft) => draft.id === id);
      setNoticed((current) => noticedWithoutDrafted(current ?? [], posted));
      setDrafts((current) => (current ?? []).filter((draft) => draft.id !== id));
      return null;
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      if (raw.includes("no_longer_needed")) {
        setDrafts((current) => (current ?? []).filter((draft) => draft.id !== id));
        return null;
      }
      return raw.includes("too_long") ? "That's too long to post. Shorten it and try again." : "That didn't post. Try again.";
    }
  };
  const skipDraft = (id: string) => {
    setDrafts((current) => (current ?? []).filter((draft) => draft.id !== id));
    void (async () => {
      const session = await props.ensureSession(props.session).catch(() => null);
      // If it isn't saved it shows again next time; nothing is lost.
      if (session) await skipReplyDraft({ session, communityId: props.communityId, draftId: id }).catch(() => undefined);
    })();
  };

  if (!props.kit) return null;
  const kit = props.kit;
  const now = props.now ?? new Date();
  const greeting = `${greetingFor(now)}, ${props.firstName}.`;

  // Trust live join-review state (including 0 right after approving the last
  // request) only once live loading has succeeded. While loading or on fetch
  // failure, fall back to the server snapshot count so genuine pending requests
  // are never hidden.
  const hasLoadedJoinReview = isHost && props.joinReview != null && props.joinReview.loaded !== false;
  const joinReview = hasLoadedJoinReview && props.joinReview!.requests.length > 0 ? props.joinReview! : null;
  const joinCount = !isHost ? 0 : hasLoadedJoinReview ? props.joinReview!.requests.length : snapshot?.joinRequestsPending ?? 0;
  const things = isHost
    ? hostThingsFor(noticedWithoutDrafted(noticed ?? [], drafts ?? []), { agentOn, actions: props, onNotNow: notNow })
    : memberThingsFor(steps ?? [], props);
  const tagThings = tagThingsFor(shownTags, (channelSlug, rootId) => {
    setHeldTags(null);
    props.onOpenTag?.(channelSlug, rootId);
  });
  const needs = homeThingsCount({ joinRequests: joinCount, things: things.length + tagThings.length });
  // The page draws as one piece once its parts have answered, so the list is
  // never drawn and then pushed down by the brief (docs/specs/web-architecture
  // -end-state.md: nothing moves after it is drawn).
  const ready = Boolean(snapshot) && briefSettled && tagsSettled && (isHost ? noticed !== null && drafts !== null : steps !== null);

  const panel = snapshot ? (
    <KitHomeRail session={props.session} communityId={props.communityId} snapshot={snapshot}
      presence={props.presence} now={now.getTime()} onOpenEvents={props.onOpenEvents}
      onOpenKnowledge={props.onOpenKnowledge} />
  ) : !failed ? (
    <PanelBlockSkeleton label={null} rows={2} compact />
  ) : null;
  const rail = panel ? (
    <KitApp view="home" host={isHost} part="rail">
      <Rail index={0} label="The community today">{panel}</Rail>
    </KitApp>
  ) : null;
  const age = brief ? briefAge(brief.updated_at, now.getTime()) : "";
  return (
    <>
      <HomeBody
        onPointerEnter={() => { if (liveTags) setHeldTags({ refreshKey: props.refreshKey, tags: liveTags }); }}
        onPointerLeave={() => setHeldTags(null)}>
        <Eyebrow community={props.communityName} time={homeClockFor(now)} plain={!agentOn} />
        <Hello greeting={greeting} line={!ready ? (failed ? "" : " ") : brief ? "" : homeSentenceFor(snapshot!, props.audience, needs, homeTagsTotal(shownTags))} />
        {!ready && !failed ? <PanelBlockSkeleton label="Loading home…" rows={2} compact /> : null}
        {ready && brief ? (
          <div className={cx("hbrief")}>
            <p>{brief.summary}</p>
            {age || brief.channels.length ? (
              <span>
                {age ? <em>Written {age}</em> : null}
                {brief.channels.map((channel) => (
                  <button key={channel.slug} type="button" title={`Open #${channel.name}`} onClick={() => props.onOpenChannelByName(channel.name)}>#{channel.name}</button>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
        {ready && brief && isHost && needs === 0 ? <p className={cx("hnone")}>Nothing needs you today.</p> : null}
        {ready ? (
          <NeedsYou label={isHost ? "Needs you" : "For you"} join={joinReview} joinCount={joinCount}
            onShowAllJoinRequests={props.onOpenJoinRequests} things={things} tags={tagThings} />
        ) : null}
        {ready && isHost ? <GuideSuggests drafts={drafts ?? []} onPost={postDraft} onSkip={skipDraft} /> : null}
        {ready && isHost && !agentOn && things.length > 0 && props.onTurnOnAgent ? (
          <TextLink style={{ marginTop: 14 }} onClick={props.onTurnOnAgent}>Turn on your guide</TextLink>
        ) : null}
        {offersConversation({ agentOn, talking: kit.talking, hasConversation: Boolean(kit.hasConversation), drawn: ready || failed }) ? (
          <TextLink style={{ marginTop: 20 }} onClick={kit.onTalkItOver}>Continue your conversation</TextLink>
        ) : null}
        {kit.talk}
      </HomeBody>
      {props.asideContainer && rail ? createPortal(rail, props.asideContainer) : null}
    </>
  );
}
