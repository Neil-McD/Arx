// Design lab only (/design-lab?page=demo): the website's product demo. It is
// the app itself, drawn by the app's own components (the left column, the
// channel page, the composer) inside the app's own frame, fed a made-up
// community and a short script instead of a server. Nothing here is a
// picture, so it looks like the product because it is the product.
//
// What it sells is one idea, compounding intelligence: every conversation
// teaches it, so every answer after is better. Four scenes, one loop:
//   Asks       a member asks something it doesn't know; it says so, and brings in the member who does.
//   Learns     that answer becomes something the community knows (the map grows a point).
//   Compounds  the next person asks the same thing, and now it answers by itself.
//   Pays off   that person gets a result, and how they did it is learned too.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Hash, Search } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { CommunityNav } from "../../../../shared/CommunityNav";
import type { BrainAttach, BrainMap } from "../../../../shared/communityBrain";
import { CommunityComposerControls } from "../components/CommunityComposerControls";
import { CommunityPageFrame } from "../components/CommunityPageHeader";
import { WebAccountMenu } from "../components/WebAccountMenu";
import { WebCommunityInteractionProjection } from "../components/WebCommunityInteractionProjection";
import { WebCommunitySwitcher } from "../components/WebCommunitySwitcher";
import { base, finish, pt } from "./brainExamples";
import { KitBrainPageFrame, KitBrainPageView } from "./KitBrainPage";

// The window the app is drawn at; the frame scales it to the space it has.
const APP_WIDTH = 1440;
const APP_HEIGHT = 810;
// On a phone the demo is the app's own phone layout, at a phone's size.
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 480;
const PHONE_BELOW = 640;

const COMMUNITY = { id: "demo", slug: "launch-lab", name: "Launch Lab", avatar_url: null, banner_url: null } as const;
const HOST = "ana";
const PEOPLE: Record<string, { name: string; colour: string }> = {
  ana: { name: "Ana Reyes", colour: "#7A6FF0" },
  dana: { name: "Dana Ruiz", colour: "#3D8FD6" },
  sam: { name: "Sam Whitlock", colour: "#3DAE8C" },
  priya: { name: "Priya Raman", colour: "#C58B3A" },
  mira: { name: "Mira Okafor", colour: "#E0788C" },
};
const CHANNELS = [
  { id: "c-general", slug: "general", name: "General", is_general: true, position: 0 },
  { id: "c-wins", slug: "wins", name: "Wins", is_general: false, position: 1 },
  { id: "c-pricing", slug: "pricing", name: "Pricing", is_general: false, position: 2 },
];

type Line = { id: string; who: string; minutesAgo: number; text: string; extra?: Record<string, unknown> };

function root(line: Line, now: number) {
  const at = new Date(now - line.minutesAgo * 60_000).toISOString();
  const guide = line.who === "guide";
  return {
    deduped: false,
    root: {
      id: line.id, kind: "discussion", title: null, content_summary: line.text, created_at: at, edited_at: null,
      actor_type: guide ? "community_agent" : "human",
      actor_user_id: guide ? null : line.who, actor_agent_key: guide ? "community_agent" : null,
      reply_count: 0, last_reply_at: null, last_reply_actor_user_id: null,
      reaction_summary: [], viewer_emojis: [], idempotency_key: line.id,
      ...line.extra,
    },
    content_blocks: [{ kind: "text", position: 0, text: line.text }],
    embeds: [], mentions: [], attachments: [],
  };
}

// The closing fade before the next scene.
const FADE_SECONDS = 1;

// How fast the script runs: its seconds are written at a reading pace, and
// played quicker, so a scene takes about six seconds and the whole loop half a minute.
const PACE = 2.2;

