// Design system v1: one person's profile, the same wherever a person is
// opened (a name in a channel, the Members page). Who they are, who they are
// here, where else you meet; and, for those who manage members only, a fenced block
// from the person's record. The server decides what each reader gets
// (convex/communityMemberProfiles.ts, convex/communityMemberRecords.ts).
import { ExternalLink, Lock, MessageCircle } from "lucide-react";
import { Fragment, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { readMemberPreviewCommunityId, subscribeMemberPreview } from "../../../../shared/communityMemberPreview";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { memberRoleTag } from "../../../../shared/communityMemberWords";
import { goToMembersPage } from "../../../../shared/routeDetails";
import { SOCIAL_PROFILE_KINDS, type SocialProfileKind } from "../../../../shared/socialProfileLinks";
import { UserAvatar } from "../../../../shared/UserAvatar";
import {
  addCloudCommunityMemberNote,
  getCloudCommunityMemberProfile,
  getCloudCommunityMemberRecord,
  type CloudMemberProfile,
  type CloudMemberProfileCommunity,
  type CloudMemberRecord,
} from "../../../../shared/cloudCommunityMemberRecordsGateway";
import { CommunityChannelSessionContext } from "../components/CommunityChannelSessionContext";
import { SocialProfileIcon } from "../components/SocialProfileIcon";
import { Btn, cx, KitApp, Rail, Sep } from "./kit";
import { HostMenu, HostPart, HostSummary, useProfileHost, type ProfileHost } from "./KitProfileHost";

type Avatars = { getAvatarColor: (id: string) => string; getInitials: (name: string) => string };
const LINK_LABELS: Record<SocialProfileKind, string> = { youtube: "YouTube", x: "X", instagram: "Instagram" };

// "@maya · here now", with only the parts that exist.
export function profileSubLine(profile: Pick<CloudMemberProfile, "handle" | "here_now" | "you">): string {
  const handle = String(profile.handle ?? "").trim().replace(/^@+/, "");
  return [handle ? `@${handle}` : null, profile.you ? "This is what other members see" : profile.here_now ? "Here now" : null]
    .filter(Boolean).join(" · ");
}

// A day in the host block: "May 15", with the year once it is not this one.
export function profileDay(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

// When a host last saw them: "Today", "Yesterday", then the day.
export function profileLastHere(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : profileDay(iso, now);
}

function Communities(props: { rows: CloudMemberProfileCommunity[]; note: string }) {
  return (
    <>
      {props.rows.map((row) => (
        <div key={`${props.note}:${row.id}`} className={cx("pfc")}>
          <CommunityAvatar
            className={cx("pfc-i")}
            communityId={row.id}
            name={row.name}
            imageUrl={row.avatar_url}
            focusX={row.avatar_focus_x}
            focusY={row.avatar_focus_y}
            zoom={row.avatar_zoom}
            alt=""
            aria-hidden
          />
          <span className={cx("pfc-n")}>{row.name}</span><em>{props.note}</em>
        </div>
      ))}
    </>
  );
}

function HostBlock(props: { record: CloudMemberRecord; now: number; onAddNote?: (body: string) => Promise<void>; onOpenMembers?: () => void }) {
  const { record } = props;
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const text = body.trim();
    if (!text || !props.onAddNote) return;
    setSaving(true);
    try { await props.onAddNote(text); setBody(""); setWriting(false); } finally { setSaving(false); }
  };
  const rows: Array<[string, string | null]> = [
    ["Plan", [record.plan.label, record.money?.label].filter(Boolean).join(" · ")],
    ["Joined", profileDay(record.joined_at, props.now)],
    ["Last here", profileLastHere(record.last_active_at, props.now)],
  ];
  return (
    <section className={cx("pfhost")} aria-label="Only hosts see this">
      <div className={cx("pfhost-h")}><Lock size={12} strokeWidth={1.8} aria-hidden="true" />Only hosts see this</div>
      <div className={cx("pfkv")}>
        {rows.filter(([, value]) => value).map(([label, value]) => <Fragment key={label}><span>{label}</span><p>{value}</p></Fragment>)}
      </div>
      {record.notes.length ? (
        <div className={cx("pfnotes")}>
          <span className={cx("lab")}>Notes</span>
          {record.notes.slice(0, 3).map((note) => (
            <div key={note.id} className={cx("pfnote")}><p>{note.body}</p><em>{note.author === "you" ? "You" : note.author} · {profileDay(note.at, props.now)}</em></div>
          ))}
        </div>
      ) : null}
      {writing ? (
        <div className={cx("pfwrite")}>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={2000} autoFocus
            aria-label={`A private note about ${record.name}`} placeholder="A private note. Only hosts see it." />
          <div className={cx("acts")}>
            <Btn small go disabled={saving || !body.trim()} onClick={() => { void save(); }}>{saving ? "Saving…" : "Save note"}</Btn>
            <Btn small txt onClick={() => { setWriting(false); setBody(""); }}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <div className={cx("acts")}>
          {props.onAddNote ? <Btn small onClick={() => setWriting(true)}>Add a note</Btn> : null}
          {props.onOpenMembers ? <Btn small onClick={props.onOpenMembers}>Open in Members</Btn> : null}
        </div>
      )}
    </section>
  );
}

// The profile itself, from what the server sent. `record`: the host block,
// only ever passed for someone who manages members.
export function KitProfile(props: Avatars & {
  profile: CloudMemberProfile;
  communityName?: string | null;
  record?: CloudMemberRecord | null;
  // Everything a host sees on top of the profile (one Rashid, everywhere):
  // the summary line under the name and the fenced part below.
  host?: ProfileHost | null;
  now?: number;
  onMessage?: (userId: string, communityId: string | null) => void;
  onAddNote?: (body: string) => Promise<void>;
  onOpenMembers?: () => void;
}) {
  const { profile } = props;
  const now = props.now ?? Date.now();
  const tag = memberRoleTag(profile.role);
  const sub = profileSubLine(profile);
  const links = SOCIAL_PROFILE_KINDS.map((kind) => ({ kind, url: String(profile.links?.[kind] ?? "").trim() })).filter((link) => link.url);
  const canMessage = !profile.you && profile.can_message && Boolean(props.onMessage);
  const here = props.communityName ? `In ${props.communityName}` : "Here";
  const first = profile.name.split(/\s+/)[0] || profile.name;
  const hostState = useProfileHost(props.host);
  return (
    <div className={cx("pf")}>
      <div className={cx("pf-top")}>
        <span className={cx("av", "pf-face")}>
          <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={profile.name} imageUrl={profile.avatar_url} alt=""
            focusX={profile.avatar_focus_x ?? 0.5} focusY={profile.avatar_focus_y ?? 0.5} zoom={profile.avatar_zoom ?? 1}
            fallback={<span>{props.getInitials(profile.name)}</span>} fallbackStyle={{ backgroundColor: props.getAvatarColor(profile.user_id) }} />
          {profile.here_now && !profile.you ? <i role="img" aria-label="Here now" /> : null}
        </span>
        <span className="pf-top-acts">
          {canMessage ? (
            <button type="button" className={cx("pf-msg")} onClick={() => props.onMessage?.(profile.user_id, profile.message_community_id)}>
              <MessageCircle size={15} strokeWidth={1.8} aria-hidden="true" />Message
            </button>
          ) : null}
          {props.host ? <HostMenu host={props.host} state={hostState} self={Boolean(profile.you)} /> : null}
        </span>
      </div>
      <div className={cx("pf-id")}>
        <div className={cx("pf-name")}><b>{profile.name}</b>{tag ? <span className={cx("tag")}>{tag}</span> : null}</div>
        {sub ? <span className={cx("sub")}>{sub}</span> : null}
      </div>
      {props.host ? <HostSummary host={props.host} now={now} state={hostState} /> : null}
      {profile.bio ? <p className={cx("pf-bio")}>{profile.bio}</p> : null}
      {links.length ? (
        <div className={cx("pf-links")}>
          {links.map((link) => (
            <a key={link.kind} href={link.url} target="_blank" rel="noreferrer">
              <SocialProfileIcon kind={link.kind} width={13} height={13} />{LINK_LABELS[link.kind]}<ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : null}

      <Sep />
      <section className={cx("sec")}>
        <span className={cx("lab")}>{here}</span>
        {profile.facts.length ? (
          <div className={cx("pfkv")}>
            {profile.facts.map((fact, index) => <Fragment key={index}><span>{fact.label}</span><p>{fact.body}</p></Fragment>)}
          </div>
        ) : (
          <p className={cx("pf-none")}>{profile.you
            ? "Tell your guide what you're working on and it can show here, once you approve it."
            : `${first} hasn't shared what they're working on yet.`}</p>
        )}
      </section>

      {profile.in_common.length ? (
        <section className={cx("pfcommon")}>
          <span className={cx("lab")}>You both said</span>
          {profile.in_common.map((text, index) => <p key={index}>{text}</p>)}
        </section>
      ) : null}

      {profile.hosts.length || profile.shared.length ? (
        <section className={cx("sec")}>
          <span className={cx("lab")}>Elsewhere</span>
          <Communities rows={profile.hosts} note="hosts" />
          <Communities rows={profile.shared.filter((row) => !profile.hosts.some((host) => host.id === row.id))} note={profile.you ? "member" : "you're both in"} />
        </section>
      ) : null}

      {props.host ? <HostPart host={props.host} now={now} state={hostState} />
        : props.record ? <HostBlock record={props.record} now={now} onAddNote={props.onAddNote} onOpenMembers={props.onOpenMembers} /> : null}
    </div>
  );
}

// The profile of one person in the community on the page, loaded and kept
// current after a note is added. Nothing shows while it loads; `fallback`
// shows when the person has no profile here (someone who has left).
export function KitProfileFor(props: Avatars & {
  target: { membershipId: string | null } | { userId: string };
  communityName?: string | null;
  // The community the profile is read in, when it is not the one in the
  // address bar (a conversation from another community): where Members opens.
  communitySlug?: string | null;
  fallback?: ReactNode;
  onMessage?: (userId: string, communityId: string | null) => void;
  onLoaded?: (profile: CloudMemberProfile | null) => void;
}) {
  const scope = useContext(CommunityChannelSessionContext);
  const session = scope?.session ?? null;
  const communityId = scope?.communityId ?? null;
  const membershipId = "membershipId" in props.target ? props.target.membershipId : null;
  const targetUserId = "userId" in props.target ? props.target.userId : null;
  // undefined: still loading. null: no profile here.
  const [profile, setProfile] = useState<CloudMemberProfile | null | undefined>(undefined);
  const [record, setRecord] = useState<CloudMemberRecord | null>(null);
  const [turn, setTurn] = useState(0);
  // Seeing the community as a member sees it shows no host block, wherever
  // the profile is opened (the page's own switch, or the one kept for this
  // community when it is opened from Inbox).
  const previewing = useSyncExternalStore(subscribeMemberPreview, readMemberPreviewCommunityId, () => null);
  const asMember = Boolean(scope?.memberPreview) || (Boolean(communityId) && previewing === communityId);
  const hostView = Boolean(profile?.viewer_can_manage) && !asMember;
  const { onLoaded } = props;

  useEffect(() => {
    setProfile(undefined);
    setRecord(null);
    if (!session || !communityId) return;
    let live = true;
    void getCloudCommunityMemberProfile({ session, communityId, membershipId, targetUserId })
      .then((next) => { if (live) { setProfile(next); onLoaded?.(next); } })
      .catch(() => { if (live) { setProfile(null); onLoaded?.(null); } });
    return () => { live = false; };
    // onLoaded is the caller's own callback; a new one is not a new person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, communityId, membershipId, targetUserId]);

  const recordKey = hostView && profile ? profile.membership_id ?? "owner" : null;
  useEffect(() => {
    if (!session || !communityId || !recordKey) { setRecord(null); return; }
    let live = true;
    void getCloudCommunityMemberRecord({ session, communityId, membershipId: recordKey === "owner" ? null : recordKey })
      .then((next) => { if (live) setRecord(next); })
      .catch(() => { if (live) setRecord(null); });
    return () => { live = false; };
  }, [session, communityId, recordKey, turn]);

  if (profile === undefined) return null;
  if (!profile) return <>{props.fallback ?? null}</>;
  return (
    <KitProfile profile={profile} communityName={props.communityName} record={hostView ? record : null}
      getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} onMessage={props.onMessage}
      onAddNote={hostView && session && communityId ? async (body) => {
        await addCloudCommunityMemberNote({ session, communityId, membershipId: profile.membership_id, body });
        setTurn((value) => value + 1);
      } : undefined}
      onOpenMembers={hostView ? () => goToMembersPage(profile.membership_id ?? "owner", props.communitySlug ?? null) : undefined} />
  );
}

// The same profile inside the channel's right-hand drawer (which has its own
// "Profile" header and close button).
export function KitProfileDrawer(props: Parameters<typeof KitProfileFor>[0]) {
  return (
    <KitApp view="members" part="rail">
      <Rail index={5} label="Profile" className="kit-profile-drawer">
        <KitProfileFor {...props} />
      </Rail>
    </KitApp>
  );
}
