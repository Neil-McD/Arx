// Design lab (staging only, design v1): pages built from the kit with the
// mock's own sample content, so they can be compared with the mock pixel for
// pixel before real pages move onto the kit. Reached at /design-lab.
import { useState as useStateLab } from "react";
import {
  Btn,
  cx,
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
  Icon,
} from "./kit";
import { PanelBrain, labSession, rememberBrainMap } from "./KitBrain";
import { BriefPart } from "./KitBrief";
import { PanelAction, PanelLearned, PanelLine, PanelNext, PanelPart, PanelPeople } from "./KitPanel";
import { KitChannelFeed } from "./KitChannelFeed";
import { BRAIN_MAP_MIN_POINTS, KitBrainMap, type BrainReading } from "./KitBrainMap";
import { KitBrainPageFrame, KitBrainPageView, NoteActions } from "./KitBrainPage";
import { KitEventsList, eventClock } from "./KitEventsList";
import { KitEventForm } from "./KitEventForm";
import { JoinRequestsDrawer, JoinRequestsLine, MembersBulkBar, MembersTable, MembersToolbar, type MembersSortKey } from "./KitMembersTable";
import { memberTimeFor, shortDay } from "./KitMembersPage";
import { matchesMemberSearch, memberKey, toggleAllShown } from "../../../../shared/communityMembersTable";
import { fullExample, middlingExample, sunriseExample } from "./brainExamples";
import { CommunityPageFrame, CommunityPageRail } from "../components/CommunityPageHeader";
import { KitHomeRail } from "./KitHomeRail";
import { KitPodRail } from "./KitPodRail";
import { SiteLab } from "./SiteLab";
import { SiteDemoLab, SiteDemoStage } from "./SiteDemo";

const BANNER = "/design-lab/polynet-earth.webp";
const SMALL_BUTTON = { height: 32, fontSize: 13 } as const;

