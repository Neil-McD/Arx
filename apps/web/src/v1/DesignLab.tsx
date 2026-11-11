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

export function DesignLab() {
  return <HostHomeQuiet />;
}
