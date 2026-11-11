// Design lab (staging only, design v1): pages built from the kit with the
// mock's own sample content, so they can be compared with the mock pixel for
// pixel before real pages move onto the kit. Reached at /design-lab.
import {
  Btn,
  Chips,
  Cover,
  Dock,
  Eyebrow,
  Figs,
  Foot,
  Group,
  Hello,
  HomeBody,
  KitApp,
  Main,
  Me,
  NavRow,
  Rail,
  Sec,
  Sep,
  Side,
  Since,
  SinceItem,
  Spacer,
  TextLink,
  Top,
  View,
  Ask,
} from "./kit";
import { KitChannelFeed } from "./KitChannelFeed";

const BANNER = "/design-lab/polynet-earth.webp";
const SMALL_BUTTON = { height: 32, fontSize: 13 } as const;

function HostSide() {
  return (
    <Side>
      <Cover name="Polynet" />
      <Spacer height={10} />
      <NavRow icon="home" label="Home" view="home" />
      <NavRow icon="inbox" label="Inbox" view="inbox" hint="4" />
      <Group>Channels</Group>
      <NavRow icon="hash" label="general" />
      <NavRow icon="hash" label="wins" view="wins" unread dot />
      <NavRow icon="hash" label="tech" />
      <NavRow icon="hash" label="biz" />
      <NavRow icon="lock" label="founders" />
      <NavRow icon="plus" label="Add a channel" add hostOnly />
      <Group>Community</Group>
      <NavRow icon="stars" label="Knowledge" view="know" hint="3 new" />
      <NavRow icon="cal" label="Events" view="events" live="20 min" />
      <NavRow icon="users" label="Members" view="members" hint="214" />
      <Foot>
        <NavRow icon="spark" label="Your guide" view="guide" hostOnly />
        <NavRow icon="sliders" label="Manage" view="manage" hostOnly />
        <Me name="Neil McDevitt" role="Host" avatar="N" tone="a2" hostOnly />
      </Foot>
    </Side>
  );
}

function HostHomeQuiet() {
  return (
    <KitApp view="home" host fillWindow banner={BANNER} bannerPosition="72% 38%" aura={0.08}>
      <HostSide />
      <Main>
        <Top />
        <View index={0}>
          <HomeBody hostOnly>
            <Eyebrow community="Polynet" time="8:40 pm" />
            <Hello greeting="Good evening, Neil." line="Nothing needs you. The community looked after itself today." />
            <Since label="Across the community" style={{ marginTop: 44 }}>
              <SinceItem kind="Joined" title="One new member, Mira" detail="She said hello in #general · four people replied" />
              <SinceItem kind="Answered" learned title="I answered six questions from Knowledge" detail="All six were marked helpful" />
              <SinceItem kind="Friday" title="Fourteen people are coming to the build call" detail="Jon is bringing his invitation · I'll draft the agenda tomorrow" />
            </Since>
          </HomeBody>
          <Dock>
            <Chips hostOnly chips={["How was this week?", "Who is at risk of leaving?", "Draft Friday's agenda"]} />
            <Ask guide placeholder="Ask your guide anything" />
          </Dock>
        </View>
      </Main>
      <Rail index={0} hostOnly label="The community right now">
        <Figs
          figures={[
            { label: "Members", value: "214", note: "3 joined this week" },
            { label: "Active this week", value: "132", note: "62 percent" },
            { label: "Revenue this month", value: "$4,180", note: "up $320" },
            { label: "Next payout", value: "$1,240", note: "Friday" },
          ]}
        />
        <Sep />
        <Sec label="Next up">
          <h3>Friday build call</h3>
          <p>Friday, 10:00 am · you're hosting</p>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <Btn style={SMALL_BUTTON}>Open the room</Btn>
            <Btn txt style={SMALL_BUTTON}>All events</Btn>
          </div>
        </Sec>
        <Sep />
        <Sec label="Your guide, this week">
          <p>Answered 41 questions, welcomed 3 members, and saved 3 notes for your review.</p>
          <TextLink style={{ marginTop: 2 }}>What it may do</TextLink>
        </Sec>
      </Rail>
    </KitApp>
  );
}

