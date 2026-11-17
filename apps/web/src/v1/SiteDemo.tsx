// Design lab only (/design-lab?page=demo): the website's product demo. It is
// the app itself, drawn by the app's own components (the left column, the
// channel page, the composer) inside the app's own frame, fed a made-up
// community and a short script instead of a server. Nothing here is a
// picture, so it looks like the product because it is the product.
//
// Scene 1, "Welcomes": someone new says hello, the guide greets them by name
// and introduces them, and the person it named replies.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { CommunityNav } from "../../../../shared/CommunityNav";
import { CommunityComposerControls } from "../components/CommunityComposerControls";
import { WebAccountMenu } from "../components/WebAccountMenu";
import { WebCommunityInteractionProjection } from "../components/WebCommunityInteractionProjection";
import { WebCommunitySwitcher } from "../components/WebCommunitySwitcher";

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
  { id: "s1", at: 1.6, who: "mira", minutesAgo: 0, text: "Hi all, I'm Mira. I'm launching a paid newsletter for indie designers. No audience yet, so I'm here to learn how to start." },
  { id: "s2", at: 6.4, who: "guide", minutesAgo: 0, text: "Welcome, Mira. Start with lesson 1, “Your first ten readers”. And say hello to Dana: she launched her newsletter here in March with no list, and offered to share her numbers." },
  { id: "s3", at: 11.2, who: "dana", minutesAgo: 0, text: "Happy to! Mira, send me your draft pricing page and I'll tell you what I'd change." },
];
const TYPING = [{ from: 3.2, to: 6.4, who: "guide" }, { from: 8.0, to: 11.2, who: "dana" }];
// Hellos on Mira's post, one at a time; then her thanks on Dana's reply.
const WAVES = [2.9, 4.1, 7.3, 9.4];
const THANKS_AT = 12.8;
// The scene, a hold on its last moment, then a short fade before it starts over.
const SCENE_SECONDS = 16;
const FADE_SECONDS = 0.6;

const noop = () => {};
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// The clock a scene runs on: seconds since it started, looping. People who
// have asked for less motion get the scene's last moment, standing still.
function useSceneClock(seconds: number): number {
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // Standing still, it shows the moment just before the closing fade.
  const [at, setAt] = useState(still ? seconds - 1 : 0);
  useEffect(() => {
    if (still) return;
    const started = performance.now();
    const timer = window.setInterval(() => setAt(((performance.now() - started) / 1000) % seconds), 100);
    return () => window.clearInterval(timer);
  }, [seconds, still]);
  return at;
}

// The app's frame at its own size, scaled to the width it is given.
// New messages and the typing line ease in; the feed fades before a scene
// starts over, so nothing vanishes in one frame.
const DEMO_CSS = `
.site-demo .kit-channel-feed-part [class*="_msg_"]{animation:site-demo-in .42s cubic-bezier(.2,.7,.2,1) both}
.site-demo .community-interaction-typing{animation:site-demo-in .3s ease both}
.site-demo .kit-channel-feed-part,.site-demo .community-interaction-typing{transition:opacity ${FADE_SECONDS}s ease}
.site-demo.is-ending .kit-channel-feed-part,.site-demo.is-ending .community-interaction-typing{opacity:0}
@keyframes site-demo-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.site-demo *{animation:none!important;transition:none!important}}
`;

