// Design system v1: one person's profile, the same wherever a person is
// opened (a name in a channel, the Members page). Who they are, who they are
// here, where else you meet; and, for those who manage members only, a fenced block
// from the person's record. The server decides what each reader gets
// (convex/communityMemberProfiles.ts, convex/communityMemberRecords.ts).
import { ExternalLink, MessageCircle } from "lucide-react";
import { Fragment, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { memberTimeFor } from "./memberTime";
import { readMemberPreviewCommunityId, subscribeMemberPreview } from "../../../../shared/communityMemberPreview";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { memberRoleTag } from "../../../../shared/communityMemberWords";
import { goToHomeDraft } from "../../../../shared/routeDetails";
import { SOCIAL_PROFILE_KINDS, type SocialProfileKind } from "../../../../shared/socialProfileLinks";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { banCloudCommunityMember, fetchCloudCommunityMemberBillingHistory, removeCloudCommunityMember, setCloudCommunityMemberRole, type CloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import { getCloudCommunityMemberJourneyBoard, updateCloudMemberJourneyCard, type CloudMemberJourneyBoard } from "../../../../shared/cloudCommunityMemberJourneyGateway";
import {
  addCloudCommunityMemberNote,
  deleteCloudCommunityMemberNote,
  getCloudCommunityMemberProfile,
  getCloudCommunityMemberRecord,
  type CloudMemberProfile,
  type CloudMemberProfileCommunity,
  type CloudMemberRecord,
} from "../../../../shared/cloudCommunityMemberRecordsGateway";
import { CommunityChannelSessionContext } from "../components/CommunityChannelSessionContext";
import { SocialProfileIcon } from "../components/SocialProfileIcon";
import { cx, KitApp, Rail, Sep } from "./kit";
import { HostMenu, HostPart, HostSummary, useProfileHost, type ProfileHost } from "./KitProfileHost";

type Avatars = { getAvatarColor: (id: string) => string; getInitials: (name: string) => string };
const LINK_LABELS: Record<SocialProfileKind, string> = { youtube: "YouTube", x: "X", instagram: "Instagram" };

// "@maya · here now", with only the parts that exist.
export function profileSubLine(profile: Pick<CloudMemberProfile, "handle" | "here_now" | "you">): string {
  const handle = String(profile.handle ?? "").trim().replace(/^@+/, "");
  return [handle ? `@${handle}` : null, profile.you ? "This is what other members see" : profile.here_now ? "Here now" : null]
    .filter(Boolean).join(" · ");
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

// The profile itself, from what the server sent. `host`: the host's part,
// only ever passed for someone who manages members.
export function KitProfile(props: Avatars & {
  profile: CloudMemberProfile;
  communityName?: string | null;
  // Everything a host sees on top of the profile (one Rashid, everywhere):
  // the summary line under the name and the fenced part below.
  host?: ProfileHost | null;
  now?: number;
  onMessage?: (userId: string, communityId: string | null) => void;
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

      {props.host ? <HostPart host={props.host} now={now} state={hostState} /> : null}
    </div>
  );
}

// The profile of one person in the community on the page, loaded and kept
// current. Nothing shows while it loads; `fallback` shows when the person has
// no profile here (someone who has left). For someone who manages members it
// also loads their record and progress and wires the host's part: the same
// window wherever a person is opened (a name in a channel, a message, the
// Members table, a board card).
export function KitProfileFor(props: Avatars & {
  target: { membershipId: string | null } | { userId: string };
  communityName?: string | null;
  // The community the profile is read in, when it is not the one in the
  // address bar (a conversation from another community): where Home opens.
  communitySlug?: string | null;
  fallback?: ReactNode;
  // Opened from the board: start at their progress.
  focus?: "progress" | null;
  onMessage?: (userId: string, communityId: string | null) => void;
  onLoaded?: (profile: CloudMemberProfile | null) => void;
  // Something the host changed (stage, role, removal): lists elsewhere refresh.
  onChanged?: () => void;
}) {
  const scope = useContext(CommunityChannelSessionContext);
  const session = scope?.session ?? null;
  const communityId = scope?.communityId ?? null;
  const membershipId = "membershipId" in props.target ? props.target.membershipId : null;
  const targetUserId = "userId" in props.target ? props.target.userId : null;
  // undefined: still loading. null: no profile here.
  const [profile, setProfile] = useState<CloudMemberProfile | null | undefined>(undefined);
  const [record, setRecord] = useState<CloudMemberRecord | null>(null);
  const [board, setBoard] = useState<CloudMemberJourneyBoard | null>(null);
  const [payments, setPayments] = useState<CloudCommunityMemberBillingHistory | null>(null);
  const [turn, setTurn] = useState(0);
  // Seeing the community as a member sees it shows no host part, wherever
  // the profile is opened (the page's own switch, or the one kept for this
  // community when it is opened from Inbox).
  const previewing = useSyncExternalStore(subscribeMemberPreview, readMemberPreviewCommunityId, () => null);
  const asMember = Boolean(scope?.memberPreview) || (Boolean(communityId) && previewing === communityId);
  const hostView = Boolean(profile?.viewer_can_manage) && !asMember;
  const { onLoaded, onChanged } = props;

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
    if (!session || !communityId || !recordKey) { setRecord(null); setBoard(null); setPayments(null); return; }
    let live = true;
    void getCloudCommunityMemberRecord({ session, communityId, membershipId: recordKey === "owner" ? null : recordKey })
      .then((next) => { if (live) setRecord(next); })
      .catch(() => { if (live) setRecord(null); });
    // Their progress: the board, for this one card (hosts only, as the board is).
    void getCloudCommunityMemberJourneyBoard({ session, communityId })
      .then((next) => { if (live) setBoard(next); })
      .catch(() => { if (live) setBoard(null); });
    if (recordKey !== "owner") {
      void fetchCloudCommunityMemberBillingHistory({ session, communityId, membershipId: recordKey, limit: 6 })
        .then((next) => { if (live) setPayments(next); })
        .catch(() => { if (live) setPayments(null); });
    }
    return () => { live = false; };
  }, [session, communityId, recordKey, turn]);

  if (profile === undefined) return null;
  if (!profile) return <>{props.fallback ?? null}</>;
  const card = board && profile.membership_id ? board.cards.find((entry) => entry.membership_id === profile.membership_id) ?? null : null;
  const changed = () => { setTurn((value) => value + 1); onChanged?.(); };
  const member = profile.membership_id;
  const host: ProfileHost | null = hostView && record && session && communityId ? {
    record, card, stages: board?.stages ?? null, aiTier: board?.hosted_ai_tier ?? null, agentOn: board?.hosted_agent_on ?? null,
    focus: props.focus ?? null, timeFor: memberTimeFor, payments,
    onUpdateJourney: member ? async (patch) => { await updateCloudMemberJourneyCard({ session, communityId, membershipId: member, ...patch }); changed(); } : undefined,
    onAddNote: async (body) => { await addCloudCommunityMemberNote({ session, communityId, membershipId: member, body }); setTurn((value) => value + 1); },
    onDeleteNote: async (noteId) => { await deleteCloudCommunityMemberNote({ session, communityId, noteId }); setTurn((value) => value + 1); },
    onSetRole: member ? async (role) => { await setCloudCommunityMemberRole({ session, communityId, membershipId: member, role }); changed(); } : undefined,
    onRemove: member ? async () => { await removeCloudCommunityMember({ session, communityId, membershipId: member }); changed(); } : undefined,
    onBlock: member ? async () => { await banCloudCommunityMember({ session, communityId, membershipId: member }); changed(); } : undefined,
    onOpenDraft: () => goToHomeDraft(profile.handle, props.communitySlug ?? null),
  } : null;
  return (
    <KitProfile profile={profile} communityName={props.communityName} host={host}
      getAvatarColor={props.getAvatarColor} getInitials={props.getInitials} onMessage={props.onMessage} />
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
