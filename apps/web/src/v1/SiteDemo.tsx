// Design lab only (/design-lab?page=demo): the website's product demo. It is
// the app itself, drawn by the app's own components (the left column, the
// channel page, the composer) inside the app's own frame, fed a made-up
// community and a short script instead of a server. Nothing here is a
// picture, so it looks like the product because it is the product.
//
// The scenes, in one made-up community:
//   Welcomes and answers   someone new asks; the guide greets, answers from a lesson, and introduces them.
//   Remembers   that answer becomes something the community knows.
//   Briefs you  the host opens Home to what was handled and who needs them.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { CommunityNav } from "../../../../shared/CommunityNav";
import type { BrainAttach, BrainMap } from "../../../../shared/communityBrain";
import { CommunityComposerControls } from "../components/CommunityComposerControls";
import { CommunityPageFrame } from "../components/CommunityPageHeader";
// Home's page frame is styled by the dock's own stylesheet.
import "../components/WebCommunityAgentDock.css";
import { WebAccountMenu } from "../components/WebAccountMenu";
import { WebCommunityInteractionProjection } from "../components/WebCommunityInteractionProjection";
import { WebCommunitySwitcher } from "../components/WebCommunitySwitcher";
import { base, finish, pt } from "./brainExamples";
import { Ask, Btn, Card, Chips, Dock, Eyebrow, Hello, HomeBody, KitApp, Mine, Rail, Scroll, Since, SinceItem, Talk, Theirs, Top, View, cx } from "./kit";
import { PanelBrain } from "./KitBrain";
import { KitBrainPageFrame, KitBrainPageView } from "./KitBrainPage";
import { BriefPart } from "./KitBrief";
import { PanelLine, PanelPart } from "./KitPanel";

// The window the app is drawn at; the frame scales it to the space it has.
const APP_WIDTH = 1440;
const APP_HEIGHT = 810;

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