function AppFrame(props: { ending?: boolean; children: ReactNode }) {
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
    <div ref={boxRef} className={`site-demo${props.ending ? " is-ending" : ""}`} style={{ height: APP_HEIGHT * zoom }}>
      <style>{DEMO_CSS}</style>
      <div className="app-root" style={{ width: APP_WIDTH, height: APP_HEIGHT, zoom }}>
        <div className="app-shell framed-shell community-layout sessions-compact no-right" style={{ height: APP_HEIGHT }}>
          <div className="product-shell-surface product-shell-surface--community" style={{ height: APP_HEIGHT }}>
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeftColumn(props: { channelSlug: string }) {
  return (
    <CommunityNav
      {...({
        activeCommunity: COMMUNITY,
        communityTab: "chat",
        activeSelectionMode: "route",
        channels: CHANNELS,
        selectedChannelSlug: props.channelSlug,
        channelIndicators: { "c-wins": { unread: true } },
        canViewMembersActiveCommunity: true,
        canViewActiveCommunitySettings: true,
        canManageMembersActiveCommunity: true,
        canViewActiveCommunityAnalytics: true,
        onSelectTab: noop,
        onSelectChannel: noop,
        onCreateChannel: async () => true,
        onCopyCommunityJoinLink: noop,
        layout: "v1",
        identityIsCover: true,
        onOpenInbox: noop,
        onOpenMembers: noop,
        onOpenPods: noop,
        memberCount: 48,
        toolsSlot: (
          <button type="button" className="community-search-ask" title="Search or ask your guide (⌘K)">
            <Search size={14} aria-hidden="true" />
            <span>Search or ask</span>
            <kbd>⌘K</kbd>
          </button>
        ),
        accountSlot: (
          <WebAccountMenu name={PEOPLE[HOST]!.name} avatarUrl={null} roleLabel="Host" appTheme="dark" onSetAppTheme={noop} onOpenSettings={noop} onSignOut={async () => {}} />
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

function Composer(props: { placeholder: string }) {
  return (
    <div className="chat-input-bar">
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

function WelcomesScene() {
  const at = useSceneClock(SCENE_SECONDS);
  const [now] = useState(Date.now);
  const shown = SCENE.filter((line) => at >= line.at);
  const waves = WAVES.filter((moment) => at >= moment).length;
  const roots = [...BEFORE, ...shown].map((line) => {
    if (line.id === "s1" && waves) return root({ ...line, extra: { reaction_summary: [{ emoji: "👋", count: waves }] } }, now);
    if (line.id === "s3" && at >= THANKS_AT) return root({ ...line, extra: { reaction_summary: [{ emoji: "🙏", count: 1 }] } }, now);
    return root(line, now);
  });
  const ending = at >= SCENE_SECONDS - FADE_SECONDS;
  const typing = TYPING.find((span) => at >= span.from && at < span.to);
  const typingPresence = typing
    ? { users: [{ user_id: typing.who, display_name: typing.who === "guide" ? COMMUNITY.name : PEOPLE[typing.who]!.name, avatar_url: null, display_until_ms: now + 60_000 }], total_count: 1 }
    : { users: [], total_count: 0 };
  return (
    <AppFrame ending={ending}>
      <LeftColumn channelSlug="general" />
      {/* In the app this slot has no box of its own, so the page fills the frame. */}
      <div className="web-main-surface-slot" style={{ display: "contents" }}>
        <main className="workspace community-mode">
          <div className="community-body">
            <div className="community-chat community-member-chat community-attachment-drop-surface">
              <div className="workspace-body chat-feed">
                <div className="community-interaction-scroll">
                  <WebCommunityInteractionProjection
                    {...({
                      activeCommunityName: COMMUNITY.name,
                      activeChannel: { id: "c-general", slug: "general", name: "General", is_general: true },
                      communityId: COMMUNITY.id,
                      communityOwnerId: HOST,
                      currentUserId: HOST,
                      roots,
                      activityEvents: [],
                      selectedRootId: null,
                      replies: [],
                      isLoadingRoots: false,
                      isLoadingReplies: false,
                      error: null,
                      repliesError: null,
                      rootChangeReason: "newer",
                      typingPresence,
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
                      mainComposer: <Composer placeholder="Message #general" />,
                    } as any)}
                  />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AppFrame>
  );
}

// The lab page: the demo on its own, in the site's frame, to judge it
// against the real app.
export function SiteDemoLab() {
  return (
    <div style={{ height: "100vh", overflowY: "auto", background: "#07080a", padding: "48px 24px" }}>
      <div style={{ width: "min(1180px, 100%)", margin: "0 auto", borderRadius: 14, border: "1px solid rgba(255,255,255,.14)", overflow: "hidden", boxShadow: "0 60px 140px -50px rgba(111,120,216,.35), 0 40px 90px -40px #000" }}>
        <WelcomesScene />
      </div>
    </div>
  );
}