// The mock's #wins, through the real channel feed (KitChannelFeed) with the
// mock's messages as data, so the feed is scored against the mock.
function labRoot(id: string, who: string, hoursAgo: number, text: string, extra: Record<string, unknown> = {}) {
  const at = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  return {
    deduped: false,
    root: {
      id, kind: "discussion", title: null, content_summary: text, created_at: at, edited_at: null,
      actor_type: who === "guide" ? "community_agent" : "human",
      actor_user_id: who === "guide" ? null : who, actor_agent_key: who === "guide" ? "community_agent" : null,
      reply_count: 0, last_reply_at: null, last_reply_actor_user_id: null,
      reaction_summary: [], viewer_emojis: [], idempotency_key: id,
      ...extra,
    },
    content_blocks: [{ kind: "text", position: 0, text }],
    embeds: [], mentions: [], attachments: [],
  };
}
const LAB_NAMES: Record<string, string> = { rashid: "Rashid", sara: "Sara", jon: "Jon", priya: "Priya", neil: "Neil", maya: "Maya" };
const LAB_COLOURS: Record<string, string> = { rashid: "#5B6CF0", sara: "#E0788C", jon: "#3DAE8C", priya: "#C58B3A", neil: "#7A6FF0", maya: "#3D8FD6" };

function HostChannel() {
  const roots = [
    labRoot("r1", "rashid", 17, "First paid member came in from the new door. Seventy-nine dollars never felt so good.", { reaction_summary: [{ emoji: "🎉", count: 9 }] }),
    labRoot("r2", "sara", 15, "Ran my first live call with eleven people. Nobody left early, which I'm counting as a win."),
    labRoot("r3", "jon", 0.6, "We passed 100 members last night. The invitation that worked was three lines: the result, who it's for, one link.", {
      reaction_summary: [{ emoji: "🎉", count: 12 }, { emoji: "🔥", count: 5 }], reply_count: 4,
      last_reply_at: new Date(Date.now() - 600_000).toISOString(), last_reply_actor_user_id: "priya",
    }),
    labRoot("r4", "priya", 0.4, "Huge. Stealing that second line."),
    labRoot("r5", "guide", 0.38, "I've saved Jon's invitation to Knowledge, with his numbers. Two members asked for exactly this last week."),
    labRoot("r6", "neil", 0.2, "This is the play. Bring it to Friday's call so everyone can see it."),
    labRoot("r7", "maya", 0.05, "Sending my first ten today. Wish me luck.", { reaction_summary: [{ emoji: "🚀", count: 3 }] }),
  ];
  const noop = () => {};
  const feedProps = {
    roots, activityEvents: [], selectedRootId: null, chatLastSeenAt: null, error: null, isLoadingRoots: false,
    currentUserId: "neil", communityOwnerId: "neil", activeCommunityName: "Polynet",
    profilesByUserId: Object.fromEntries(Object.keys(LAB_NAMES).map((id) => [id, { user_id: id, display_name: LAB_NAMES[id], avatar_url: null }])),
    displayName: (id: string) => LAB_NAMES[id] ?? id,
    getAvatarColor: (id: string) => LAB_COLOURS[id] ?? "#555", getInitials: (name: string) => name.slice(0, 1),
    formatChatTime: (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s+/g, " ").toLowerCase(),
    renderTextWithLinks: (text: string) => text,
    onSelectRoot: noop, onRetryRoots: noop,
    editing: null, editText: "", onStartEdit: noop, onEditTextChange: noop, onSaveEdit: noop, onCancelEdit: noop,
  } as any;
  return (
    <KitApp view="wins" host fillWindow banner={BANNER} bannerPosition="72% 38%" aura={0.08}>
      <HostSide />
      <Main>
        <Top title={<># wins <small>Share what worked</small></>} titleView={1} />
        <View index={1}>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", padding: "8px 44px 18px" }}>
            <KitApp view="wins" part="flow"><KitChannelFeed {...feedProps} /></KitApp>
          </div>
          <Dock>
            <Ask placeholder="Message #wins" />
          </Dock>
        </View>
      </Main>
      <Rail index={1} label="About this channel">
        <Sec label="In this channel · 48"><p>4 here now</p></Sec>
      </Rail>
    </KitApp>
  );
}

export function DesignLab() {
  const page = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("page");
  return page === "channel" ? <HostChannel /> : <HostHomeQuiet />;
}
