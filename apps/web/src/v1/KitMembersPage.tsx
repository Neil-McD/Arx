// Design system v1: Members for the people who run the community, in the
// mock's markup (docs/design/hifi-mock, Members). Checked against
// docs/design/members-invariants.md: every way someone is in and at which
// price, who needs the host, who is out and why, and one member's record.
import { useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  getCloudCommunityMemberRecord,
  listCloudCommunityMemberRecords,
  type CloudMemberRecord,
  type CloudMemberRecordRow,
  type CloudMemberRecords,
} from "../../../../shared/cloudCommunityMemberRecordsGateway";
import { CommunityChannelSessionContext } from "../components/CommunityChannelSessionContext";
import type { CommunityAdmissionJoinRequest } from "../components/CommunityJoinRequestReview";
import { openGuideFromSearch } from "../components/guideSearch";
import { Btn, cx, Icon, KitApp, Rail, Sep, Sec, Top, View } from "./kit";

type MembersView = "everyone" | `price:${string}` | "on_hold" | "cancelling" | "comped" | "know_little" | "past";
type SortKey = "name" | "plan" | "active";

const OWNER_KEY = "owner";
const keyOf = (row: { membership_id: string | null }) => row.membership_id ?? OWNER_KEY;

export function memberTimeFor(iso: string | null, now: number): string {
  if (!iso) return "—";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 5) return "Now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  const date = new Date(at);
  if (minutes < 7 * 24 * 60) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function memberRowsForView(data: CloudMemberRecords, view: MembersView): CloudMemberRecordRow[] {
  if (view === "everyone" || view === "past") return data.rows;
  if (view === "on_hold") return data.rows.filter((row) => row.money?.kind === "on_hold");
  if (view === "cancelling") return data.rows.filter((row) => row.money?.kind === "cancelling");
  if (view === "comped") return data.rows.filter((row) => row.plan.kind === "comped");
  if (view === "know_little") return data.rows.filter((row) => !row.working_on);
  const id = view.slice("price:".length);
  return data.rows.filter((row) => row.plan.price_point_id === id);
}

