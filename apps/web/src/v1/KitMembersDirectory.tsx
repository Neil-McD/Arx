// Design system v1: Members for a member, in the mock's markup (docs/design/
// hifi-mock, Members, member view). Who is here and what each person chose to
// share; never plan, payment, notes or where a fact came from (the server
// sends none of it: convex/communityMemberProfiles.ts).
import { Fragment, useContext, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  getCloudCommunityMemberProfile,
  listCloudCommunityMemberDirectory,
  type CloudMemberDirectoryRow,
  type CloudMemberProfile,
} from "../../../../shared/cloudCommunityMemberRecordsGateway";
import { CommunityChannelSessionContext } from "../components/CommunityChannelSessionContext";
import { openGuideFromSearch } from "../components/guideSearch";
import { Btn, cx, Icon, KitApp, Rail, Sep, Sec, Top, View } from "./kit";

type Filter = "everyone" | "here" | "hosts";
const keyOf = (row: { membership_id: string | null }) => row.membership_id ?? "owner";
const roleTag = (role: string) => (role === "owner" ? "host" : role === "admin" ? "admin" : role === "moderator" ? "moderator" : null);

export function memberDirectoryRowsFor(rows: CloudMemberDirectoryRow[], filter: Filter, search: string): CloudMemberDirectoryRow[] {
  const q = search.trim().toLowerCase();
  const listed = rows.filter((row) => (filter === "here" ? row.here_now : filter === "hosts" ? row.role !== "member" : true))
    .filter((row) => !q || [row.name, row.working_on].some((value) => String(value ?? "").toLowerCase().includes(q)));
  // You first, then whoever is here now.
  return [...listed].sort((a, b) => Number(b.you) - Number(a.you) || Number(b.here_now) - Number(a.here_now));
}

function Face(props: { name: string; url: string | null; seed: string; getAvatarColor: (id: string) => string; getInitials: (name: string) => string; style?: CSSProperties }) {
  return (
    <span className={cx("av")} style={props.style}>
      <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={props.name} imageUrl={props.url} alt=""
        fallback={<span>{props.getInitials(props.name)}</span>} fallbackStyle={{ backgroundColor: props.getAvatarColor(props.seed) }} />
    </span>
  );
}

