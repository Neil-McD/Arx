// Design system v1: Members for the people who run the community, in the
// mock's markup (docs/design/hifi-mock, Members). Checked against
// docs/design/members-invariants.md: every way someone is in and at which
// price, who needs the host, who is out and why, and one member's record.
import { useRouteDetail, writeRouteDetail } from "../../../../shared/routeDetails";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveChange } from "../../../../shared/liveQuery";
import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { createPortal } from "react-dom";
import {
  getCloudCommunityMemberSummary,
  listCloudCommunityMemberRecordsPage,
  type CloudMemberRecordRow,
  type CloudMemberSummary,
  type CloudPastMemberRow,
} from "../../../../shared/cloudCommunityMemberRecordsGateway";
import {
  getCloudCommunityMemberJourneyBoard,
  saveCloudCommunityJourneyStages,
  updateCloudMemberJourneyCard,
  type CloudMemberJourneyBoard,
} from "../../../../shared/cloudCommunityMemberJourneyGateway";

const KitMembersBoard = lazy(() =>
  import("./KitMembersBoard").then((module) => ({ default: module.KitMembersBoard })),
);
import { CommunityChannelSessionContext } from "../components/CommunityChannelSessionContext";
import type {
  CommunityAdmissionControl,
  CommunityAdmissionJoinRequest,
} from "../components/communityAdmissionTypes";
import { matchesMemberSearch, memberKey, membersCsv, toggleAllShown } from "../../../../shared/communityMembersTable";
import { cx, KitApp, Rail, Top, View } from "./kit";
import { Face, JoinRequestsDrawer, JoinRequestsLine, MembersBulkBar, MembersTable, MembersToolbar, type MembersFilter, type MembersSortKey } from "./KitMembersTable";
import { TableRowsSkeleton } from "../components/WebLoadingSkeleton";
import { KitProfileFor } from "./KitProfile";

type MembersView = "everyone" | `price:${string}` | "on_hold" | "cancelling" | "know_little" | "past";

const OWNER_KEY = "owner";
const keyOf = memberKey;

import { memberTimeFor, shortDay } from "./memberTime";
export { memberTimeFor, paymentText, shortDay } from "./memberTime";

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
  // Opened from a board card: the profile starts at their progress.
  const [fromBoard, setFromBoard] = useState(false);
  const openRecord = (key: string) => { setFromBoard(false); writeRouteDetail("member", key); };
  const openFromBoard = (key: string) => { setFromBoard(true); writeRouteDetail("member", key); };
  const picked = side !== null;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Another view or community: what was ticked there is let go.
  useEffect(() => { setSelected(new Set()); }, [scope?.communityId, view]);
  useEffect(() => { setSearch(""); }, [scope?.communityId]);
  const [tableVersion, setTableVersion] = useState(0);
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

  // The board, when it is the view (a person's profile loads its own progress).
  const needsBoard = surfaceMode === "board";
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
                  onOpenCard={openFromBoard}
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
                  onSaveStages={async (stages, options) => {
                    if (!scope) return null;
                    const saved = await saveCloudCommunityJourneyStages({
                      session: scope.session,
                      communityId: scope.communityId,
                      stages,
                      ...(options?.autoAdvanceEnabled !== undefined
                        ? { autoAdvanceEnabled: options.autoAdvanceEnabled }
                        : {}),
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
      {/* The same profile as anywhere else a person is opened, with the host's part. */}
      <Rail index={5} label="Profile">
        {openKey ? (
          <KitProfileFor key={openKey} target={{ membershipId: openKey === OWNER_KEY ? null : openKey }}
            focus={fromBoard ? "progress" : null} onMessage={props.onMessage ? (userId) => props.onMessage?.(userId) : undefined}
            onChanged={() => { setBoardVersion((version) => version + 1); setTableVersion((version) => version + 1); }}
            getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
        ) : null}
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