const noop = () => {};
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// New messages and the typing line ease in; the feed fades before a scene
// starts over, so nothing vanishes in one frame.
const DEMO_CSS = `
.site-demo .kit-channel-feed-part [class*="_msg_"]{animation:site-demo-in .42s cubic-bezier(.2,.7,.2,1) both}
.site-demo .community-interaction-typing{animation:site-demo-in .3s ease both}
/* Learning, made visible: the newest point grows in with one ring, and its branch draws itself. */
.site-demo g[data-point^="note:new"]{transform-box:fill-box;transform-origin:center;animation:site-demo-grow .9s cubic-bezier(.2,.9,.2,1) both}
.site-demo g[data-point^="note:new"] circle:first-of-type{transform-box:fill-box;transform-origin:center;animation:site-demo-ring 1.6s ease-out .2s both}
.site-demo path[data-point^="note:new"]{stroke-dasharray:600;animation:site-demo-draw .8s ease-out both}
@keyframes site-demo-grow{0%{opacity:0;transform:scale(.1)}60%{opacity:1;transform:scale(1.5)}100%{opacity:1;transform:scale(1)}}
@keyframes site-demo-ring{0%{transform:scale(.4);opacity:1}100%{transform:scale(3.2);opacity:.35}}
@keyframes site-demo-draw{from{stroke-dashoffset:600}to{stroke-dashoffset:0}}
.site-demo-known{display:flex;justify-content:center;align-items:baseline;gap:8px;margin-top:20px;font-size:15px;color:rgba(243,244,246,.6)}
.site-demo-known b{display:inline-block;min-width:1.4em;text-align:center;font-size:22px;font-weight:600;color:#f3f4f6;font-variant-numeric:tabular-nums;animation:site-demo-tick .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes site-demo-tick{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
/* The app is scaled as a picture is: phones must not resize its text on their own. */
.site-demo{-webkit-text-size-adjust:100%;text-size-adjust:100%}
.site-demo-window{width:min(1180px,100%);margin:0 auto;border-radius:14px;border:1px solid rgba(255,255,255,.14);overflow:hidden;box-shadow:0 60px 140px -50px rgba(111,120,216,.35),0 40px 90px -40px #000}
.site-demo .site-demo-page{transition:opacity .4s ease}
.site-demo.is-ending .site-demo-page{opacity:0}
@media (max-width:639px){.site-demo-window{width:min(390px,100%);border-radius:22px}}
.site-demo-dots{display:flex;justify-content:center;gap:8px;margin-top:14px;flex-wrap:wrap}
.site-demo-dots button{position:relative;overflow:hidden;height:34px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(243,244,246,.6);font:inherit;font-size:14px;cursor:pointer}
.site-demo-dots button.on{color:#f3f4f6;border-color:rgba(255,255,255,.22)}
.site-demo-dots button i{position:absolute;inset:0 auto 0 0;background:rgba(111,120,216,.28);pointer-events:none}
.site-demo-dots button span{position:relative}
.site-demo-say{margin:16px auto 0;max-width:56ch;min-height:48px;text-align:center;font-size:16px;line-height:1.5;color:rgba(243,244,246,.68)}
@keyframes site-demo-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.site-demo *{animation:none!important;transition:none!important}}
`;

// The app's phone frame: its top bar and the page, with no left column.
function PhoneFrame(props: { ending?: boolean; where: Left; children: ReactNode }) {
  const channel = CHANNELS.find((candidate) => candidate.slug === props.where.channelSlug)?.name;
  // Home names itself on its own page; the bar only carries the way back.
  const label = props.where.tab === "agent" ? "" : props.where.tab === "resources" ? "Knowledge" : channel ?? "";
  return (
    <div className={`site-demo${props.ending ? " is-ending" : ""}`} style={{ height: PHONE_HEIGHT }}>
      <style>{DEMO_CSS}</style>
      <div className="app-root mobile-shell mobile-chrome-auto-hide" style={{ height: PHONE_HEIGHT }}>
        <header className="mobile-topbar">
          <div className="mobile-topbar-left"><button type="button" className="mobile-topbar-icon mobile-topbar-back" aria-label="Back"><ArrowLeft size={20} aria-hidden="true" /></button></div>
          <div className="mobile-topbar-center">
            <span className="mobile-topbar-context-label mobile-topbar-channel-label">
              {props.where.tab === "chat" ? <Hash size={16} aria-hidden="true" /> : null}
              <span>{label}</span>
            </span>
          </div>
          <div className="mobile-topbar-right" />
        </header>
        <div className="app-shell no-left no-right" style={{ height: PHONE_HEIGHT }}>
          <div className="web-main-surface-slot site-demo-page" style={{ display: "contents" }}>{props.children}</div>
        </div>
      </div>
    </div>
  );
}