export function KitMembersDirectory(props: {
  onMessage?: (userId: string) => void;
  profileContainer: HTMLElement | null;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
}) {
  const scope = useContext(CommunityChannelSessionContext);
  const [rows, setRows] = useState<CloudMemberDirectoryRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("everyone");
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<CloudMemberProfile | null>(null);

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    listCloudCommunityMemberDirectory({ session: scope.session, communityId: scope.communityId })
      .then((next) => { if (!cancelled) setRows(next); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [scope?.session, scope?.communityId]);

  // The host opens first: the person a newcomer most wants to know.
  useEffect(() => {
    if (!rows || openKey) return;
    const first = rows.find((row) => row.role === "owner") ?? rows[0];
    if (first) setOpenKey(keyOf(first));
  }, [rows, openKey]);

  useEffect(() => {
    if (!scope || !openKey) return;
    let cancelled = false;
    setProfile(null);
    getCloudCommunityMemberProfile({ session: scope.session, communityId: scope.communityId, membershipId: openKey === "owner" ? null : openKey })
      .then((next) => { if (!cancelled) setProfile(next); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [scope?.session, scope?.communityId, openKey]);

  const shown = useMemo(() => (rows ? memberDirectoryRowsFor(rows, filter, search) : []), [rows, filter, search]);
  const hereCount = rows?.filter((row) => row.here_now).length ?? 0;
  const chip = (id: Filter, label: string, count?: number) => (
    <button key={id} type="button" className={cx("chip", filter === id && "sel")} aria-pressed={filter === id} onClick={() => setFilter(id)}>
      {label}{typeof count === "number" ? ` · ${count}` : ""}
    </button>
  );

  const page = (
    <section className="members-page is-kit" aria-label="Community members">
      <KitApp view="members" part="main">
        <View index={5}>
          <Top title={<>Members <small>{rows ? `${rows.length} ${rows.length === 1 ? "person" : "people"}` : ""}</small></>} titleView={5} onSearch={openGuideFromSearch} />
          <div className={cx("page")} style={{ overflowY: "auto" }}>
            <p className={cx("lead")}><span className={cx("aura")}><Icon name="spark" /></span>
              {failed ? "Members couldn't load." : !rows ? " " : hereCount > 1 ? `${hereCount} people are here now.` : "Who's here, and what they're working on."}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 30, flexWrap: "wrap" }}>
              <label className={cx("find")} style={{ margin: 0, width: 240 }}>
                <Icon name="search" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a member" aria-label="Find a member" />
              </label>
              {rows ? <>{chip("everyone", "Everyone", rows.length)}{chip("here", "Here now", hereCount)}{chip("hosts", "Hosts")}</> : null}
            </div>
            <div className={cx("ppl")}>
              {shown.map((row) => (
                <button key={keyOf(row)} type="button" className={cx("p", openKey === keyOf(row) && "sel", row.you && "you")} onClick={() => setOpenKey(keyOf(row))}>
                  <Face name={row.name} url={row.avatar_url} seed={row.user_id} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} />
                  <b>{row.name}{row.you ? <span className={cx("tag")}>you</span> : roleTag(row.role) ? <span className={cx("tag")}>{roleTag(row.role)}</span> : null}</b>
                  <span>{row.you ? "What others see" : row.working_on ?? (row.here_now ? "Here now" : "")}</span>
                </button>
              ))}
            </div>
            {rows && shown.length === 0 ? <p className={cx("none")} style={{ marginTop: 14 }}>No one here.</p> : null}
          </div>
        </View>
      </KitApp>
    </section>
  );

  const rail = (
    <KitApp view="members" part="rail">
      <Rail index={5} label={profile ? profile.name : "Member"}>
        {profile ? <MemberProfileView profile={profile} onMessage={props.onMessage} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} /> : null}
      </Rail>
    </KitApp>
  );
  return <>{page}{props.profileContainer ? createPortal(rail, props.profileContainer) : null}</>;
}

function MemberProfileView(props: { profile: CloudMemberProfile; onMessage?: (userId: string) => void; getAvatarColor: (id: string) => string; getInitials: (name: string) => string }) {
  const { profile } = props;
  const first = profile.name.split(/\s+/)[0] || profile.name;
  const role = profile.role === "owner" ? "host" : profile.role === "member" ? null : profile.role;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Face name={profile.name} url={profile.avatar_url} seed={profile.user_id} getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} style={{ width: 56, height: 56, fontSize: 18 }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.015em" }}>{profile.name} {role ? <span className={cx("tag")} style={{ verticalAlign: "middle" }}>{role}</span> : null}</div>
          <div className={cx("sub")} style={{ marginTop: 2 }}>{profile.you ? "This is what other members see about you" : profile.here_now ? "Here now" : profile.role === "owner" ? "Runs this community" : "Member"}</div>
        </div>
        {!profile.you && props.onMessage ? <div style={{ display: "flex", gap: 8 }}><Btn small go onClick={() => props.onMessage?.(profile.user_id)}>Message</Btn></div> : null}
      </div>
      <Sep />
      {profile.facts.length ? (
        <div className={cx("kv")}>
          {profile.facts.map((fact, index) => <Fragment key={index}><span>{fact.label}</span><p>{fact.body}</p></Fragment>)}
        </div>
      ) : (
        <Sec label="Working on"><p>{profile.you ? "You haven't shared anything yet. Tell your guide what you're working on and it can show here, once you approve it." : `${first} hasn't shared anything yet.`}</p></Sec>
      )}
      {profile.in_common.length ? (
        <>
          <Sep />
          <Sec label="In common with you">
            {profile.in_common.map((text, index) => (
              <div key={index} className={cx("src")} style={index ? { marginTop: -8 } : undefined}><Icon name="users" />{text}<em>you both said</em></div>
            ))}
          </Sec>
        </>
      ) : null}
    </>
  );
}
