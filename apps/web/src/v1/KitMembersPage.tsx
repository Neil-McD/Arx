// Design system v1: Members for the people who run the community, in the
// mock's markup (docs/design/hifi-mock, Members). Checked against
// docs/design/members-invariants.md: every way someone is in and at which
// price, who needs the host, who is out and why, and one member's record.
import { useRouteDetail, writeRouteDetail } from "../../../../shared/routeDetails";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveChange } from "../../../../shared/liveQuery";
import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { createPortal } from "react-dom";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  addCloudCommunityMemberNote,
  deleteCloudCommunityMemberNote,
  getCloudCommunityMemberRecord,
  getCloudCommunityMemberSummary,
  listCloudCommunityMemberRecordsPage,
  type CloudMemberRecord,
  type CloudMemberRecordRow,
  type CloudMemberSummary,
  type CloudPastMemberRow,
} from "../../../../shared/cloudCommunityMemberRecordsGateway";
import {
  getCloudCommunityMemberJourneyBoard,
  saveCloudCommunityJourneyStages,
  updateCloudMemberJourneyCard,
  type CloudMemberJourneyBoard,
  type CloudMemberJourneyCard,
} from "../../../../shared/cloudCommunityMemberJourneyGateway";
import {
  JOURNEY_CARD_STATUSES,
  JOURNEY_CARD_STATUS_LABELS,
  MAX_FOUNDER_INSTRUCTION_CHARS,
  MAX_OUTCOME_TEXT_CHARS,
  type JourneyCardStatus,
  type JourneyStageDefinition,
} from "../../../../shared/communityMemberJourney";