function AppFrame(props: { ending?: boolean; left: ReactNode; children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setZoom(Math.min(1, box.clientWidth / APP_WIDTH));
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(box);
    return () => watcher.disconnect();
  }, []);
  return (
    <div ref={boxRef} className={`site-demo${props.ending ? " is-ending" : ""}`} style={{ height: APP_HEIGHT * zoom, overflow: "hidden" }}>
      <style>{DEMO_CSS}</style>
      <div className="app-root" style={{ width: APP_WIDTH, height: APP_HEIGHT, transform: `scale(${zoom})`, transformOrigin: "0 0", ["--right-column-width" as string]: `${Math.round(APP_WIDTH * 0.23)}px` }}>
        <div className="app-shell framed-shell community-layout sessions-compact no-right" style={{ height: APP_HEIGHT }}>
          <div className="product-shell-surface product-shell-surface--community" style={{ height: APP_HEIGHT }}>
            {props.left}
            {/* In the app the page's slot has no box of its own, so the page fills the frame. */}
            <div className="web-main-surface-slot site-demo-page" style={{ display: "contents" }}>{props.children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Left = { tab: "chat" | "agent" | "resources"; channelSlug?: string; viewer?: string; inPod?: boolean };

// `viewer`: whose app it is. The host's by default; a member's has no
// Analytics, no adding channels, and their own name at the foot.
function LeftColumn(props: Left) {
  const viewer = props.viewer ?? HOST;
  const hosting = viewer === HOST;
  return (
    <CommunityNav
      {...({
        activeCommunity: COMMUNITY,
        communityTab: props.tab,
        activeSelectionMode: props.inPod ? "none" : "route",
        channels: CHANNELS,
        selectedChannelSlug: props.channelSlug ?? null,
        canViewMembersActiveCommunity: true,
        canViewActiveCommunitySettings: hosting,
        canManageMembersActiveCommunity: hosting,
        canViewActiveCommunityAnalytics: hosting,
        onSelectTab: noop,
        onSelectChannel: noop,
        onCreateChannel: hosting ? async () => true : undefined,
        onCopyCommunityJoinLink: noop,
        layout: "v1",
        identityIsCover: true,
        onOpenInbox: noop,
        onOpenMembers: noop,
        onOpenPods: noop,
        podsActive: props.inPod === true,
        memberCount: 48,
        toolsSlot: (
          <button type="button" className="community-search-ask" title="Search or ask your guide (⌘K)">
            <Search size={14} aria-hidden="true" />
            <span>Search or ask</span>
            <kbd>⌘K</kbd>
          </button>
        ),
        accountSlot: (
          <WebAccountMenu name={PEOPLE[viewer]!.name} avatarUrl={null} roleLabel={hosting ? "Host" : "Member"} appTheme="dark" onSetAppTheme={noop} onOpenSettings={noop} onSignOut={async () => {}} />
        ),
        identitySlot: (
          <WebCommunitySwitcher
            activeCommunityName={COMMUNITY.name}
            mark={<CommunityAvatar communityId={COMMUNITY.id} className="community-switcher-mark-avatar" imageUrl={null} name={COMMUNITY.name} />}
            communities={[COMMUNITY as any]}
            selectedCommunitySlug={COMMUNITY.slug}
            attentionById={{}}
            onSelectCommunity={noop}
            onOpenDiscover={noop}
            onCreateCommunity={noop}
            cover={{ bannerUrl: null }}
          />
        ),
      } as any)}
    />
  );
}

function Composer(props: { placeholder: string; reply?: boolean }) {
  return (
    <div className={`chat-input-bar${props.reply ? " community-interaction-reply-input-bar" : ""}`}>
      <div className="community-composer-authoring-row">
        <div className="community-composer-editor-row">
          <div className="mention-composer-field">
            <textarea className="chat-input" aria-label={props.placeholder} placeholder={props.placeholder} rows={1} readOnly value="" />
          </div>
        </div>
        <CommunityComposerControls
          contextKey="demo"
          groupLabel="Message tools"
          attachLabel="Add files"
          toolsDisabled={false}
          attachDisabled={false}
          onAttach={noop}
          onEmoji={noop}
          voiceControl={null}
          sendControl={(
            <button className="chat-send ask-send-btn ask-send-btn-v2" type="button" aria-label="Send" title="Send" disabled>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" /></svg>
            </button>
          )}
        />
      </div>
    </div>
  );
}

// What a channel page needs besides its messages.
function channelProps(channel: { id: string; slug: string; name: string }, viewer: string = HOST) {
  return {
    activeCommunityName: COMMUNITY.name,
    activeChannel: { ...channel, is_general: channel.slug === "general" },
    communityId: COMMUNITY.id,
    communityOwnerId: HOST,
    currentUserId: viewer,
    activityEvents: [],
    isLoadingRoots: false,
    isLoadingReplies: false,
    error: null,
    repliesError: null,
    rootChangeReason: "newer",
    onSelectRoot: noop,
    onCloseDrawer: noop,
    onRetryRoots: noop,
    onRetryReplies: noop,
    profilesByUserId: Object.fromEntries(Object.entries(PEOPLE).map(([id, person]) => [id, { user_id: id, display_name: person.name, avatar_url: null }])),
    displayName: (id: string) => PEOPLE[id]?.name ?? id,
    getAvatarColor: (id: string) => PEOPLE[id]?.colour ?? "#555",
    getInitials: (name: string) => name.split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase(),
    formatChatTime: formatTime,
    renderTextWithLinks: (text: string) => text,
  };
}

function ChannelPage(props: { children: ReactNode }) {
  return (
    <main className="workspace community-mode">
      <div className="community-body">
        <div className="community-chat community-member-chat community-attachment-drop-surface">
          <div className="workspace-body chat-feed">
            <div className="community-interaction-scroll">{props.children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

// The typing line shows a first name; the guide's name is the community's, kept whole.
function typingFor(spans: Array<{ from: number; to: number; who: string; rootId?: string }>, at: number, now: number) {
  const span = spans.find((candidate) => at >= candidate.from && at < candidate.to);
  if (!span) return { users: [], total_count: 0 };
  const name = span.who === "guide" ? COMMUNITY.name.replace(/ /g, "\u00a0") : PEOPLE[span.who]!.name;
  return { users: [{ user_id: span.who, display_name: name, avatar_url: null, root_id: span.rootId ?? null, display_until_ms: now + 60_000 }], total_count: 1 };
}

type SceneProps = { at: number; now: number };
const WEEK = 7 * 24 * 60;

function Channel(props: { channel: (typeof CHANNELS)[number]; lines: Line[]; typing: ReturnType<typeof typingFor>; now: number }) {
  return (
    <ChannelPage>
      <WebCommunityInteractionProjection
        {...({ ...channelProps(props.channel), roots: props.lines.map((line) => root(line, props.now)), selectedRootId: null, replies: [], typingPresence: props.typing,
          mainComposer: <Composer placeholder={`Message #${props.channel.slug}`} /> } as any)}
      />
    </ChannelPage>
  );
}
const react = (line: Line, emoji: string, count: number): Line => (count > 0 ? { ...line, extra: { ...line.extra, reaction_summary: [{ emoji, count }] } } : line);

// The exchange it learns from: asked once, answered by the member who knew.
const QUESTION = "How do I find my first ten subscribers? I'm starting with no audience.";
const DONT_KNOW = "I don't know that one yet, Mira. Dana did exactly this in March. Dana, can you help?";
const DANA_KNOWS = "Start with direct messages to people you already know. I sent fifteen and got six yeses. Don't post, ask.";

// 1. Asks: #general. It doesn't know, says so, and brings in the member who does.
const ASKS_BEFORE: Line[] = [
  { id: "g1", who: "priya", minutesAgo: 200, text: "Friday's call is a hot seat on one-page offers. Bring a draft.", extra: { reaction_summary: [{ emoji: "👍", count: 5 }] } },
];
const ASKS: Array<Line & { at: number }> = [
  { id: "a1", at: 1.4, who: "mira", minutesAgo: 0, text: QUESTION, extra: { kind: "question" } },
  { id: "a2", at: 4.8, who: "guide", minutesAgo: 0, text: DONT_KNOW },
  { id: "a3", at: 8.8, who: "dana", minutesAgo: 0, text: DANA_KNOWS },
];
const ASKS_TYPING = [{ from: 2.6, to: 4.8, who: "guide" }, { from: 6.0, to: 8.8, who: "dana" }];
const ASKS_SECONDS = 13;

function AsksScene({ at, now }: SceneProps) {
  const lines = [...ASKS_BEFORE, ...ASKS.filter((line) => at >= line.at)].map((line) => (line.id === "a3" ? react(line, "🙏", at >= 10.4 ? (at >= 11.4 ? 3 : 1) : 0) : line));
  return <Channel channel={CHANNELS[0]!} lines={lines} typing={typingFor(ASKS_TYPING, at, now)} now={now} />;
}

// What Launch Lab knows. `learned`: how many new things it has picked up
// while you watch (Dana's answer, then how Sam used it).
function launchLabMap(now: number, learned: number): BrainMap {
  const map = base(COMMUNITY.name);
  map.courses = [{ id: "course:offer", name: "Launch your first paid offer", order: 0, lessons: [
    { id: "resource:readers", title: "Your first ten readers", order: 1, done: true, use: 7 },
    { id: "resource:problem", title: "Pick one problem", order: 2, done: true, use: 3 },
    { id: "resource:pricing", title: "Pricing your first offer", order: 3, done: true, use: 9 },
    { id: "resource:page", title: "The one-page offer", order: 4, done: false, use: 4 },
    { id: "resource:waitlist", title: "Fill a waitlist", order: 5, done: false, use: 2 },
  ] }];
  const lesson = (id: string): BrainAttach => ({ kind: "lesson", id: `resource:${id}` });
  const subject = (name: string): BrainAttach => ({ kind: "subject", name });
  map.points = [
    pt("issue", "Write the first issue before you announce", lesson("readers"), 34, now, { use: 2 }),
    pt("ask", "Ask each reader one question", lesson("readers"), 20, now, { use: 1 }),
    pt("narrow", "Narrow beats broad for a first offer", lesson("problem"), 30, now, { use: 3 }),
    pt("five", "Charge what five people would pay this week", lesson("pricing"), 28, now, { use: 6 }),
    pt("raise", "Raise the price after the first cohort", lesson("pricing"), 9, now, { use: 2 }),
    pt("page", "One page: the result, who it's for, one link", lesson("page"), 18, now, { use: 5 }),
    pt("wait", "A waitlist page filled Dana's second cohort", lesson("waitlist"), 12, now, { use: 3 }),
    pt("calls", "How the Friday call runs", subject("Friday calls"), 40, now, { use: 2 }),
    pt("hot", "Bring one page for a hot seat", subject("Friday calls"), 12, now),
    pt("stripe", "Connecting payouts takes a day", subject("Getting paid"), 15, now, { use: 1 }),
    pt("refund", "Offer a refund in week one", subject("Getting paid"), 10, now, { use: 1 }),
    ...(learned >= 1 ? [pt("new1", "Start with direct messages to people you know", lesson("readers"), 0, now, { use: 9 })] : []),
    ...(learned >= 2 ? [pt("new2", "Twenty messages got Sam eight subscribers", lesson("readers"), 0, now, { use: 8 })] : []),
  ];
  map.arcs = [{ a: "note:five", b: "note:raise", count: 3 }, { a: "note:page", b: "note:wait", count: 2 }, ...(learned >= 2 ? [{ a: "note:new1", b: "note:new2", count: 2 }] : [])];
  return finish(map, now);
}
const KNOWN_AT_START = 11;

// 2. Learns: the community brain. Dana's answer grows in as a new point.
const LEARNED_AT = 2.2;
const LEARNS_SECONDS = 9.5;

function LearnsScene({ at, now }: SceneProps) {
  const before = useMemo(() => launchLabMap(now, 0), [now]);
  const after = useMemo(() => launchLabMap(now, 1), [now]);
  return (
    <main className="workspace community-mode">
      {/* On a phone the map is given the page's height, so it fills the screen under the bar. */}
      <div className="community-body" style={document.documentElement.dataset.layout === "phone" ? { height: PHONE_HEIGHT - 54, display: "grid" } : undefined}>
        <CommunityPageFrame>
          <KitBrainPageFrame canManage fill>
            <KitBrainPageView session={null} communityId="demo" canManage onOpenCourse={noop} map={at >= LEARNED_AT ? after : before} />
          </KitBrainPageFrame>
        </CommunityPageFrame>
      </div>
    </main>
  );
}

// 3. Compounds: #general, a week later. The same question, and now it answers by itself.
const COMPOUNDS_BEFORE: Line[] = [
  { id: "c1", who: "mira", minutesAgo: WEEK, text: QUESTION, extra: { kind: "question" } },
  { id: "c2", who: "guide", minutesAgo: WEEK - 1, text: DONT_KNOW },
  { id: "c3", who: "dana", minutesAgo: WEEK - 2, text: DANA_KNOWS, extra: { reaction_summary: [{ emoji: "🙏", count: 3 }] } },
];
const COMPOUNDS: Array<Line & { at: number }> = [
  { id: "c4", at: 1.4, who: "sam", minutesAgo: 0, text: "Any advice on getting my first few subscribers? Starting from zero here.", extra: { kind: "question" } },
  { id: "c5", at: 3.4, who: "guide", minutesAgo: 0, text: "Start with direct messages to people you already know, and ask, don't post. Dana sent fifteen and got six yeses that way.\n\nLearned from Dana, last week." },
  { id: "c6", at: 7.4, who: "sam", minutesAgo: 0, text: "Doing that tonight." },
];
const COMPOUNDS_TYPING = [{ from: 2.2, to: 3.4, who: "guide" }, { from: 5.8, to: 7.4, who: "sam" }];
const COMPOUNDS_SECONDS = 11;

function CompoundsScene({ at, now }: SceneProps) {
  const lines = [...COMPOUNDS_BEFORE, ...COMPOUNDS.filter((line) => at >= line.at)].map((line) => (line.id === "c5" ? react(line, "🔥", at >= 8.6 ? 2 : 0) : line));
  return <Channel channel={CHANNELS[0]!} lines={lines} typing={typingFor(COMPOUNDS_TYPING, at, now)} now={now} />;
}

// 4. Pays off: #wins. The result, and how he got it is learned too.
const WINS_BEFORE: Line[] = [
  { id: "w1", who: "dana", minutesAgo: 400, text: "Cohort two wrapped: eleven of twelve finished. Opening cohort three next month.", extra: { reaction_summary: [{ emoji: "👏", count: 8 }] } },
];
const WINS: Array<Line & { at: number }> = [
  { id: "w2", at: 1.2, who: "sam", minutesAgo: 0, text: "Eight subscribers from twenty messages. My first $240. Thanks, Dana." },
  { id: "w3", at: 5.0, who: "dana", minutesAgo: 0, text: "Told you. Ask, don't post." },
  { id: "w4", at: 7.4, who: "guide", minutesAgo: 0, text: "Saved how Sam did it: twenty messages, eight subscribers. The next person who asks gets both." },
];
const WINS_TYPING = [{ from: 3.4, to: 5.0, who: "dana" }, { from: 5.8, to: 7.4, who: "guide" }];
const CHEERS = [1.9, 2.4, 2.9, 3.4, 4.2, 5.4, 6.2];
const SAVED_AT = 7.4;
const WINS_SECONDS = 11;

function PaysOffScene({ at, now }: SceneProps) {
  const lines = [...WINS_BEFORE, ...WINS.filter((line) => at >= line.at)].map((line) => (line.id === "w2" ? react(line, "🎉", CHEERS.filter((moment) => at >= moment).length) : line));
  return <Channel channel={CHANNELS[1]!} lines={lines} typing={typingFor(WINS_TYPING, at, now)} now={now} />;
}

const SCENES: Array<{ key: string; label: string; seconds: number; say: string; left: (at: number) => Left; Scene: (props: SceneProps) => ReactNode }> = [
  { key: "asks", label: "Asks", seconds: ASKS_SECONDS, left: () => ({ tab: "chat", channelSlug: "general" }), say: "Mira asks something it doesn't know yet. It says so, and brings in the member who does.", Scene: AsksScene },
  { key: "learns", label: "Learns", seconds: LEARNS_SECONDS, left: () => ({ tab: "resources" }), say: "Dana's answer becomes something the whole community knows.", Scene: LearnsScene },
  { key: "compounds", label: "Compounds", seconds: COMPOUNDS_SECONDS, left: () => ({ tab: "chat", channelSlug: "general" }), say: "A week later Sam asks the same thing. This time it answers by itself, straight away.", Scene: CompoundsScene },
  { key: "pays", label: "Pays off", seconds: WINS_SECONDS, left: () => ({ tab: "chat", channelSlug: "wins" }), say: "Sam gets his first subscribers, and how he did it is learned too. Every conversation makes the next answer better.", Scene: PaysOffScene },
];

// How many things the community knows at a moment in the loop.
function knownAt(index: number, at: number): number {
  const learned = index > 1 || (index === 1 && at >= LEARNED_AT) ? 1 : 0;
  const saved = index === 3 && at >= SAVED_AT ? 1 : 0;
  return KNOWN_AT_START + learned + saved;
}

// The demo: one scene at a time, moving on by itself. A dot picks a scene;
// resting the pointer on the app holds it. People who have asked for less
// motion get each scene's last moment, and move between them with the dots.
export function SiteDemo() {
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [index, setIndex] = useState(0);
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  const scene = SCENES[index]!;
  const moment = still ? scene.seconds - FADE_SECONDS - 0.1 : at;
  const known = knownAt(index, moment);
  useEffect(() => {
    if (still || held) return;
    const timer = window.setInterval(() => setAt((current) => current + 0.1 * PACE), 100);
    return () => window.clearInterval(timer);
  }, [still, held]);
  useEffect(() => {
    if (at < scene.seconds) return;
    setAt(0);
    setIndex((current) => (current + 1) % SCENES.length);
  }, [at, scene.seconds]);
  return (
    <div>
      <div className="site-demo-window" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}>
        <DemoWindow index={index} at={moment} ending={!still && at >= scene.seconds - FADE_SECONDS} />
      </div>
      <style>{DEMO_CSS}</style>
      <div className="site-demo-dots" role="tablist" aria-label="What your client success manager does">
        {SCENES.map((item, position) => (
          <button key={item.key} type="button" role="tab" aria-selected={position === index} className={position === index ? "on" : undefined}
            onClick={() => { setIndex(position); setAt(0); }}>
            {position === index && !still ? <i style={{ width: `${Math.min(100, (at / item.seconds) * 100)}%` }} /> : null}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <p className="site-demo-say">{scene.say}</p>
      <p className="site-demo-known" aria-live="off">{COMMUNITY.name} knows <b key={known}>{known}</b> things</p>
    </div>
  );
}

// The app is drawn in a window of its own (a frame at the size of a laptop
// screen), then scaled to the space the page gives it. Its own window is what
// makes it the real app at any size: the app lays itself out by the width of
// the window it is in, so drawn straight into a phone's page it would take
// its phone-width rules while being drawn at desktop size.
type StageState = { index: number; at: number; ending: boolean };
const STAGE_MESSAGE = "polynet-site-demo";

function DemoWindow(props: StageState) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // Unknown until measured, so the frame is opened once, at the right size.
  const [space, setSpace] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setSpace(box.clientWidth);
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(box);
    return () => watcher.disconnect();
  }, []);
  const phone = space !== null && space < PHONE_BELOW;
  const width = phone ? PHONE_WIDTH : APP_WIDTH;
  const height = phone ? PHONE_HEIGHT : APP_HEIGHT;
  const zoom = space === null ? 1 : Math.min(1, space / width);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === frameRef.current?.contentWindow && event.data?.type === `${STAGE_MESSAGE}:ready`) setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  // A different frame (phone or laptop) has to say it is ready again.
  useEffect(() => { setReady(false); }, [phone]);
  useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage({ type: STAGE_MESSAGE, index: props.index, at: props.at, ending: props.ending }, window.location.origin);
  }, [ready, props.index, props.at, props.ending]);
  return (
    <div ref={boxRef} style={{ height: height * zoom, overflow: "hidden", background: "#0b0c0e" }}>
      {space === null ? null : (
        <iframe key={phone ? "phone" : "laptop"} ref={frameRef} src={`/design-lab?page=demo-frame${phone ? "&layout=phone" : ""}`} title="Polynet, playing" tabIndex={-1} aria-hidden="true"
          style={{ display: "block", width, height, border: 0, transform: `scale(${zoom})`, transformOrigin: "0 0", pointerEvents: "none" }} />
      )}
    </div>
  );
}

// What the frame shows: the scene and moment the page outside tells it.
export function SiteDemoStage() {
  const [state, setState] = useState<StageState>({ index: 0, at: 0, ending: false });
  const [now] = useState(Date.now);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== STAGE_MESSAGE) return;
      setState({ index: Number(event.data.index) || 0, at: Number(event.data.at) || 0, ending: Boolean(event.data.ending) });
    };
    window.addEventListener("message", onMessage);
    window.parent?.postMessage({ type: `${STAGE_MESSAGE}:ready` }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  // The app takes its phone layout from the page's root, as it does for real.
  const phone = new URLSearchParams(window.location.search).get("layout") === "phone";
  const [laidOut, setLaidOut] = useState(!phone);
  useLayoutEffect(() => {
    if (!phone) return;
    document.documentElement.dataset.layout = "phone";
    setLaidOut(true);
  }, [phone]);
  const scene = SCENES[state.index] ?? SCENES[0]!;
  const Scene = scene.Scene;
  if (!laidOut) return null;
  if (phone) {
    return (
      <PhoneFrame ending={state.ending} where={scene.left(state.at)}>
        <Scene key={scene.key} at={state.at} now={now} />
      </PhoneFrame>
    );
  }
  return (
    <AppFrame ending={state.ending} left={<LeftColumn {...scene.left(state.at)} />}>
      <Scene key={scene.key} at={state.at} now={now} />
    </AppFrame>
  );
}

// The lab page: the demo on its own, in the site's frame, to judge it
// against the real app.
export function SiteDemoLab() {
  return (
    <div style={{ height: "100dvh", overflowY: "auto", background: "#07080a", padding: "48px 24px", fontFamily: 'var(--font-sans, "Geist Variable", "Geist", system-ui, sans-serif)' }}>
      <SiteDemo />
    </div>
  );
}