function HostSide() {
  return (
    <Side>
      <Cover name="Polynet" />
      <Spacer height={10} />
      <NavRow icon="home" label="Home" view="home" />
      <NavRow icon="inbox" label="Inbox" view="inbox" hint="4" />
      <Group action={<span className={cx("grp-add", "h-only")} aria-label="Add a channel"><Icon name="plus" /></span>}>Channels</Group>
      <NavRow icon="hash" label="general" />
      <NavRow icon="hash" label="wins" view="wins" unread dot />
      <NavRow icon="hash" label="tech" />
      <NavRow icon="hash" label="biz" />
      <NavRow icon="lock" label="founders" />
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
    <KitApp view="home" host fillWindow scale={labScale()} banner={BANNER} bannerPosition="72% 38%" aura={0.08}>
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
    <KitApp view="wins" host fillWindow scale={labScale()} banner={BANNER} bannerPosition="72% 38%" aura={0.08}>
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

// The guide's brief as the panels draw it: Home's (its channels open, a
// long one folds) and a pod's (plain).
function BriefPanels() {
  const now = Date.now();
  return (
    <KitApp view="wins" host fillWindow scale={labScale()} banner={BANNER} bannerPosition="72% 38%" aura={0.08}>
      <HostSide />
      <Main><Top /></Main>
      <Rail index={1} label="The guide's brief">
        <BriefPart now={now} onOpenChannel={() => undefined} brief={{
          summary: "Most of the talk is about getting a first paid pod out the door: pricing it, and what the launch post should say. Stripe payouts are the sticking point for a couple of people, and Friday's build call is where it's all headed.",
          channels: [{ slug: "general", name: "general" }, { slug: "wins", name: "wins" }],
          updated_at: new Date(now - 3 * 3_600_000).toISOString(),
        }} />
        <Sep />
        <BriefPart now={now} brief={{
          summary: "The pod has moved on to fingerboard work for week three, and people are comparing hang times.",
          channels: [],
          updated_at: new Date(now - 26 * 3_600_000).toISOString(),
        }} />
      </Rail>
    </KitApp>
  );
}

// The Pods page: one card is always picked and the right column is its
// landing page. join: a pod the viewer could join is picked (its pitch).
function PodsPage(props: { join: boolean }) {
  const now = Date.now();
  const card = (name: string, purpose: string, meta: string, picked: boolean, locked = false) => (
    <button type="button" className={cx(picked ? `podcard${locked ? " podout" : ""} podsel` : `podcard${locked ? " podout" : ""}`)}>
      <span className={cx("podname")}>{name}</span>
      <span className={cx("podpurpose")}>{purpose}</span>
      <span className={cx("podmeta")}>{meta}</span>
    </button>
  );
  return (
    <KitApp view="wins" host fillWindow scale={labScale()} banner={BANNER} bannerPosition="72% 38%" aura={0.08}>
      <HostSide />
      <Main>
        <Top title="Pods" titleView={1} />
        <View index={1}>
          <div style={{ padding: "8px 44px 18px" }}>
            <KitApp view="wins" part="flow">
              <p className={cx("lead")} style={{ marginTop: 0 }}>Your pods.</p>
              <div className={cx("podgrid")}>
                {card("Setters", "The route setters plan resets and the comp.", "3 members · Active 2 h ago", !props.join)}
                {card("Dawn patrol", "The 6am crew. Projects, beta and coffee.", "8 members · Active yesterday", false)}
              </div>
              <span className={cx("lab")} style={{ display: "block", marginTop: 32 }}>Pods you can join</span>
              <div className={cx("podgrid")}>
                {card("Comp team", "Training for the spring comp, with weekly feedback.", "Hosted by Maya Chen · 3 seats left", props.join, true)}
              </div>
            </KitApp>
          </div>
        </View>
      </Main>
      <Rail index={1} label="Pods">
        {props.join ? (
          <div className={cx("land")}>
            <header>
              <h2>Comp team</h2>
              <p className={cx("land-p")}>Training for the spring comp, with weekly feedback.</p>
              <ul className={cx("podget")}><li>Weekly call with the host</li><li>Feedback on your sends</li><li>The pod's own notes and call takeaways</li></ul>
            </header>
            <PanelPart label="The way in">
              <PanelLine>Meets every week · next Tue 7:00 pm</PanelLine>
              <PanelLine fact="Free for members">Price</PanelLine>
              <PanelLine fact="3 left">Seats</PanelLine>
            </PanelPart>
            <PanelPart label="Hosted by"><PanelPeople names={["Maya Chen"]} /></PanelPart>
            <div className={cx("joinbar")}><Btn go>Ask to join</Btn><small>The host reviews each request.</small></div>
          </div>
        ) : (
          <div className={cx("land")}>
            <header>
              <h2>Setters</h2>
              <p className={cx("land-p")}>The route setters plan resets and the comp.</p>
            </header>
            <BriefPart now={now} brief={{
              summary: "The setters have settled a clear reset routine: Maya takes Tuesdays, Priya Thursdays, and old holds come off by the night before. Comp problems use blue tape, everyday ones white, with grades pencilled in until the round ends.",
              channels: [], updated_at: new Date(now - 14 * 60_000).toISOString(),
            }} />
            <PanelPart label="Next call" fact="every week"><PanelNext title="Tue 7:00 pm" sub="Setters call" /></PanelPart>
            <PanelPart label="What this pod knows" fact="2">
              <PanelLearned title="Reset rota" when="Nov 15" />
              <PanelLearned title="Tape colours for comps" when="Nov 15" />
            </PanelPart>
            <PanelPart label="In this pod" fact="3"><PanelPeople names={["Maya Chen", "Priya Raman", "Neil McDevitt"]} /></PanelPart>
            <div className={cx("joinbar")}><Btn go>Open the pod</Btn></div>
          </div>
        )}
      </Rail>
    </KitApp>
  );
}

// Home's and a pod's right panels, as the app draws them (nothing loads in
// the lab, so the brief and what loads from the server are absent).
function RealPanels(props: { pod: boolean }) {
  const noop = () => undefined;
  const example = new URLSearchParams(window.location.search).get("example") ?? "sunrise";
  const labMap = example === "full" ? fullExample(Date.now()) : example === "middling" ? middlingExample(Date.now()) : sunriseExample(Date.now());
  rememberBrainMap("lab", null, labMap);
  rememberBrainMap("lab", "lab", { ...labMap, center: { name: "Setters", kind: "pod" }, courses: [], pods: [] });
  const pod = {
    channel_id: "lab", slug: "setters", name: "Setters", purpose: "The route setters plan resets and the comp.", visibility: "listed", seats: 6, price: null,
    what_you_get: ["Weekly call with the host"], hosts: ["Maya Chen"], can_manage: true, can_edit: true, requests: [{ user_id: "theo", name: "Theo Park", status: "pending" }],
    next_call: { event_id: "e", title: "Setters call", starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), url: "https://example.com", recurrence_frequency: "weekly" },
    members: [{ user_id: "maya", name: "Maya Chen", is_host: true, payment: { state: "added", until: null } }, { user_id: "priya", name: "Priya Raman", is_host: false, payment: { state: "added", until: null } }],
    my_membership: { state: "added", until: null, amount_base_units: 0, currency: "usd" },
  } as any;
  const snapshot = { memberCount: 62, newMembers: { count: 1, names: ["Priya"] }, activity: { posts: 4, replies: 9, activePeople: 5 }, week: { joined: 3, activePeople: 21 },
    busiest: null, highlight: null, unanswered: [], quietNewcomers: { count: 0, names: [] }, joinRequestsPending: 2, upcomingEvents: [] } as any;
  const presence = { online_count: 2, online_faces: [{ user_id: "n", display_name: "Neil McDevitt" }, { user_id: "m", display_name: "Maya Chen" }] } as any;
  return (
    <KitApp view="wins" host fillWindow scale={labScale()} banner={BANNER} bannerPosition="72% 38%" aura={0.08}>
      <HostSide />
      <Main><Top /></Main>
      {props.pod ? <KitPodRail session={labSession} communityId="lab" pod={pod} onChanged={noop} /> : (
        <Rail index={1} label="Home">
          <KitHomeRail session={labSession} communityId="lab" audience="host" snapshot={snapshot} presence={presence} now={Date.now()}
            onOpenEvents={noop} onOpenChannelByName={noop} onOpenMembers={noop} onOpenKnowledge={noop} />
        </Rail>
      )}
    </KitApp>
  );
}

// The Pods landing panel in the page's real right-column shell (the frame's
// slot, the kit's rail inside it), to check it never runs past the column.
function PodsShell() {
  const now = Date.now();
  return (
    <div style={{ height: "100vh", display: "grid" }}>
      <CommunityPageFrame>
        <div style={{ padding: 40 }}>Pods</div>
        <CommunityPageRail label="Pods">
          <KitApp view="events" host part="rail" className="kit-page-rail">
            <Rail index={4} label="This pod">
              <div className={cx("land")}>
                <header>
                  <h2>Setters</h2>
                  <p className={cx("land-p")}>The route setters plan resets and the comp, and keep the wall fresh for everyone.</p>
                </header>
                <BriefPart now={now} brief={{
                  summary: "The setters have settled a clear reset routine: Maya takes Tuesdays, Priya Thursdays, and old holds come off by the night-before deadline. Comp problems use blue tape, everyday ones white, with grades pencilled in until the round ends.",
                  channels: [], updated_at: new Date(now - 3_600_000).toISOString(),
                }} />
                <PanelPart label="What this pod knows" fact="2">
                  <PanelLearned title="Setters' brush storage" when="Nov 15" />
                  <PanelLearned title="Setters reset rota and hold labeling for the spring comp" when="Nov 15" />
                </PanelPart>
                <PanelPart label="In this pod" fact="2"><PanelPeople names={["Priya Raman", "Maya Chen"]} /></PanelPart>
                <div className={cx("joinbar")}><Btn go>Open the pod</Btn></div>
              </div>
            </Rail>
          </KitApp>
        </CommunityPageRail>
      </CommunityPageFrame>
    </div>
  );
}

// The Knowledge shelf's panel in the page's real shell: member (Continue) or
// builder (a question to teach, and who is learning).
function KnowShell(props: { builder: boolean }) {
  const now = Date.now();
  const params = new URLSearchParams(window.location.search);
  const example = params.get("example") ?? "sunrise";
  const whole = example === "full" ? fullExample(now) : example === "middling" ? middlingExample(now) : example === "few" ? { ...sunriseExample(now), points: sunriseExample(now).points.slice(0, 3) } : sunriseExample(now);
  // A member is sent no name for what a host taught.
  const brain = props.builder ? whole : { ...whole, can_manage: false, points: whole.points.map((p) => (p.kind === "taught" ? { ...p, title: null } : p)) };
  return (
    <div style={{ height: "100vh", display: "grid" }}>
      <CommunityPageFrame>
        <div style={{ padding: 40 }}>Knowledge</div>
        <CommunityPageRail label="Knowledge">
          <KitApp view="know" host={props.builder} part="rail" className="kit-page-rail">
            <Rail index={2} label="Knowledge">
              <BriefPart now={now} brief={{ summary: "The focus is practical board beta: climbers have settled on a toe-hook for the yellow V5 and a drop-knee to unlock the purple V4.", channels: [], updated_at: new Date(now - 3_600_000).toISOString() }} />
              {props.builder ? (
                <PanelPart label="Waiting on an answer" fact="2">
                  <PanelLine action={<PanelAction onClick={() => undefined}>Teach</PanelAction>}>“Anyone have a spare harness for Saturday's meet at the north wall?”</PanelLine>
                  <PanelLine action={<PanelAction onClick={() => undefined}>Teach</PanelAction>}>“What grade is the pink one?”</PanelLine>
                </PanelPart>
              ) : (
                <PanelPart label="Continue" fact="lesson 2 of 3">
                  <PanelNext title="Reading a board problem" sub="Board basics" action={<Btn go>Resume</Btn>} />
                </PanelPart>
              )}
              <PanelBrain map={brain} now={now} onOpen={() => undefined} />
              {props.builder ? (
                <PanelPart label="Learning"><PanelLine fact="4 started · 1 finished">Board basics</PanelLine></PanelPart>
              ) : null}
            </Rail>
          </KitApp>
        </CommunityPageRail>
      </CommunityPageFrame>
    </div>
  );
}

// The community brain: Sunrise as it is on staging, a middling community and
// a full one; each at page size in a reading, and at panel size in all three.
// ?example=sunrise|middling|full  ?reading=community|yours|gaps
function BrainLab() {
  const params = new URLSearchParams(window.location.search);
  const now = Date.now();
  const example = params.get("example") ?? "sunrise";
  const reading = (params.get("reading") ?? "community") as BrainReading;
  const map = example === "full" ? fullExample(now) : example === "middling" ? middlingExample(now) : sunriseExample(now);
  const [picked, setPicked] = useStateLab<string | null>("note:v5");
  const memberView = { ...map, can_manage: false, points: map.points.map((p) => (p.kind === "taught" ? { ...p, title: null } : p)) };
  return (
    <KitApp view="wins" host fillWindow scale={labScale()} banner={BANNER} bannerPosition="72% 38%" aura={0.08}>
      <HostSide />
      <Main>
        <Top title={<>The community brain <small>{map.counts.courses} courses · {map.counts.lessons} lessons · {map.counts.learned} learned · {map.counts.this_week} this week</small></>} titleView={1} />
        <View index={1}>
          <div style={{ flex: 1, minHeight: 0, display: "flex", padding: "0 16px 16px" }}>
            <KitBrainMap map={map} size="page" reading={reading} now={now} selectedId={picked} onSelect={setPicked} />
          </div>
        </View>
      </Main>
      <Rail index={1} label="Panel size">
        {(["community", "yours", "gaps"] as const).map((r) => (
          <PanelPart key={r} label={r === "community" ? "The community brain" : r === "yours" ? "Yours" : "Gaps"} fact={r === "community" ? `${map.counts.learned} learned · ${map.counts.this_week} this week` : null}>
            {map.points.length >= BRAIN_MAP_MIN_POINTS ? <KitBrainMap map={r === "community" ? memberView : map} size="panel" reading={r} now={now} /> : <PanelLine dim>Under five things: the list instead.</PanelLine>}
          </PanelPart>
        ))}
        <PanelLine dim>Picked: {picked ?? "nothing"}</PanelLine>
      </Rail>
    </KitApp>
  );
}

// The brain as a page in Knowledge, from an example map (a picked learned
// thing reads from the server, so in the lab only lessons and subjects open).
function BrainPageLab() {
  const params = new URLSearchParams(window.location.search);
  const now = Date.now();
  const example = params.get("example") ?? "sunrise";
  const map = example === "full" ? fullExample(now) : example === "middling" ? middlingExample(now) : sunriseExample(now);
  return (
    <div style={{ height: "100vh", display: "grid" }}>
      <CommunityPageFrame>
        <KitBrainPageFrame canManage fill><KitBrainPageView session={null} communityId="lab" canManage onOpenCourse={() => undefined} map={map} /></KitBrainPageFrame>
      </CommunityPageFrame>
    </div>
  );
}

// What a builder can do to a picked learned thing, in the map's side panel.
function BrainActionsLab() {
  const now = Date.now();
  const map = sunriseExample(now);
  const point = map.points.find((entry) => entry.title && entry.at.kind === "lesson") ?? map.points[0];
  const note = { id: point.id, title: point.title, kind: point.kind, learned_at: point.learned_at, at: point.at, lesson: null, use: 0, with: [], mine: false,
    body_md: "Open hands on the big holds for ten minutes before anything crimpy, then two easy laps.", slug: "lab-note" };
  return (
    <KitBrainPageFrame canManage fill>
      <div className={cx("brainpage")} style={{ height: "100vh" }}>
        <aside className={cx("brainside")}>
          <div className={cx("land")}>
            <header><span className={cx("lab")}>Learned · today</span><h2>{note.title}</h2><p className={cx("land-p")}>{note.body_md}</p></header>
            <NoteActions map={map} note={note} session={null} communityId="lab" onChanged={() => undefined} />
          </div>
        </aside>
      </div>
    </KitBrainPageFrame>
  );
}

// The host's Members table with made-up people: search, the status filter,
// ticking rows, the bulk bar, and the join requests in their drawer.
function MembersLab() {
  const now = Date.now();
  const names = ["Maya Chen", "Priya Raman", "Theo Brennan", "Ana Ruiz", "Jon Park", "Sam Okafor", "Lena Fischer", "Diego Morales", "Hana Sato", "Omar Haddad", "Ivy Nguyen", "Noah Kim",
    "Zoe Martin", "Raj Patel", "Elif Demir", "Marco Rossi", "Tara Singh", "Ben Cohen", "Lucia Alvarez", "Kofi Mensah", "Nina Petrova", "Eli Walker", "Mina Hosseini", "Tom Becker"];
  const all = names.map((name, i) => ({
    membership_id: i === 0 ? null : `m${i}`, user_id: `u${i}`, name, handle: name.toLowerCase().replace(/\s+/g, "-"), avatar_url: null,
    role: i === 0 ? "owner" : i === 3 ? "admin" : "member",
    plan: i === 0 ? { kind: "owner" as const, label: "Owner", price_point_id: null } : i % 5 === 2 ? { kind: "free" as const, label: "Free", price_point_id: null }
      : i % 3 === 0 ? { kind: "free" as const, label: "Free", price_point_id: null } : { kind: "paid" as const, label: i % 2 ? "$20 a month" : "$180 a year", price_point_id: "p" },
    money: i === 4 ? { kind: "on_hold" as const, label: "on hold", since_at: null, ends_at: null } : i === 9 ? { kind: "cancelling" as const, label: "cancelling", since_at: null, ends_at: null } : null,
    joined_at: new Date(now - (i + 2) * 9 * 86_400_000).toISOString(), last_active_at: new Date(now - i * 7 * 3_600_000).toISOString(), working_on: null,
  }));
  const requests = [
    { id: "r1", userId: "x1", displayName: "Kai Tanaka", avatarUrl: null, message: "Climbing at Sunrise for a year, would love the board sessions.", createdAtLabel: "2 hours ago" },
    { id: "r2", userId: "x2", displayName: "Rosa Lind", avatarUrl: null, message: null, createdAtLabel: "yesterday" },
    { id: "r3", userId: "x3", displayName: "Felix Braun", avatarUrl: null, message: "Friend of Maya's.", createdAtLabel: "Nov 12" },
  ];
  const [search, setSearch] = useStateLab("");
  const [filter, setFilter] = useStateLab("everyone");
  const [selected, setSelected] = useStateLab<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useStateLab<string | null>(null);
  const [drawer, setDrawer] = useStateLab(false);
  const [sort, setSort] = useStateLab<{ key: MembersSortKey; desc: boolean } | null>(null);
  const inFilter = (row: typeof all[number]) => filter === "everyone" ? true : filter === "on_hold" ? row.money?.kind === "on_hold" : row.plan.kind === "paid";
  const rows = all.filter((row) => inFilter(row) && matchesMemberSearch(row, search));
  const chosen = all.filter((row) => selected.has(memberKey(row)));
  const colour = (id: string) => `hsl(${(id.charCodeAt(1) * 47) % 360} 35% 38%)`;
  const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: drawer || open ? "minmax(0,1fr) 380px" : "minmax(0,1fr)" }}>
      <KitApp view="members" host part="main">
        <View index={5}>
          <Top title="Members" titleView={5} />
          <div className={cx("page")} style={{ overflowY: "auto" }}>
            <p className={cx("sub")} style={{ margin: 0 }}>Everyone in Sunrise Climbing Club, what they pay and who needs you.</p>
            <JoinRequestsLine count={requests.length} open={drawer} onOpen={() => { setDrawer(!drawer); setOpen(null); }} />
            <MembersToolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} onExport={() => undefined} exporting={false} canExport
              filters={[{ id: "everyone", label: "Everyone", count: all.length }, { id: "paid", label: "$20 a month", count: all.filter((r) => r.plan.kind === "paid").length },
                { id: "on_hold", label: "On hold", count: 1 }]} />
            <MembersTable rows={sort ? [...rows].sort((a, b) => (sort.desc ? -1 : 1) * a.name.localeCompare(b.name)) : rows} avatarOf={() => null} now={now} timeFor={memberTimeFor} dayFor={shortDay}
              sort={sort} onSort={(key) => setSort((current) => ({ key, desc: current?.key === key ? !current.desc : false }))}
              selected={selected} onToggle={(key) => setSelected((last) => { const next = new Set(last); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
              onToggleAll={() => setSelected((last) => toggleAllShown(last, rows.map(memberKey)))}
              openKey={open} onOpen={(key) => { setOpen(key); setDrawer(false); }} empty={search ? `No one matches "${search}".` : "No one here."}
              getAvatarColor={colour} getInitials={initials} />
            <MembersBulkBar count={chosen.length} onExport={() => undefined} onClear={() => setSelected(new Set())} />
          </div>
        </View>
      </KitApp>
      {drawer ? (
        <KitApp view="members" host part="rail">
          <JoinRequestsDrawer requests={requests} decidingId={null} onApprove={() => undefined} onDecline={() => undefined} onClose={() => setDrawer(false)} getAvatarColor={colour} getInitials={initials} />
        </KitApp>
      ) : open ? (
        <KitApp view="members" host part="rail"><div className={cx("mdrawer")}><header><div><span className={cx("lab")}>Member</span><h2>{all.find((row) => memberKey(row) === open)?.name}</h2></div></header><p className={cx("mnone")} style={{ padding: 0 }}>The member's record opens here.</p></div></KitApp>
      ) : null}
    </div>
  );
}

// Events with made-up dates, in the page's real shell.
// ?as=member  ?empty=1  ?adding=1
function EventsLab() {
  const params = new URLSearchParams(window.location.search);
  const host = params.get("as") !== "member";
  const now = Date.now();
  const H = 3_600_000;
  const ev = (id: string, title: string, inHours: number, extra: Record<string, unknown> = {}) => ({
    id, parent_event_id: id, title, status: "live", starts_at: new Date(now + inHours * H).toISOString(), ends_at: new Date(now + (inHours + 1.25) * H).toISOString(),
    timezone: "America/Los_Angeles", description_md: null, url: null, location_type: "physical", location_label: "Sunrise Bouldering, back board", visibility: "members",
    recurrence_frequency: "none", recurrence_interval: 1, recurrence_until: null, pod_name: null, pod_channel_id: null, ...extra }) as any;
  const upcoming = params.get("empty") ? [] : [
    ev("a", "Tuesday Board Session", 21, { recurrence_frequency: "weekly", description_md: "Warm-up circuit at 5:45, board in pairs from 6:00. Bring tape." }),
    ev("b", "Thursday Hangboard Warm-up", 69, { recurrence_frequency: "weekly", location_type: "online", location_label: "Zoom", url: "https://example.com/call", description_md: "Twenty minutes on the hangboard before work. Have a board or a doorframe edge ready; no weights needed." }),
    ev("c", "Saturday Sunrise Session", 117, { location_label: "Castle Rock trailhead", visibility: "public" }),
    ev("d", "Setters call", 198, { location_type: "online", location_label: null, pod_name: "Setters", pod_channel_id: "p" }),
  ];
  const past = [ev("p1", "Tuesday Board Session", -150), ev("p2", "Saturday Sunrise Session", -220, { location_label: "Castle Rock trailhead" }), ev("p3", "Thursday Hangboard Warm-up", -270, { location_type: "online", location_label: null })];
  const [adding, setAdding] = useStateLab(Boolean(params.get("adding")));
  const [draft, setDraft] = useStateLab<any>({ title: "Friday Fingerboard Clinic", starts_at: "2026-11-20T18:00", ends_at: "2026-11-20T19:00", timezone: "America/Los_Angeles",
    recurrence_frequency: "none", recurrence_until: "", location_type: "physical", location_label: "Sunrise Bouldering, training room", url: "", description_md: "", visibility: "members" });
  const time = (event: any) => ({ primary: `${eventClock(event.starts_at)} – ${eventClock(event.ends_at)}`, secondary: event.id === "b" ? "5:45 am where it is held (Pacific)" : null });
  return (
    <div style={{ height: "100vh", display: "grid" }}>
      <CommunityPageFrame>
        <KitEventsList featured={upcoming[0] ?? null} comingUp={upcoming.slice(1)} past={past} now={now} canManage={host} communityName="Sunrise Climbing Club"
          timeLabel={time} calendarUrl={() => "https://example.com/calendar"} editingId={null}
          form={adding ? <KitEventForm draft={draft} isNew isSeries={false} canBePublic communityName="Sunrise Climbing Club" isSaving={false} error={null}
            timeZones={[{ value: "America/Los_Angeles", label: "Pacific time" }]} onChange={setDraft} onClose={() => setAdding(false)} onSubmit={() => setAdding(false)} /> : null}
          onNew={() => setAdding(true)} onEdit={() => setAdding(true)} onCancel={() => undefined} onSetPublic={() => undefined}
          renderRail={(rail) => <CommunityPageRail label="This event">{rail}</CommunityPageRail>} />
      </CommunityPageFrame>
    </div>
  );
}

// ?scale=1.25 draws the lab larger, to try a size for big monitors.
function labScale(): number {
  if (typeof window === "undefined") return 1;
  const value = Number(new URLSearchParams(window.location.search).get("scale"));
  return Number.isFinite(value) && value >= 0.75 && value <= 2 ? value : 1;
}

export function DesignLab() {
  const page = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("page");
  if (page === "site") return <SiteLab />;
  if (page === "demo") return <SiteDemoLab />;
  if (page === "demo-frame") return <SiteDemoStage />;
  return page === "channel" ? <HostChannel /> : page === "brief" ? <BriefPanels /> : page === "brain" ? <BrainLab /> : page === "events" ? <EventsLab /> : page === "members" ? <MembersLab /> : page === "brain-actions" ? <BrainActionsLab /> : page === "brain-page" ? <BrainPageLab /> : page === "pods-shell" ? <PodsShell /> : page === "know-panel" ? <KnowShell builder={false} /> : page === "know-panel-builder" ? <KnowShell builder /> : page === "pods" ? <PodsPage join={false} /> : page === "home-panel" ? <RealPanels pod={false} /> : page === "pod-panel" ? <RealPanels pod /> : page === "pods-join" ? <PodsPage join /> : <HostHomeQuiet />;
}