const KitMembersBoard = lazy(() =>
  import("./KitMembersBoard").then((module) => ({ default: module.KitMembersBoard })),
);
import { fetchCloudCommunityMemberBillingHistory, type CloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import { formatPrice } from "../../../../shared/communityMemberRecords";
import { CommunityChannelSessionContext } from "../components/CommunityChannelSessionContext";
import type {
  CommunityAdmissionControl,
  CommunityAdmissionJoinRequest,
} from "../components/communityAdmissionTypes";
import { matchesMemberSearch, memberKey, membersCsv, toggleAllShown } from "../../../../shared/communityMembersTable";
import { Btn, cx, Icon, KitApp, Rail, Sep, Sec, Top, View } from "./kit";
import { Face, JoinRequestsDrawer, JoinRequestsLine, MembersBulkBar, MembersTable, MembersToolbar, type MembersFilter, type MembersSortKey } from "./KitMembersTable";
import { TableRowsSkeleton } from "../components/WebLoadingSkeleton";

type MembersView = "everyone" | `price:${string}` | "on_hold" | "cancelling" | "know_little" | "past";

const OWNER_KEY = "owner";
const keyOf = memberKey;

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

// "Jun 27", with the year only when it isn't this one.
export function shortDay(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
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
  // Who can join (a free community): shown and changed here by the host.
  admission?: CommunityAdmissionControl;
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
  const routeMembersView = useRouteDetail("membersView");
  const surfaceMode: "table" | "board" = routeMembersView === "board" ? "board" : "table";
  const setSurfaceMode = (next: "table" | "board") =>
    writeRouteDetail("membersView", next === "board" ? "board" : null);
  const [board, setBoard] = useState<CloudMemberJourneyBoard | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardVersion, setBoardVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ view: string; rows: CloudMemberRecordRow[]; past: CloudPastMemberRow[]; cursor: string | null; done: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: MembersSortKey; desc: boolean } | null>(null);
  // What is open beside the table, kept in the address
  // (/members/<membership id>, /members/requests): one member's record, or
  // the people waiting to join. Nothing until the host picks (in a narrow
  // window it takes the table's place, with a way back). Opening one is a
  // step the back button returns from.
  const routeMember = useRouteDetail("member");
  const side: "record" | "requests" | null = routeMember === "requests" ? "requests" : routeMember ? "record" : null;
  const openKey = routeMember && routeMember !== "requests" ? routeMember : null;
  const setSide = (next: "record" | "requests" | null) =>
    writeRouteDetail("member", next === "requests" ? "requests" : next === "record" ? openKey : null);
  const openRecord = (key: string) => writeRouteDetail("member", key);
  const picked = side !== null;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Another view or community: what was ticked there is let go.
  useEffect(() => { setSelected(new Set()); }, [scope?.communityId, view]);
  useEffect(() => { setSearch(""); }, [scope?.communityId]);
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
  }, [scope?.session, scope?.communityId, view]);
  // A change (yours, another host's, someone asking to join) loads the table
  // again in place: the rows stay on screen until the new ones arrive.
  const changeSeen = useRef(false);
  useEffect(() => {
    if (!changeSeen.current) { changeSeen.current = true; return; }
    loadingRef.current = false;
    void loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.joinRequests.length, props.refreshKey, tableVersion]);
  // Live (shared/liveQuery.ts): the counts change when someone joins, leaves
  // or changes plan, and the table follows. (The table's own read includes
  // each person's last-seen time, which changes every 30 seconds, so it is
  // the counts that are watched.)
  const subject = scope?.session ? resolveAuthSubject(scope.session as AuthSessionLike) : null;
  useLiveChange(scope?.session ?? null, "communityMemberRecords:getCommunityMemberSummary",
    subject && scope ? { authSubject: subject, communityId: scope.communityId } : null,
    () => setTableVersion((version) => version + 1));

  // More as you reach the end of the table.
  useEffect(() => {
    if (!loaded || loaded.done || loading) return;
    const target = sentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void loadMore(false); }, { rootMargin: "400px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loaded, loading, loadMore]);

  // A search looks through everyone, so the rest of the list is fetched.
  useEffect(() => {
    if (search.trim() && loaded && !loaded.done && !loading) void loadMore(false);
  }, [search, loaded, loading, loadMore]);

  // Load Member Journey Board when Board view or an active member record is open.
  const needsBoard = surfaceMode === "board" || Boolean(openKey && openKey !== OWNER_KEY);
  useEffect(() => {
    if (!scope || !needsBoard) return;
    let cancelled = false;
    setBoardLoading(true);
    setBoardError(null);
    getCloudCommunityMemberJourneyBoard({ session: scope.session, communityId: scope.communityId })
      .then((next) => { if (!cancelled) setBoard(next); })
      .catch(() => { if (!cancelled) setBoardError("Member board couldn't load. Try again."); })
      .finally(() => { if (!cancelled) setBoardLoading(false); });
    return () => { cancelled = true; };
  }, [scope?.session, scope?.communityId, needsBoard, boardVersion, props.refreshKey, tableVersion]);

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
    const list = search.trim() ? loaded.rows.filter((row) => matchesMemberSearch(row, search)) : loaded.rows;
    if (!sort) return list;
    const dir = sort.desc ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sort.key === "name") return dir * a.name.localeCompare(b.name);
      if (sort.key === "plan") return dir * a.plan.label.localeCompare(b.plan.label);
      if (sort.key === "joined") return dir * String(a.joined_at ?? "").localeCompare(String(b.joined_at ?? ""));
      return dir * String(a.last_active_at ?? "").localeCompare(String(b.last_active_at ?? ""));
    });
  }, [loaded, view, sort, search]);
  const pastRows = loaded && loaded.view === "past" ? loaded.past : [];
  const counts = summary?.counts ?? null;
  const data = summary;
  const waiting = props.joinRequests.length;
  // The status filter: the saved views, with their true counts.
  const filters: MembersFilter[] = counts && data ? [
    { id: "everyone", label: "Everyone", count: counts.everyone },
    ...data.prices.map((price) => ({ id: `price:${price.price_point_id}`, label: price.label.replace(" · ", " "), count: price.count })),
    ...(counts.on_hold ? [{ id: "on_hold", label: "On hold", count: counts.on_hold }] : []),
    ...(counts.cancelling ? [{ id: "cancelling", label: "Cancelling", count: counts.cancelling }] : []),
    // A filter that would show everyone filters nothing, so it isn't offered.
    ...(counts.know_little && (counts.know_little < counts.everyone || view === "know_little") ? [{ id: "know_little", label: "Know little", count: counts.know_little }] : []),
    ...(counts.past ? [{ id: "past", label: "Past", count: counts.past }] : []),
  ] : [{ id: "everyone", label: "Everyone", count: null }];
  const loadError = !data && failed ? "Members couldn't load." : null;
  const chosen = loaded && loaded.view === view ? loaded.rows.filter((row) => selected.has(keyOf(row))) : [];
  const download = (csv: string, suffix: string) => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${props.communityName.replace(/[^\w-]+/g, "-").toLowerCase() || "members"}-${suffix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
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
      download(membersCsv(all), "members");
    } finally {
      setExporting(false);
    }
  };
  const modeToggle = (
    <div className={cx("seg")} role="tablist" aria-label="Members view">
      <button
        type="button"
        role="tab"
        aria-selected={surfaceMode === "table"}
        className={cx(surfaceMode === "table" ? "on" : "")}
        onClick={() => setSurfaceMode("table")}
      >
        Table
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={surfaceMode === "board"}
        className={cx(surfaceMode === "board" ? "on" : "")}
        onClick={() => setSurfaceMode("board")}
      >
        Board
      </button>
    </div>
  );

  const page = (
    <section className={`members-page is-kit${picked ? " has-picked" : ""}`} aria-label="Community members">
      <KitApp view="members" host part="main">
        <View index={5}>
          {/* One header style everywhere: the title plus the Table/Board switch. */}
          <Top title="Members" titleView={5} actions={modeToggle} />
          <div
            className={cx("page")}
            style={
              surfaceMode === "board"
                ? {
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }
                : { minWidth: 0, overflowY: "auto" }
            }
          >
            {loadError ? <p className={cx("sub")} style={{ margin: "0 0 8px" }}>{loadError}</p> : null}
            <JoinRequestsLine count={waiting} open={side === "requests"} onOpen={() => setSide(side === "requests" ? null : "requests")} />
            {surfaceMode === "board" ? (
              <Suspense fallback={<p className={cx("sub")} style={{ marginTop: 18 }}>Loading member board…</p>}>
                <KitMembersBoard
                  board={board}
                  loading={boardLoading}
                  error={boardError}
                  search={search}
                  onSearch={setSearch}
                  openKey={side === "record" ? openKey : null}
                  now={now}
                  timeFor={memberTimeFor}
                  onOpenCard={openRecord}
                  onMoveCard={async (membershipId, stageKey) => {
                    if (!scope) return;
                    await updateCloudMemberJourneyCard({
                      session: scope.session,
                      communityId: scope.communityId,
                      membershipId,
                      stageKey,
                    });
                    setBoardVersion((version) => version + 1);
                  }}
                  onSaveStages={async (stages) => {
                    if (!scope) return null;
                    const saved = await saveCloudCommunityJourneyStages({
                      session: scope.session,
                      communityId: scope.communityId,
                      stages,
                    });
                    setBoard((prev) =>
                      prev
                        ? {
                            ...prev,
                            stages: saved.stages,
                            auto_advance_enabled: saved.auto_advance_enabled,
                          }
                        : prev,
                    );
                    setBoardVersion((version) => version + 1);
                    return saved.stages;
                  }}
                  getAvatarColor={props.getAvatarColor}
                  getInitials={props.getInitials}
                />
              </Suspense>
            ) : (
            <>
            <MembersToolbar search={search} onSearch={setSearch} filters={filters} filter={view} onFilter={(id) => setView(id as MembersView)}
              admission={props.admission} waiting={waiting}
              onExport={() => void exportCsv()} exporting={exporting} canExport={Boolean(summary)} />
            {(!loaded && loading) || (loaded && view !== "past" && loading && rows.length === 0) ? (
              <TableRowsSkeleton />
            ) : loaded && view !== "past" ? (
              <MembersTable rows={rows} avatarOf={(row) => (row as CloudMemberRecordRow).avatar_url} now={now} timeFor={memberTimeFor} dayFor={shortDay}
                sort={sort} onSort={(key) => setSort((current) => ({ key, desc: current?.key === key ? !current.desc : key === "active" || key === "joined" }))}
                selected={selected} onToggle={(key) => setSelected((last) => { const next = new Set(last); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                onToggleAll={() => setSelected((last) => toggleAllShown(last, rows.map(keyOf)))}
                openKey={side === "record" ? openKey : null} onOpen={openRecord}
                empty={search.trim() ? `No one matches "${search.trim()}".` : "No one here."}
                getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
            ) : null}
            {loaded && view === "past" ? (
              <div className={cx("tbl mpast")} role="table" aria-label="Past members">
                <div className={cx("trow th")} role="row"><span /><span>Member</span><span>What happened</span><span>Was on</span><span>When</span></div>
                {(search.trim() ? pastRows.filter((row) => matchesMemberSearch({ name: row.name, handle: null }, search)) : pastRows).map((row) => (
                  <button key={`${row.user_id}:${row.reason}`} type="button" role="row" className={cx("trow", row.membership_id && openKey === row.membership_id && "sel")}
                    onClick={() => { if (!row.membership_id) return; openRecord(row.membership_id); }} disabled={!row.membership_id}>
                    <Face size="s" name={row.name} url={row.avatar_url}
                      focusX={row.avatar_focus_x} focusY={row.avatar_focus_y} zoom={row.avatar_zoom}
                      seed={row.user_id} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
                    <span><b>{row.name}</b>{row.reason === "blocked" ? <span className={cx("tag hold")}>blocked</span> : null}{row.rejoined ? <span className={cx("tag")}>rejoined before</span> : null}</span>
                    <span>{row.reason_text}</span>
                    <span className={cx(!row.was_on && "none")}>{row.was_on ?? "Never joined"}</span>
                    <span>{memberTimeFor(row.at, now)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {view !== "past" ? (
              <MembersBulkBar count={chosen.length} onExport={() => download(membersCsv(chosen), "selected")} onClear={() => setSelected(new Set())} />
            ) : null}
            <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
            {loading && rows.length > 0 ? <p className={cx("none")} style={{ marginTop: 14, fontSize: 13 }}>Loading more…</p> : null}
            {summary?.capped ? <p className={cx("none")} style={{ marginTop: 14, fontSize: 13 }}>Counts cover the first 5,000 people.</p> : null}
            </>
            )}
          </div>
        </View>
      </KitApp>
    </section>
  );

  const recordRail: ReactNode = side === "requests" ? (
    <KitApp view="members" host part="rail">
      <button type="button" className="members-record-back" onClick={() => setSide(null)} aria-label="Back to Members">
        <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />Members
      </button>
      <JoinRequestsDrawer requests={props.joinRequests} decidingId={props.decidingJoinRequestId} onApprove={props.onApprove} onDecline={props.onDecline}
        onClose={() => setSide(null)} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
    </KitApp>
  ) : (
    <KitApp view="members" host part="rail">
      <button type="button" className="members-record-back" onClick={() => setSide(null)} aria-label="Back to Members">
        <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />Members
      </button>
      <button type="button" className="members-record-close" onClick={() => setSide(null)} aria-label="Close">×</button>
      <Rail index={5} label={record ? record.name : "Member"}>
        {record ? <MemberRecordView record={record} now={now} self={record.user_id === props.currentUserId}
          onMessage={props.onMessage} onManage={props.onManage} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials}
          journeyStages={board?.stages ?? null}
          journeyCard={record.membership_id ? board?.cards.find((card) => card.membership_id === record.membership_id) ?? null : null}
          onUpdateJourney={record.membership_id && !record.out ? async (patch) => {
            if (!scope || !record.membership_id) return;
            await updateCloudMemberJourneyCard({
              session: scope.session,
              communityId: scope.communityId,
              membershipId: record.membership_id,
              ...patch,
            });
            setBoardVersion((version) => version + 1);
          } : undefined}
          onAddNote={async (body) => {
            if (!scope) return;
            await addCloudCommunityMemberNote({ session: scope.session, communityId: scope.communityId, membershipId: record.membership_id, body });
            setRecordVersion((version) => version + 1);
          }}
          payments={payments && payments.membershipId === record.membership_id ? payments.history : null}
          onDeleteNote={async (noteId) => {
            if (!scope) return;
            await deleteCloudCommunityMemberNote({ session: scope.session, communityId: scope.communityId, noteId });
            setRecordVersion((version) => version + 1);
          }} /> : null}
      </Rail>
    </KitApp>
  );

  // Escape puts down whoever is open.
  useEffect(() => {
    if (!side) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) setSide(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [side]);
  return <>{page}{props.recordContainer && side ? createPortal(recordRail, props.recordContainer) : null}</>;
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
  journeyStages?: JourneyStageDefinition[] | null;
  journeyCard?: CloudMemberJourneyCard | null;
  onUpdateJourney?: (patch: {
    stageKey?: string;
    statusOverride?: JourneyCardStatus | "auto";
    founderInstruction?: string | null;
    toggleMilestone?: { key: string; label?: string; completed: boolean };
    addOutcomeText?: string;
    removeOutcomeId?: string;
  }) => Promise<void>;
}) {
  const { record } = props;
  const manage = () => record.membership_id && props.onManage?.({ id: record.membership_id, user_id: record.user_id, display_name: record.name,
    avatar_url: record.avatar_url, role: record.role, created_at: record.joined_at });
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [instructionDraft, setInstructionDraft] = useState(props.journeyCard?.founder_instruction ?? "");
  const [outcomeDraft, setOutcomeDraft] = useState("");
  const [savingJourney, setSavingJourney] = useState(false);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  useEffect(() => {
    setInstructionDraft(props.journeyCard?.founder_instruction ?? "");
    setOutcomeDraft("");
    setJourneyError(null);
  }, [record.membership_id, props.journeyCard?.founder_instruction]);
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
  const joined = shortDay(record.joined_at, props.now);
  const role = record.role === "owner" ? "Host" : record.role === "admin" ? "Admin" : record.role === "moderator" ? "Moderator" : "Member";
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null);
  // Who they are in one line: "Member · Free · joined Jun 27".
  const who = [record.out ? record.out.text : role, record.plan.kind === "owner" ? null : record.plan.label, joined ? `joined ${joined}` : null].filter(Boolean).join(" · ");
  // When they joined is already in that line; the rest of the trail is drawn.
  const trail = record.events.filter((event) => event.kind !== "joined");
  const canManage = Boolean(props.onManage && record.membership_id && !record.out);
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Face name={record.name} url={record.avatar_url}
            focusX={record.avatar_focus_x} focusY={record.avatar_focus_y} zoom={record.avatar_zoom}
            seed={record.user_id} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials}
            style={{ width: 44, height: 44, fontSize: 15, flex: "none" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{record.name}</div>
            <div className={cx("sub")} style={{ fontSize: 12.5 }}>{who}</div>
          </div>
        </div>
        {/* Only when something about their access needs the host. */}
        {record.money ? (
          <div className={cx("plan")}>
            {record.money?.kind === "on_hold" ? <b className={cx("bad")}>Payment on hold{day(record.money.since_at) ? ` since ${day(record.money.since_at)}` : ""}.{record.money.ends_at ? ` Access ends ${day(record.money.ends_at)}.` : ""}</b> : null}
            {record.money?.kind === "cancelling" ? <b>Leaving{record.money.ends_at ? ` on ${day(record.money.ends_at)}` : " at the end of the period"}.</b> : null}
          </div>
        ) : null}
        {!props.self && ((props.onMessage && !record.out) || canManage) ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {props.onMessage && !record.out ? <Btn small go onClick={() => props.onMessage?.(record.user_id)}>Message</Btn> : null}
            {/* One way into the one place a role is changed and someone is removed or blocked. */}
            {canManage ? (
              <button type="button" className={cx("btn sm")} style={{ marginLeft: "auto" }} aria-label={`Change ${first}'s role, remove or block`} title="Change role, remove or block" onClick={manage}>
                Manage<Icon name="more" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* What they said. With nothing said, nothing is drawn. */}
      {record.facts.length ? (
        <>
          <Sep />
          <div className={cx("kv")}>
            {record.facts.map((fact, index) => (
              <FactRow key={index} label={fact.label} body={fact.body} note={[fact.source, day(fact.at)].filter(Boolean).join(" · ")} />
            ))}
          </div>
        </>
      ) : null}
      <Sep />
      <Sec label="Here">
        <div className={cx("src")}><Icon name="spark" />Last active<em>{memberTimeFor(record.last_active_at, props.now)}</em></div>
        {trail.map((event, index) => (
          <div key={index} className={cx("src")} style={{ marginTop: -8 }}>
            <Icon name="check" />{event.text}<em>{memberTimeFor(event.at, props.now)}</em>
          </div>
        ))}
      </Sec>
      {props.payments && props.payments.events.length ? (
        <>
          <Sep />
          <Sec label="Payments">
            {props.payments.events.slice(0, 8).map((event, index) => (
              <div key={event.id} className={cx("src")} style={index ? { marginTop: -8 } : undefined}>
                <Icon name="check" />{paymentText(event)}<em>{memberTimeFor(event.occurred_at, props.now)}</em>
              </div>
            ))}
          </Sec>
        </>
      ) : null}
      {props.onUpdateJourney && props.journeyStages && props.journeyCard ? (
        <>
          <Sep />
          <div className={cx("sec")}>
            <span className={cx("lab")}>Journey<em className={cx("priv")}>Steers your Guide</em></span>
            <div className="members-journey-record-grid">
              <div className="members-journey-field">
                <label htmlFor="member-journey-stage">Stage</label>
                <select
                  id="member-journey-stage"
                  value={props.journeyCard.stage_key}
                  disabled={savingJourney}
                  onChange={(event) => {
                    const nextStageKey = event.target.value;
                    setSavingJourney(true);
                    setJourneyError(null);
                    void props.onUpdateJourney?.({ stageKey: nextStageKey })
                      .catch(() => setJourneyError("Couldn't update stage."))
                      .finally(() => setSavingJourney(false));
                  }}
                >
                  {props.journeyStages.map((stage) => (
                    <option key={stage.key} value={stage.key}>{stage.name}</option>
                  ))}
                </select>
              </div>
              <div className="members-journey-field">
                <label htmlFor="member-journey-status">Status</label>
                <select
                  id="member-journey-status"
                  value={props.journeyCard.status_is_manual ? props.journeyCard.status : "auto"}
                  disabled={savingJourney}
                  onChange={(event) => {
                    const nextStatus = event.target.value as JourneyCardStatus | "auto";
                    setSavingJourney(true);
                    setJourneyError(null);
                    void props.onUpdateJourney?.({ statusOverride: nextStatus })
                      .catch(() => setJourneyError("Couldn't update status."))
                      .finally(() => setSavingJourney(false));
                  }}
                >
                  <option value="auto">Auto ({JOURNEY_CARD_STATUS_LABELS[props.journeyCard.status]})</option>
                  {JOURNEY_CARD_STATUSES.map((status) => (
                    <option key={status} value={status}>{JOURNEY_CARD_STATUS_LABELS[status]}</option>
                  ))}
                </select>
              </div>
            </div>
            {props.journeyCard.checkpoints.length > 0 ? (
              <div className="members-journey-checklist" aria-label="Stage checkpoints">
                <span className="members-board-stage-cp-label">
                  Stage checkpoints ({props.journeyCard.checkpoints_done}/{props.journeyCard.checkpoints_total})
                </span>
                {props.journeyCard.checkpoints.map((cp) => (
                  <button
                    key={cp.key}
                    type="button"
                    disabled={savingJourney || cp.auto}
                    className={`members-journey-check-item${cp.done ? " is-done" : ""}`}
                    onClick={() => {
                      if (cp.auto || savingJourney) return;
                      setSavingJourney(true);
                      setJourneyError(null);
                      void props.onUpdateJourney?.({
                        toggleMilestone: { key: cp.key, label: cp.label, completed: !cp.done },
                      })
                        .catch(() => setJourneyError("Couldn't update checkpoint."))
                        .finally(() => setSavingJourney(false));
                    }}
                  >
                    <span>{cp.done ? "✓ " : "○ "}{cp.label}</span>
                    <em>{cp.auto ? "Auto" : cp.done ? "Done" : "Mark done"}</em>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="members-journey-outcomes">
              <span className="members-board-stage-cp-label">Wins & outcomes</span>
              <form
                className="members-journey-outcome-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = outcomeDraft.trim();
                  if (!text || savingJourney) return;
                  setSavingJourney(true);
                  setJourneyError(null);
                  void props.onUpdateJourney?.({ addOutcomeText: text })
                    .then(() => setOutcomeDraft(""))
                    .catch(() => setJourneyError("Couldn't log win."))
                    .finally(() => setSavingJourney(false));
                }}
              >
                <input
                  value={outcomeDraft}
                  maxLength={MAX_OUTCOME_TEXT_CHARS}
                  placeholder="Log a win or milestone…"
                  aria-label="Log a member win or outcome"
                  onChange={(event) => setOutcomeDraft(event.target.value)}
                />
                <Btn small go disabled={savingJourney || !outcomeDraft.trim()} onClick={() => {
                  const text = outcomeDraft.trim();
                  if (!text || savingJourney) return;
                  setSavingJourney(true);
                  setJourneyError(null);
                  void props.onUpdateJourney?.({ addOutcomeText: text })
                    .then(() => setOutcomeDraft(""))
                    .catch(() => setJourneyError("Couldn't log win."))
                    .finally(() => setSavingJourney(false));
                }}>
                  Log
                </Btn>
              </form>
              {props.journeyCard.outcomes.map((item) => (
                <div key={item.id} className="members-journey-outcome-row">
                  <span>{item.text}</span>
                  <em>{shortDay(item.at, props.now) ?? memberTimeFor(item.at, props.now)}</em>
                  <button
                    type="button"
                    aria-label={`Remove win ${item.text}`}
                    disabled={savingJourney}
                    onClick={() => {
                      if (savingJourney) return;
                      setSavingJourney(true);
                      setJourneyError(null);
                      void props.onUpdateJourney?.({ removeOutcomeId: item.id })
                        .catch(() => setJourneyError("Couldn't remove win."))
                        .finally(() => setSavingJourney(false));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="members-journey-field" style={{ marginTop: 10 }}>
              <label htmlFor="member-journey-instruction">Instruction for your Guide</label>
              <textarea
                id="member-journey-instruction"
                value={instructionDraft}
                maxLength={MAX_FOUNDER_INSTRUCTION_CHARS}
                placeholder="e.g. Check if they finished onboarding, or pause nudges this week"
                onChange={(event) => setInstructionDraft(event.target.value)}
              />
            </div>
            {instructionDraft.trim() !== (props.journeyCard.founder_instruction ?? "") ? (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <Btn
                  small
                  go
                  onClick={() => {
                    if (savingJourney) return;
                    setSavingJourney(true);
                    setJourneyError(null);
                    void props.onUpdateJourney?.({ founderInstruction: instructionDraft.trim() })
                      .catch(() => setJourneyError("Couldn't save instruction."))
                      .finally(() => setSavingJourney(false));
                  }}
                >
                  {savingJourney ? "Saving…" : "Save instruction"}
                </Btn>
                {props.journeyCard.founder_instruction ? (
                  <Btn
                    small
                    onClick={() => {
                      if (savingJourney) return;
                      setSavingJourney(true);
                      setJourneyError(null);
                      void props.onUpdateJourney?.({ founderInstruction: "" })
                        .then(() => setInstructionDraft(""))
                        .catch(() => setJourneyError("Couldn't clear instruction."))
                        .finally(() => setSavingJourney(false));
                    }}
                  >
                    Clear
                  </Btn>
                ) : null}
              </div>
            ) : null}
            {props.journeyCard.agent_outcome ? (
              <p className={cx("sub")} style={{ margin: "6px 0 0", fontSize: 12 }}>
                {props.journeyCard.agent_outcome}
                {props.journeyCard.agent_outcome_at ? ` · ${memberTimeFor(props.journeyCard.agent_outcome_at, props.now)}` : ""}
              </p>
            ) : null}
            {journeyError ? <p className={cx("bad")} role="alert" style={{ margin: "4px 0 0", fontSize: 12 }}>{journeyError}</p> : null}
          </div>
        </>
      ) : null}
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
