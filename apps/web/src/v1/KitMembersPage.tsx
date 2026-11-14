// Design system v1: Members for the people who run the community, in the
// mock's markup (docs/design/hifi-mock, Members). Checked against
// docs/design/members-invariants.md: every way someone is in and at which
// price, who needs the host, who is out and why, and one member's record.
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { createPortal } from "react-dom";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  addCloudCommunityMemberNote,
  deleteCloudCommunityMemberNote,
  compCloudCommunityMember,
  getCloudCommunityMemberRecord,
  getCloudCommunityMemberSummary,
  listCloudCommunityMemberRecordsPage,
  type CloudMemberRecord,
  type CloudMemberRecordRow,
  type CloudMemberSummary,
  type CloudPastMemberRow,
} from "../../../../shared/cloudCommunityMemberRecordsGateway";
import { fetchCloudCommunityMemberBillingHistory, type CloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import { formatPrice } from "../../../../shared/communityMemberRecords";
import { CommunityChannelSessionContext } from "../components/CommunityChannelSessionContext";
import type { CommunityAdmissionJoinRequest } from "../components/CommunityJoinRequestReview";
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
  onManage?: (member: { id: string; user_id: string; display_name: string; avatar_url: string | null; role: string; created_at: string | null }) => void;
  // Bumped after a role change, removal or block: the table and record reload.
  refreshKey?: number;
  currentUserId: string | null;
  recordContainer: HTMLElement | null;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
}) {
  const scope = useContext(CommunityChannelSessionContext);
  const [summary, setSummary] = useState<CloudMemberSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<MembersView>("everyone");
  const [loaded, setLoaded] = useState<{ view: string; rows: CloudMemberRecordRow[]; past: CloudPastMemberRow[]; cursor: string | null; done: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Narrow windows (below 900px) show Members as layers: picking someone
  // replaces the table with their record, with a way back.
  const [picked, setPicked] = useState(false);
  const [record, setRecord] = useState<CloudMemberRecord | null>(null);
  const [recordVersion, setRecordVersion] = useState(0);
  const [tableVersion, setTableVersion] = useState(0);
  const [payments, setPayments] = useState<{ membershipId: string; history: CloudCommunityMemberBillingHistory | null } | null>(null);
  const [now] = useState(Date.now);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  // The counts behind the saved views: true counts, from the server.
  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    setFailed(false);
    getCloudCommunityMemberSummary({ session: scope.session, communityId: scope.communityId })
      .then((next) => { if (!cancelled) setSummary(next); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [scope?.session, scope?.communityId, props.joinRequests.length, props.refreshKey, tableVersion]);

  // The table, a page at a time, for the view chosen.
  // Each reset starts a new generation; an answer from an older one (another
  // view, community or refresh) is dropped, never mixed into the table.
  const generationRef = useRef(0);
  const loadMore = useCallback(async (reset: boolean) => {
    if (!scope || (loadingRef.current && !reset)) return;
    if (reset) generationRef.current += 1;
    const generation = generationRef.current;
    const current = reset ? null : loaded;
    if (current?.done) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await listCloudCommunityMemberRecordsPage({ session: scope.session, communityId: scope.communityId, view, cursor: current?.cursor ?? null });
      if (generation !== generationRef.current) return;
      setLoaded((previous) => {
        const base = reset || previous?.view !== view ? { rows: [], past: [] } : previous!;
        return { view, rows: [...base.rows, ...page.rows], past: [...base.past, ...page.past], cursor: page.continueCursor, done: page.isDone };
      });
    } catch {
      if (generation === generationRef.current) setFailed(true);
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [scope?.session, scope?.communityId, view, loaded]);

  useEffect(() => {
    loadingRef.current = false;
    setLoaded(null);
    void loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.session, scope?.communityId, view, props.joinRequests.length, props.refreshKey, tableVersion]);

  // More as you reach the end of the table; everything while you search.
  useEffect(() => {
    if (!loaded || loaded.done || loading) return;
    if (search.trim()) { void loadMore(false); return; }
    const target = sentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void loadMore(false); }, { rootMargin: "400px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loaded, loading, search, loadMore]);

  // The person who needs the host most opens first: on hold, then cancelling.
  useEffect(() => {
    if (!loaded || openKey || loaded.view !== "everyone") return;
    const first = loaded.rows.find((row) => row.money?.kind === "on_hold") ?? loaded.rows.find((row) => row.money) ?? loaded.rows[0];
    if (first) setOpenKey(keyOf(first));
  }, [loaded, openKey]);

  useEffect(() => {
    if (!scope || !openKey) return;
    let cancelled = false;
    if (!recordVersion && !props.refreshKey) setRecord(null);
    getCloudCommunityMemberRecord({ session: scope.session, communityId: scope.communityId, membershipId: openKey === OWNER_KEY ? null : openKey })
      .then((next) => { if (!cancelled) setRecord(next); })
      .catch(() => { if (!cancelled) setRecord(null); });
    return () => { cancelled = true; };
  }, [scope?.session, scope?.communityId, openKey, recordVersion, props.refreshKey]);

  // Their payments: what the billing history already records.
  const paymentsFor = record?.membership_id ?? null;
  useEffect(() => {
    if (!scope || !paymentsFor) { setPayments(null); return; }
    let cancelled = false;
    fetchCloudCommunityMemberBillingHistory({ session: scope.session, communityId: scope.communityId, membershipId: paymentsFor, limit: 12 })
      .then((history) => { if (!cancelled) setPayments({ membershipId: paymentsFor, history }); })
      .catch(() => { if (!cancelled) setPayments({ membershipId: paymentsFor, history: null }); });
    return () => { cancelled = true; };
  }, [scope?.session, scope?.communityId, paymentsFor, props.refreshKey]);

  const rows = useMemo(() => {
    if (!loaded || loaded.view !== view) return [];
    const q = search.trim().toLowerCase();
    const list = loaded.rows.filter((row) => !q || [row.name, row.handle, row.working_on, row.plan.label].some((v) => String(v ?? "").toLowerCase().includes(q)));
    if (!sort) return list;
    const dir = sort.desc ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sort.key === "name") return dir * a.name.localeCompare(b.name);
      if (sort.key === "plan") return dir * a.plan.label.localeCompare(b.plan.label);
      return dir * String(a.last_active_at ?? "").localeCompare(String(b.last_active_at ?? ""));
    });
  }, [loaded, view, sort, search]);
  const pastRows = loaded && loaded.view === "past" ? loaded.past : [];
  const counts = summary?.counts ?? null;
  const data = summary;
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
    <button type="button" className={cx("th-sort")} onClick={() => setSort((current) => ({ key, desc: current?.key === key ? !current.desc : key === "active" }))}>
      {label}{sort?.key === key ? <Icon name="updown" /> : null}
    </button>
  );
  // Export is everyone in, every page, not just what is loaded.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!scope || exporting) return;
    setExporting(true);
    try {
      const all: CloudMemberRecordRow[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 200; i++) {
        const page: { rows: CloudMemberRecordRow[]; isDone: boolean; continueCursor: string } = await listCloudCommunityMemberRecordsPage({ session: scope.session, communityId: scope.communityId, view: "everyone", cursor });
        all.push(...page.rows);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      const blob = new Blob([csvFor(all)], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${props.communityName.replace(/[^\w-]+/g, "-").toLowerCase() || "members"}-members.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };
  const page = (
    <section className={`members-page is-kit${picked ? " has-picked" : ""}`} aria-label="Community members">
      <KitApp view="members" host part="main">
        <View index={5}>
          {/* One header style everywhere: the title alone (the count is in the left column; On hold is a filter below). */}
          <Top title="Members" titleView={5} />
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
              <button type="button" className={cx("btn sm")} style={{ marginLeft: "auto" }} onClick={() => void exportCsv()} disabled={!summary || exporting}>{exporting ? "Exporting…" : "Export"}</button>
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
            {loaded && view !== "past" ? (
              <div className={cx("tbl")} role="table" aria-label="Members">
                <div className={cx("trow th")} role="row">
                  <span />{header("name", "Member")}<span>Working on</span>{header("plan", "Plan")}{header("active", "Last active")}
                </div>
                {rows.map((row) => (
                  <button key={keyOf(row)} type="button" role="row" className={cx("trow", openKey === keyOf(row) && "sel")} onClick={() => { setOpenKey(keyOf(row)); setPicked(true); }}>
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
                {rows.length === 0 && !loading ? <p className={cx("none")} style={{ padding: "14px 12px" }}>No one here.</p> : null}
              </div>
            ) : null}
            {loaded && view === "past" ? (
              <div className={cx("tbl")} role="table" aria-label="Past members">
                <div className={cx("trow th")} role="row"><span /><span>Member</span><span>What happened</span><span>Was on</span><span>When</span></div>
                {pastRows.map((row) => (
                  <button key={`${row.user_id}:${row.reason}`} type="button" role="row" className={cx("trow", row.membership_id && openKey === row.membership_id && "sel")}
                    onClick={() => { if (!row.membership_id) return; setOpenKey(row.membership_id); setPicked(true); }} disabled={!row.membership_id}>
                    <Face size="s" name={row.name} url={row.avatar_url} seed={row.user_id} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
                    <span><b>{row.name}</b>{row.reason === "blocked" ? <span className={cx("tag hold")}>blocked</span> : null}{row.rejoined ? <span className={cx("tag")}>rejoined before</span> : null}</span>
                    <span>{row.reason_text}</span>
                    <span className={cx(!row.was_on && "none")}>{row.was_on ?? "Never joined"}</span>
                    <span>{memberTimeFor(row.at, now)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
            {loading ? <p className={cx("none")} style={{ marginTop: 14, fontSize: 13 }}>Loading more…</p> : null}
            {summary?.capped ? <p className={cx("none")} style={{ marginTop: 14, fontSize: 13 }}>Counts cover the first 5,000 people.</p> : null}
          </div>
        </View>
      </KitApp>
    </section>
  );

  const recordRail: ReactNode = (
    <KitApp view="members" host part="rail">
      <button type="button" className="members-record-back" onClick={() => setPicked(false)} aria-label="Back to Members">
        <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />Members
      </button>
      <Rail index={5} label={record ? record.name : "Member"}>
        {record ? <MemberRecordView record={record} now={now} self={record.user_id === props.currentUserId}
          onMessage={props.onMessage} onManage={props.onManage} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials}
          onAddNote={async (body) => {
            if (!scope) return;
            await addCloudCommunityMemberNote({ session: scope.session, communityId: scope.communityId, membershipId: record.membership_id, body });
            setRecordVersion((version) => version + 1);
          }}
          payments={payments && payments.membershipId === record.membership_id ? payments.history : null}
          onComp={record.membership_id && record.plan.kind === "free" && !record.out ? async () => {
            if (!scope) return;
            await compCloudCommunityMember({ session: scope.session, communityId: scope.communityId, membershipId: record.membership_id! });
            setRecordVersion((version) => version + 1);
            setTableVersion((version) => version + 1);
          } : undefined}
          onDeleteNote={async (noteId) => {
            if (!scope) return;
            await deleteCloudCommunityMemberNote({ session: scope.session, communityId: scope.communityId, noteId });
            setRecordVersion((version) => version + 1);
          }} /> : null}
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
  onManage?: (member: { id: string; user_id: string; display_name: string; avatar_url: string | null; role: string; created_at: string | null }) => void;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
  onAddNote: (body: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  payments: CloudCommunityMemberBillingHistory | null;
  // Only for someone in for free: comping a paying member is never offered.
  onComp?: () => Promise<void>;
}) {
  const [comping, setComping] = useState(false);
  const { record } = props;
  const manage = () => record.membership_id && props.onManage?.({ id: record.membership_id, user_id: record.user_id, display_name: record.name,
    avatar_url: record.avatar_url, role: record.role, created_at: record.joined_at });
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const saveNote = async () => {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    setNoteError(null);
    try {
      await props.onAddNote(body);
      setDraft("");
    } catch {
      setNoteError("The note couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };
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
            {props.onManage && record.membership_id && !record.out ? <Btn small onClick={manage}>Change role</Btn> : null}
            {props.onComp ? <Btn small onClick={async () => { setComping(true); try { await props.onComp?.(); } finally { setComping(false); } }}>{comping ? "Comping…" : "Comp"}</Btn> : null}
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
      <div className={cx("sec")}>
        <span className={cx("lab")}>Notes<em className={cx("priv")}>Only hosts see these</em></span>
        {record.notes.map((note) => (
          <div key={note.id} className={cx("hnote")}>
            <p>{note.body}</p>
            <span>{note.author === "you" ? "You" : note.author} · {memberTimeFor(note.at, props.now)}
              {note.can_delete ? <button type="button" className={cx("note-del")} onClick={() => void props.onDeleteNote(note.id)}>Delete</button> : null}</span>
          </div>
        ))}
        <form className={cx("note-add")} onSubmit={(event) => { event.preventDefault(); void saveNote(); }}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a note" aria-label="Add a note" rows={draft ? 3 : 1} maxLength={2000}
            onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void saveNote(); } }} />
          {draft.trim() ? <Btn small onClick={() => void saveNote()}>{saving ? "Saving…" : "Save note"}</Btn> : null}
        </form>
        {noteError ? <p className={cx("bad")} role="alert">{noteError}</p> : null}
      </div>
      <Sep />
      {props.payments && props.payments.events.length ? (
        <>
          <Sec label="Payments">
            {props.payments.events.slice(0, 8).map((event, index) => (
              <div key={event.id} className={cx("src")} style={index ? { marginTop: -8 } : undefined}>
                <Icon name="check" />{paymentText(event)}<em>{memberTimeFor(event.occurred_at, props.now)}</em>
              </div>
            ))}
          </Sec>
          <Sep />
        </>
      ) : null}
      <Sec label="So far">
        {record.events.map((event, index) => (
          <div key={index} className={cx("src")} style={index ? { marginTop: -8 } : undefined}>
            <Icon name={event.kind === "joined" ? "users" : "check"} />{event.text}<em>{memberTimeFor(event.at, props.now)}</em>
          </div>
        ))}
        <div className={cx("src")} style={{ marginTop: -8 }}><Icon name="spark" />Last active<em>{memberTimeFor(record.last_active_at, props.now)}</em></div>
      </Sec>
      {props.onManage && record.membership_id && !record.out && !props.self ? (
        <div style={{ marginTop: "auto" }}>
          <button type="button" className={cx("link")} style={{ color: "var(--ink3)" }} onClick={manage}>Remove or block</button>
        </div>
      ) : null}
    </>
  );
}

function FactRow(props: { label: string; body: string; note: string }) {
  return <><span>{props.label}</span><p>{props.body}{props.note ? <em>{props.note}</em> : null}</p></>;
}

type PaymentEvent = CloudCommunityMemberBillingHistory["events"][number];

// One line of the payment history, in plain words.
export function paymentText(event: PaymentEvent): string {
  const amount = typeof event.amount_base_units === "number" && event.currency
    ? `${formatPrice(event.amount_base_units, event.currency, event.currency_decimals ?? 2)}${event.billing_period === "annual" ? " a year" : event.billing_period === "monthly" ? " a month" : ""}`
    : "";
  const status = String(event.status ?? "").toLowerCase();
  const what = status.includes("past_due") || status.includes("failed") ? "Payment failed"
    : status.includes("cancel_at_period_end") || status.includes("cancel_requested") ? "Asked to stop renewing"
      : status.includes("ended") || status.includes("canceled") ? "Subscription ended"
        : status.includes("refund") ? "Refunded"
          : status.includes("dispute") ? "Disputed"
            : event.kind === "checkout" ? "Paid to join"
              : "Subscription active";
  return amount ? `${what} · ${amount}` : what;
}