// What was already in #general, then what happens while you watch. `at` is
// seconds into the scene; `wave` is when the hellos land on Mira's post.
const BEFORE: Line[] = [
  { id: "b1", who: "dana", minutesAgo: 190, text: "Cohort two is full: twelve seats at $400. The waitlist page from lesson 5 did most of the work.", extra: { reaction_summary: [{ emoji: "🎉", count: 6 }] } },
  { id: "b2", who: "sam", minutesAgo: 95, text: "First sales call booked off the new landing page. Nervous, but booked." },
];
// The pace of a real channel: a beat of quiet, a post, people reacting one at
// a time, someone typing for as long as their message takes, then the next.
const SCENE: Array<Line & { at: number }> = [
  { id: "s1", at: 1.6, who: "mira", minutesAgo: 0, text: "Hi all, I'm Mira. I'm launching a paid newsletter for indie designers, with no audience yet. What should I charge for the first cohort?", extra: { kind: "question" } },
  { id: "s2", at: 6.4, who: "guide", minutesAgo: 0, text: "Welcome, Mira. Ana's rule from lesson 3, “Pricing your first offer”: charge what five people would pay this week, not what it's worth. First cohorts here have landed between $200 and $500. Say hello to Dana, too: she launched her newsletter here in March with no list." },
  { id: "s3", at: 11.2, who: "dana", minutesAgo: 0, text: "Happy to help! Mine was $400 with twelve seats. Send me your draft page, Mira." },
];
const TYPING = [{ from: 3.2, to: 6.4, who: "guide" }, { from: 8.0, to: 11.2, who: "dana" }];
// Hellos on Mira's post, one at a time; then her thanks on Dana's reply.
const WAVES = [2.9, 4.1, 7.3, 9.4];
const THANKS_AT = 12.8;
// The scene, a hold on its last moment, then a short fade before it starts over.
const SCENE_SECONDS = 14.5;
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
.site-demo [class*="_card_"],.site-demo [class*="_since_"]>*{animation:site-demo-in .5s cubic-bezier(.2,.7,.2,1) both}
/* The app is scaled as a picture is: phones must not resize its text on their own. */
.site-demo{-webkit-text-size-adjust:100%;text-size-adjust:100%}
.site-demo-window{width:min(1180px,100%);margin:0 auto;border-radius:14px;border:1px solid rgba(255,255,255,.14);overflow:hidden;box-shadow:0 60px 140px -50px rgba(111,120,216,.35),0 40px 90px -40px #000}
.site-demo .site-demo-page{transition:opacity .4s ease}
.site-demo.is-ending .site-demo-page{opacity:0}
.site-demo-dots{display:flex;justify-content:center;gap:8px;margin-top:22px;flex-wrap:wrap}
.site-demo-dots button{position:relative;overflow:hidden;height:34px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(243,244,246,.6);font:inherit;font-size:14px;cursor:pointer}
.site-demo-dots button.on{color:#f3f4f6;border-color:rgba(255,255,255,.22)}
.site-demo-dots button i{position:absolute;inset:0 auto 0 0;background:rgba(111,120,216,.28);pointer-events:none}
.site-demo-dots button span{position:relative}
.site-demo-say{margin:16px auto 0;max-width:56ch;min-height:48px;text-align:center;font-size:16px;line-height:1.5;color:rgba(243,244,246,.68)}
@keyframes site-demo-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.site-demo *{animation:none!important;transition:none!important}}
`;

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

// 1. Welcomes: #general.
function WelcomesScene({ at, now }: SceneProps) {
  const waves = WAVES.filter((moment) => at >= moment).length;
  const roots = [...BEFORE, ...SCENE.filter((line) => at >= line.at)].map((line) => {
    if (line.id === "s1" && waves) return root({ ...line, extra: { reaction_summary: [{ emoji: "👋", count: waves }] } }, now);
    if (line.id === "s3" && at >= THANKS_AT) return root({ ...line, extra: { reaction_summary: [{ emoji: "🙏", count: 1 }] } }, now);
    return root(line, now);
  });
  return (
    <ChannelPage>
      <WebCommunityInteractionProjection
        {...({ ...channelProps(CHANNELS[0]!), roots, selectedRootId: null, replies: [], typingPresence: typingFor(TYPING, at, now), mainComposer: <Composer placeholder="Message #general" /> } as any)}
      />
    </ChannelPage>
  );
}

// What Launch Lab knows. `learned`: the answer in scene 2 has become a point.
function launchLabMap(now: number, learned: boolean): BrainMap {
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
    pt("list", "Start with ten names you already know", lesson("readers"), 34, now, { use: 4 }),
    pt("dm", "A direct message beats a post", lesson("readers"), 20, now, { use: 2 }),
    pt("narrow", "Narrow beats broad for a first offer", lesson("problem"), 30, now, { use: 3 }),
    pt("five", "Charge what five people would pay this week", lesson("pricing"), 28, now, { use: 6 }),
    pt("raise", "Raise the price after the first cohort", lesson("pricing"), 9, now, { use: 2 }),
    pt("page", "One page: the result, who it's for, one link", lesson("page"), 18, now, { use: 5 }),
    pt("wait", "A waitlist page filled Dana's second cohort", lesson("waitlist"), 2, now, { use: 3 }),
    pt("calls", "How the Friday call runs", subject("Friday calls"), 40, now, { use: 2 }),
    pt("hot", "Bring one page for a hot seat", subject("Friday calls"), 12, now),
    pt("stripe", "Connecting payouts takes a day", subject("Getting paid"), 15, now, { use: 1 }),
    pt("refund", "Offer a refund in week one", subject("Getting paid"), 6, now, { use: 1 }),
    ...(learned ? [pt("cohort", "First cohorts here land between $200 and $500", lesson("pricing"), 0, now, { use: 8, mine: true })] : []),
  ];
  map.arcs = [{ a: "note:five", b: "note:raise", count: 3 }, { a: "note:page", b: "note:wait", count: 2 }, ...(learned ? [{ a: "note:cohort", b: "note:five", count: 2 }] : [])];
  return finish(map, now);
}

// 3. Remembers: Knowledge, the community brain.
const LEARNED_AT = 3.2;

function RemembersScene({ at, now }: SceneProps) {
  const learned = at >= LEARNED_AT;
  return (
    <main className="workspace community-mode">
      <div className="community-body">
        <CommunityPageFrame>
          <KitBrainPageFrame canManage fill>
            <KitBrainPageView key={learned ? "after" : "before"} session={null} communityId="demo" canManage onOpenCourse={noop} map={launchLabMap(now, learned)} />
          </KitBrainPageFrame>
        </CommunityPageFrame>
      </div>
    </main>
  );
}

// 4. Briefs you: the host's Home, the next morning.
const CARD_AT = 1.8;
const SINCE_AT = [4.2, 5.6, 7.0];

// Home's page: the greeting and what follows it, the guide's box, and the
// right column.
// `talk`: the conversation with the guide, once it is open.
function HomePage(props: { host: boolean; time: string; greeting: string; line: string; chips: string[]; now: number; here: string; joined?: string; talk?: ReactNode; children: ReactNode }) {
  const talking = Boolean(props.talk);
  return (
    <main className="workspace community-mode community-agent-workspace">
      <aside className="community-agent-dock community-agent-page is-open">
        <section className="community-agent-dock-panel has-home-rail is-kit-home" aria-label="Home">
          <KitApp view="home" host={props.host} part="main" talking={talking}>
            <View index={0}>
              {talking ? <Top titleView={0} title={<button type="button" className="kit-home-back" aria-label="Back to Home">← Home</button>} /> : null}
              <Scroll>
                {talking ? null : <Top title="Home" titleView={0} />}
                <HomeBody>
                  <Eyebrow community={COMMUNITY.name} time={props.time} />
                  <Hello greeting={props.greeting} line={props.line} />
                  {props.children}
                  {props.talk ? <Talk>{props.talk}</Talk> : null}
                </HomeBody>
              </Scroll>
              <Dock>
                {talking ? null : <Chips chips={props.chips} />}
                <Ask guide placeholder="Ask your guide anything" />
              </Dock>
            </View>
          </KitApp>
          <div className="community-home-rail">
            <KitApp view="home" host={props.host} part="rail">
              <Rail index={0} label="The community today">
                <BriefPart now={props.now} onOpenChannel={noop} brief={{
                  summary: "Pricing is the talk of the week: Sam raised his coaching offer and Mira settled on $300 for her first cohort. Dana's second cohort filled from the waitlist page, and Friday's call is a hot seat on one-page offers.",
                  channels: [{ slug: "pricing", name: "Pricing" }, { slug: "general", name: "General" }],
                  updated_at: new Date(props.now - 2 * 3_600_000).toISOString(),
                } as any} />
                <PanelBrain map={{ ...launchLabMap(props.now, true), can_manage: props.host }} now={props.now} max={2} onOpen={noop} />
                <PanelPart label="Here" fact="49 members">
                  <div className={cx("ln")}><span className={cx("t")}>{props.here}</span></div>
                  {props.joined ? <PanelLine>{props.joined}</PanelLine> : null}
                </PanelPart>
              </Rail>
            </KitApp>
          </div>
        </section>
      </aside>
    </main>
  );
}

function BriefsScene({ at, now }: SceneProps) {
  const since = SINCE_AT.filter((moment) => at >= moment).length;
  return (
    <HomePage host time="8:02 am" greeting="Good morning, Ana." line="1 person joined since yesterday, and 1 thing needs you."
      chips={["How was this week?", "Who is at risk of leaving?", "Who should I welcome?"]} now={now} here="Dana and 3 others are here" joined="2 joined this week">
      {at >= CARD_AT ? (
        <Card label="Worth a look" title="Sam hasn't been back in two weeks" say="He stopped after lesson 4, and was here every day before that. Your guide can check in with him, or you can.">
          <Btn go>Talk it over</Btn>
          <Btn txt>Not now</Btn>
        </Card>
      ) : null}
      {since ? (
        <Since label="Since you were last here">
          {since >= 1 ? <SinceItem kind="Joined" title="Mira Okafor joined" detail="I welcomed her and introduced her to Dana, who replied" still /> : null}
          {since >= 2 ? <SinceItem kind="Answered" learned title="I answered Mira's pricing question" detail="From lesson 3 · she set her price at $300" still /> : null}
          {since >= 3 ? <SinceItem kind="Learned" learned title="First cohorts here land between $200 and $500" detail="Saved to Knowledge, under Pricing your first offer" still /> : null}
        </Since>
      ) : null}
    </HomePage>
  );
}

// 4. Gets results: the guide acts, and it pays off. Ana asks who is slipping
// away; the guide answers, offers to bring Sam back, and does it. Sam shows
// up in his pod, gets notes on his page, and posts his first client in #wins.
const ASK: Array<{ at: number; mine: boolean; text: string }> = [
  { at: 1.4, mine: true, text: "Who is at risk of leaving?" },
  { at: 3.2, mine: false, text: "Sam. He stopped after lesson 4, and was here every day before that. I can check in with him and invite him to the Offer Sprint pod, where three people are working on the same lesson. Want me to?" },
  { at: 5.6, mine: true, text: "Do it." },
  { at: 7.0, mine: false, text: "Done. I messaged Sam and invited him to Offer Sprint. I'll tell you when he replies." },
];
const POD_AT = 9.4;
const POD = { id: "c-pod", slug: "offer-sprint", name: "Offer Sprint" };
const POD_BEFORE: Line[] = [
  { id: "o1", who: "priya", minutesAgo: 240, text: "Draft two of my one-page offer is up. Cut it by half since Tuesday." },
];
const POD_LINES: Array<Line & { at: number }> = [
  { id: "o2", at: POD_AT + 1.0, who: "sam", minutesAgo: 0, text: "Back at it. Here's my one-page offer for the coaching package. Be honest." },
  { id: "o3", at: POD_AT + 2.8, who: "priya", minutesAgo: 0, text: "Lead with the result and cut the second paragraph. The price is right." },
  { id: "o4", at: POD_AT + 4.4, who: "dana", minutesAgo: 0, text: "Add the start date and send it today. This is ready." },
];
const WIN_AT = POD_AT + 6.4;
const WINS_BEFORE: Line[] = [
  { id: "w0", who: "mira", minutesAgo: 600, text: "First five paying subscribers at $300 each. Two weeks ago I didn't have a price.", extra: { reaction_summary: [{ emoji: "🎉", count: 9 }] } },
];
const WIN_LINES: Array<Line & { at: number }> = [
  { id: "w2", at: WIN_AT + 1.0, who: "sam", minutesAgo: 0, text: "Signed my first client off the new page. $250 a month. Thank you, Offer Sprint." },
  { id: "w4", at: WIN_AT + 4.0, who: "guide", minutesAgo: 0, text: "That's Sam back and paid, eight days after he went quiet. I've added it to this week's wins for Ana." },
];
const CHEERS = [1.8, 2.3, 2.8, 3.3, 3.8, 4.6, 5.2].map((after) => WIN_AT + after);
const RESULTS_SECONDS = WIN_AT + 6.6;

function ResultsScene({ at, now }: SceneProps) {
  if (at < POD_AT) {
    const said = ASK.filter((line) => at >= line.at);
    return (
      <HomePage host time="8:04 am" greeting="Good morning, Ana." line="1 person joined since yesterday, and 1 thing needs you."
        chips={["How was this week?", "Who is at risk of leaving?", "Who should I welcome?"]} now={now} here="Dana and 3 others are here" joined="2 joined this week"
        talk={said.length ? said.map((line) => (line.mine ? <Mine key={line.at}>{line.text}</Mine> : <Theirs key={line.at}><p>{line.text}</p></Theirs>)) : undefined}>
        {said.length ? null : (
          <Card label="Worth a look" title="Sam hasn't been back in two weeks" say="He stopped after lesson 4, and was here every day before that. Your guide can check in with him, or you can.">
            <Btn go>Talk it over</Btn>
            <Btn txt>Not now</Btn>
          </Card>
        )}
      </HomePage>
    );
  }
  const inPod = at < WIN_AT;
  const cheers = CHEERS.filter((moment) => at >= moment).length;
  const lines = inPod ? [...POD_BEFORE, ...POD_LINES.filter((line) => at >= line.at)] : [...WINS_BEFORE, ...WIN_LINES.filter((line) => at >= line.at)];
  const roots = lines.map((line) => (line.id === "w2" && cheers ? root({ ...line, extra: { reaction_summary: [{ emoji: "🎉", count: cheers }] } }, now) : root(line, now)));
  return (
    <ChannelPage>
      <WebCommunityInteractionProjection key={inPod ? "pod" : "wins"}
        {...({ ...channelProps(inPod ? POD : CHANNELS[1]!), ...(inPod ? { activeChannel: { ...POD, is_general: false, access_mode: "restricted" } } : {}), roots, selectedRootId: null, replies: [],
          typingPresence: { users: [], total_count: 0 }, mainComposer: <Composer placeholder={inPod ? "Message Offer Sprint" : "Message #wins"} /> } as any)}
      />
    </ChannelPage>
  );
}

const SCENES: Array<{ key: string; label: string; seconds: number; say: string; left: (at: number) => Left; Scene: (props: SceneProps) => ReactNode }> = [
  { key: "answers", label: "Welcomes and answers", seconds: SCENE_SECONDS, left: () => ({ tab: "chat", channelSlug: "general" }), say: "Someone new asks their first question. Your client success manager welcomes them, answers from the lesson you taught it in, and introduces the right person.", Scene: WelcomesScene },
  { key: "remembers", label: "Remembers", seconds: 8, left: () => ({ tab: "resources" }), say: "That answer becomes something your community knows, for the next person who asks.", Scene: RemembersScene },
  { key: "briefs", label: "Briefs you", seconds: 10.5, left: () => ({ tab: "agent" }), say: "You open the app to what was handled, and the one person who needs you.", Scene: BriefsScene },
  { key: "results", label: "Gets results", seconds: RESULTS_SECONDS, left: (at) => (at < POD_AT ? { tab: "agent" } : at < WIN_AT ? { tab: "chat", inPod: true } : { tab: "chat", channelSlug: "wins" }), say: "Ask who's slipping away, and it brings them back: a message, an invite to the right pod, and a first client a week later.", Scene: ResultsScene },
];

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
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setZoom(Math.min(1, box.clientWidth / APP_WIDTH));
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(box);
    return () => watcher.disconnect();
  }, []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === frameRef.current?.contentWindow && event.data?.type === `${STAGE_MESSAGE}:ready`) setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage({ type: STAGE_MESSAGE, index: props.index, at: props.at, ending: props.ending }, window.location.origin);
  }, [ready, props.index, props.at, props.ending]);
  return (
    <div ref={boxRef} style={{ height: APP_HEIGHT * zoom, overflow: "hidden", background: "#0b0c0e" }}>
      <iframe ref={frameRef} src="/design-lab?page=demo-frame" title="Polynet, playing" tabIndex={-1} aria-hidden="true"
        style={{ display: "block", width: APP_WIDTH, height: APP_HEIGHT, border: 0, transform: `scale(${zoom})`, transformOrigin: "0 0", pointerEvents: "none" }} />
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
  const scene = SCENES[state.index] ?? SCENES[0]!;
  const Scene = scene.Scene;
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