function csvFor(rows: CloudMemberRecordRow[]): string {
  const cell = (value: string | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Handle", "Role", "Plan", "Standing", "Joined", "Last active", "Working on"];
  return [head.map(cell).join(","), ...rows.map((row) => [row.name, row.handle, row.role, row.plan.label, row.money?.label ?? "", row.joined_at, row.last_active_at, row.working_on].map(cell).join(","))].join("\n");
}

function Face(props: { name: string; url: string | null; seed: string; size?: "s"; getAvatarColor: (id: string) => string; getInitials: (name: string) => string; style?: CSSProperties }) {
  return (
    <span className={cx("av", props.size)} style={props.style}>
      <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={props.name} imageUrl={props.url} alt=""
        fallback={<span>{props.getInitials(props.name)}</span>} fallbackStyle={{ backgroundColor: props.getAvatarColor(props.seed) }} />
    </span>
  );
}

const roleTag = (role: string) => (role === "owner" ? "host" : role === "admin" ? "admin" : role === "moderator" ? "moderator" : null);

export function KitMembersPage(props: {
  communityName: string;
  joinRequests: CommunityAdmissionJoinRequest[];
  decidingJoinRequestId: string | null;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onMessage?: (userId: string) => void;
  onManage?: (membershipId: string) => void;
  currentUserId: string | null;
  recordContainer: HTMLElement | null;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
}) {
  const scope = useContext(CommunityChannelSessionContext);
  const [data, setData] = useState<CloudMemberRecords | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<MembersView>("everyone");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "active", desc: true });
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [record, setRecord] = useState<CloudMemberRecord | null>(null);
  const [now] = useState(Date.now);

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    setFailed(false);
    listCloudCommunityMemberRecords({ session: scope.session, communityId: scope.communityId })
      .then((next) => { if (!cancelled) setData(next); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [scope?.session, scope?.communityId, props.joinRequests.length]);

  // The person who needs the host most opens first: on hold, then cancelling.
  useEffect(() => {
    if (!data || openKey) return;
    const first = data.rows.find((row) => row.money?.kind === "on_hold") ?? data.rows.find((row) => row.money) ?? data.rows[0];
    if (first) setOpenKey(keyOf(first));
  }, [data, openKey]);

  useEffect(() => {
    if (!scope || !openKey) return;
    let cancelled = false;
    setRecord(null);
    getCloudCommunityMemberRecord({ session: scope.session, communityId: scope.communityId, membershipId: openKey === OWNER_KEY ? null : openKey })
      .then((next) => { if (!cancelled) setRecord(next); })
      .catch(() => { if (!cancelled) setRecord(null); });
    return () => { cancelled = true; };
  }, [scope?.session, scope?.communityId, openKey]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const list = memberRowsForView(data, view).filter((row) => !q || [row.name, row.handle, row.working_on, row.plan.label].some((v) => String(v ?? "").toLowerCase().includes(q)));
    const dir = sort.desc ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sort.key === "name") return dir * a.name.localeCompare(b.name);
      if (sort.key === "plan") return dir * a.plan.label.localeCompare(b.plan.label);
      return dir * String(a.last_active_at ?? "").localeCompare(String(b.last_active_at ?? ""));
    });
  }, [data, view, sort, search]);

  const counts = data ? {
    everyone: data.rows.length,
    on_hold: data.rows.filter((row) => row.money?.kind === "on_hold").length,
    cancelling: data.rows.filter((row) => row.money?.kind === "cancelling").length,
    comped: data.rows.filter((row) => row.plan.kind === "comped").length,
    know_little: data.rows.filter((row) => !row.working_on).length,
    past: data.past.length,
  } : null;
  const needYou = (counts?.on_hold ?? 0) + (counts?.cancelling ?? 0);
  const waiting = props.joinRequests.length;
  const lead = waiting > 0
    ? (waiting === 1 ? "One person is waiting to join." : `${waiting} people are waiting to join.`)
    : !data ? (failed ? "Members couldn't load." : " ")
      : needYou > 0 ? (needYou === 1 ? "One member needs you." : `${needYou} members need you.`)
        : "Everyone is in good standing.";

  const chip = (id: MembersView, label: string, count: number | null) => (
    <button key={id} type="button" className={cx("chip", view === id && "sel")} aria-pressed={view === id} onClick={() => setView(id)}>
      {label}{count !== null ? ` · ${count}` : ""}
    </button>
  );
  const header = (key: SortKey, label: string) => (
    <button type="button" className={cx("th-sort")} onClick={() => setSort((current) => ({ key, desc: current.key === key ? !current.desc : key === "active" }))}>
      {label}{sort.key === key ? <Icon name="updown" /> : null}
    </button>
  );
  const exportCsv = () => {
    const blob = new Blob([csvFor(data?.rows ?? [])], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${props.communityName.replace(/[^\w-]+/g, "-").toLowerCase() || "members"}-members.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const page = (
    <section className="members-page is-kit" aria-label="Community members">
      <KitApp view="members" host part="main">
        <View index={5}>
          <Top title={<>Members <small>{data ? `${data.rows.length} ${data.rows.length === 1 ? "person" : "people"}` : ""}</small></>} titleView={5} onSearch={openGuideFromSearch} />
          <div className={cx("page")} style={{ overflowY: "auto" }}>
            <p className={cx("lead")}><span className={cx("aura")}><Icon name="spark" /></span>{lead}</p>
            {waiting > 0 ? (
              <div className={cx("list")} style={{ marginTop: 14 }}>
                {props.joinRequests.map((request) => (
                  <div key={request.id} className={cx("mrow")}>
                    <Face name={request.displayName ?? "Someone"} url={request.avatarUrl} seed={request.userId} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
                    <div>
                      <div className={cx("h")}><b>{request.displayName ?? "Someone"}</b><span>Asked {request.createdAtLabel}</span></div>
                      {request.message ? <p>{request.message}</p> : null}
                    </div>
                    <span style={{ display: "flex", gap: 6 }}>
                      <Btn small go onClick={() => props.onApprove(request.id)}>{props.decidingJoinRequestId === request.id ? "…" : "Approve"}</Btn>
                      <button type="button" className={cx("btn sm no")} disabled={props.decidingJoinRequestId === request.id} onClick={() => props.onDecline(request.id)}>Decline</button>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 30 }}>
              <label className={cx("find")} style={{ margin: 0, width: 240 }}>
                <Icon name="search" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a member" aria-label="Find a member" />
              </label>
              <button type="button" className={cx("btn sm")} style={{ marginLeft: "auto" }} onClick={exportCsv} disabled={!data}>Export</button>
            </div>
            {counts && data ? (
              <div className={cx("views")} role="group" aria-label="Show">
                {chip("everyone", "Everyone", counts.everyone)}
                {data.prices.map((price) => chip(`price:${price.price_point_id}`, price.label.replace(" · ", " "), price.count))}
                {counts.on_hold ? chip("on_hold", "On hold", counts.on_hold) : null}
                {counts.cancelling ? chip("cancelling", "Cancelling", counts.cancelling) : null}
                {counts.comped ? chip("comped", "Comped", counts.comped) : null}
                {counts.know_little ? chip("know_little", "Know little", counts.know_little) : null}
                {counts.past ? chip("past", "Past", counts.past) : null}
              </div>
            ) : null}
            {data && view !== "past" ? (
              <div className={cx("tbl")} role="table" aria-label="Members">
                <div className={cx("trow th")} role="row">
                  <span />{header("name", "Member")}<span>Working on</span>{header("plan", "Plan")}{header("active", "Last active")}
                </div>
                {rows.map((row) => (
                  <button key={keyOf(row)} type="button" role="row" className={cx("trow", openKey === keyOf(row) && "sel")} onClick={() => setOpenKey(keyOf(row))}>
                    <Face size="s" name={row.name} url={row.avatar_url} seed={row.user_id} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
                    <span>
                      <b>{row.name}</b>
                      {roleTag(row.role) ? <span className={cx("tag")}>{roleTag(row.role)}</span> : null}
                      {row.money ? <span className={cx("tag", row.money.kind === "on_hold" && "hold")}>{row.money.label}</span> : null}
                    </span>
                    <span className={cx(!row.working_on && "none")}>{row.working_on ?? "Hasn't said yet"}</span>
                    <span>{row.plan.label}</span>
                    <span>{memberTimeFor(row.last_active_at, now)}</span>
                  </button>
                ))}
                {rows.length === 0 ? <p className={cx("none")} style={{ padding: "14px 12px" }}>No one here.</p> : null}
              </div>
            ) : null}
            {data && view === "past" ? (
              <div className={cx("tbl")} role="table" aria-label="Past members">
                <div className={cx("trow th")} role="row"><span /><span>Member</span><span>What happened</span><span>Was on</span><span>When</span></div>
                {data.past.map((row) => (
                  <button key={`${row.user_id}:${row.reason}`} type="button" role="row" className={cx("trow", row.membership_id && openKey === row.membership_id && "sel")}
                    onClick={() => row.membership_id && setOpenKey(row.membership_id)} disabled={!row.membership_id}>
                    <Face size="s" name={row.name} url={row.avatar_url} seed={row.user_id} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
                    <span><b>{row.name}</b>{row.reason === "blocked" ? <span className={cx("tag hold")}>blocked</span> : null}{row.rejoined ? <span className={cx("tag")}>rejoined before</span> : null}</span>
                    <span>{row.reason_text}</span>
                    <span className={cx(!row.was_on && "none")}>{row.was_on ?? "Never joined"}</span>
                    <span>{memberTimeFor(row.at, now)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {data?.capped ? <p className={cx("none")} style={{ marginTop: 14, fontSize: 13 }}>Showing the first 500 people. Paging the full list is on its way.</p> : null}
          </div>
        </View>
      </KitApp>
    </section>
  );

  const recordRail: ReactNode = (
    <KitApp view="members" host part="rail">
      <Rail index={5} label={record ? record.name : "Member"}>
        {record ? <MemberRecordView record={record} now={now} self={record.user_id === props.currentUserId}
          onMessage={props.onMessage} onManage={props.onManage} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} /> : null}
      </Rail>
    </KitApp>
  );

  return <>{page}{props.recordContainer ? createPortal(recordRail, props.recordContainer) : null}</>;
}

function MemberRecordView(props: {
  record: CloudMemberRecord;
  now: number;
  self: boolean;
  onMessage?: (userId: string) => void;
  onManage?: (membershipId: string) => void;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
}) {
  const { record } = props;
  const first = record.name.split(/\s+/)[0] || record.name;
  const joined = record.joined_at ? new Date(record.joined_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;
  const role = record.role === "owner" ? "Host" : record.role === "admin" ? "Admin" : record.role === "moderator" ? "Moderator" : "Member";
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null);
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Face name={record.name} url={record.avatar_url} seed={record.user_id} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials}
          style={{ width: 56, height: 56, fontSize: 18 }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.015em" }}>{record.name}</div>
          <div className={cx("sub")} style={{ marginTop: 2 }}>{record.out ? record.out.text : role}{joined ? ` · joined ${joined}` : ""}</div>
        </div>
        <div className={cx("plan")}>
          <b>{record.plan.label}</b>
          {record.money?.kind === "on_hold" ? <span className={cx("bad")}>Payment on hold{day(record.money.since_at) ? ` since ${day(record.money.since_at)}` : ""}.{record.money.ends_at ? ` Access ends ${day(record.money.ends_at)}.` : ""}</span> : null}
          {record.money?.kind === "cancelling" ? <span>Leaving{record.money.ends_at ? ` on ${day(record.money.ends_at)}` : " at the end of the period"}.</span> : null}
          {record.plan.kind === "comped" ? <span>A host gave {first} access.</span> : null}
        </div>
        {!props.self ? (
          <div style={{ display: "flex", gap: 8 }}>
            {props.onMessage && !record.out ? <Btn small onClick={() => props.onMessage?.(record.user_id)}>Message</Btn> : null}
            {props.onManage && record.membership_id && !record.out ? <Btn small onClick={() => props.onManage?.(record.membership_id!)}>Change role</Btn> : null}
          </div>
        ) : null}
      </div>
      <Sep />
      {record.facts.length ? (
        <div className={cx("kv")}>
          {record.facts.map((fact, index) => (
            <FactRow key={index} label={fact.label} body={fact.body} note={[fact.source, day(fact.at)].filter(Boolean).join(" · ")} />
          ))}
        </div>
      ) : (
        <Sec label="What we know"><p>{props.self ? "You haven't told us about yourself yet." : `${first} hasn't told us anything about themselves yet.`}</p></Sec>
      )}
      <Sep />
      <Sec label="So far">
        {record.events.map((event, index) => (
          <div key={index} className={cx("src")} style={index ? { marginTop: -8 } : undefined}>
            <Icon name={event.kind === "joined" ? "users" : "check"} />{event.text}<em>{memberTimeFor(event.at, props.now)}</em>
          </div>
        ))}
        <div className={cx("src")} style={{ marginTop: -8 }}><Icon name="spark" />Last active<em>{memberTimeFor(record.last_active_at, props.now)}</em></div>
      </Sec>
    </>
  );
}

function FactRow(props: { label: string; body: string; note: string }) {
  return <><span>{props.label}</span><p>{props.body}{props.note ? <em>{props.note}</em> : null}</p></>;
}
