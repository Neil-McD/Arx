import { lazy, Suspense, useContext, useEffect, useRef, useState } from "react";
import type { CommunityAdmissionControl, CommunityJoinRequestReviewProps } from "./communityAdmissionTypes";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import { KitChannelRail, type ChannelPinned } from "../v1/KitChannelRail";
import { KitPodRail, useCloudPod } from "../v1/KitPodRail";
import { KitMembersDirectory } from "../v1/KitMembersDirectory";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { goToMembersPage } from "../../../../shared/routeDetails";

// The host's Members table: only the people who run a community ever open
// it, so it is fetched when they do, not shipped to every member.
const KitMembersPage = lazy(() =>
  import("../v1/KitMembersPage").then((module) => ({ default: module.KitMembersPage })),
);


type RosterProps = {
  memberDetailOpen?: boolean;
  pinned?: (ChannelPinned & { label: string }) | null;
  channelDescription?: string | null;
  isPodRoom?: boolean;
  narrowOpen?: boolean;
  onCloseNarrow?: () => void;
  joinReview?: CommunityJoinRequestReviewProps;
  admission?: CommunityAdmissionControl;
  communityName: string;
  presenceSummary?: CommunityPresenceSummary | null;
  isLoadingPresence?: boolean;
  channelId?: string;
  onOpenProfile?: (id: string) => void;
  onMessageUser?: (id: string) => void;
  currentUserId?: string | null;
  canManageMembers: boolean;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
};

export function ChannelRosterPanel(props: RosterProps) {
  const scope = useContext(CommunityChannelSessionContext);
  const scopeKey = JSON.stringify([
    props.currentUserId,
    resolveAuthSubject(scope?.session as AuthSessionLike),
    scope?.communityId,
  ]);
  return <ChannelRosterWorkspace key={scopeKey} {...props} />;
}

export function shouldRedirectNarrowRosterToMembers(props: {
  narrowOpen?: boolean;
  isPodRoom?: boolean;
}): boolean {
  return Boolean(props.narrowOpen && !props.isPodRoom);
}

function ChannelRosterWorkspace(props: RosterProps) {
  // Members is a page of its own (/c/:slug/members). On an ordinary channel,
  // the people button on a phone goes there; inside a pod room, it opens the
  // pod's own right column (requests, calls, knowledge, members, membership).
  const asksForMembers = shouldRedirectNarrowRosterToMembers(props);
  useEffect(() => {
    if (!asksForMembers) return;
    props.onCloseNarrow?.();
    goToMembersPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asksForMembers]);

  const scope = useContext(CommunityChannelSessionContext);
  const { pod, reload: reloadPod } = useCloudPod(
    scope?.session ?? null,
    scope?.communityId ?? null,
    props.channelId,
  );
  const backRef = useRef<HTMLButtonElement | null>(null);
  const narrowOpen = props.isPodRoom ? Boolean(props.narrowOpen) : false;
  useEffect(() => {
    if (narrowOpen && backRef.current?.getClientRects().length) {
      backRef.current.focus();
    }
  }, [narrowOpen]);

  const isPodRail = Boolean(pod && scope?.communityId);
  const isPodSurface = isPodRail || Boolean(props.isPodRoom);

  return (
    <aside
      className={`community-context-panel channel-roster-panel is-v1 is-kit${isPodSurface ? " is-pod-rail" : ""}`}
      aria-label={isPodSurface ? "About this pod" : "About this channel"}
      style={props.memberDetailOpen ? { display: "none" } : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented && narrowOpen) {
          event.preventDefault();
          props.onCloseNarrow?.();
        }
      }}
    >
      {props.onCloseNarrow ? (
        <div className="channel-people-back">
          <button
            ref={backRef}
            className="back-to-workspace"
            type="button"
            aria-label={isPodSurface ? "Back to pod" : "Back to channel"}
            onClick={props.onCloseNarrow}
          >
            <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          {isPodSurface && pod ? <span className="channel-people-back-title">{pod.name}</span> : null}
        </div>
      ) : null}
      {isPodRail && pod && scope?.communityId ? (
        <KitPodRail
          key={pod.channel_id}
          session={scope.session}
          communityId={scope.communityId}
          pod={pod}
          onChanged={() => void reloadPod()}
        />
      ) : props.isPodRoom ? null : (
        <KitChannelRail
          communityId={scope?.communityId ?? null}
          session={scope?.session ?? null}
          channelId={props.channelId ?? null}
          description={props.channelDescription ?? null}
          pinned={props.pinned ?? null}
          presenceSummary={props.presenceSummary ?? null}
          onOpenMembers={() => goToMembersPage()}
        />
      )}
    </aside>
  );
}

// Design system v1: the Members page itself (WebCommunityMembersPage), with no
// channel around it.
export function CommunityMembersPagePanel(props: RosterProps) {
  const scope = useContext(CommunityChannelSessionContext);
  const scopeKey = JSON.stringify([
    props.currentUserId,
    resolveAuthSubject(scope?.session as AuthSessionLike),
    scope?.communityId,
  ]);
  return <MembersPageSurface key={scopeKey} {...props} />;
}

function MembersPageSurface(props: RosterProps) {
  const [recordEl, setRecordEl] = useState<HTMLElement | null>(null);

  if (props.canManageMembers) {
    return (
      <>
        <Suspense
          fallback={<section className="members-page is-kit" aria-label="Community members" aria-busy="true" />}
        >
          <KitMembersPage
            communityName={props.communityName}
            joinRequests={props.joinReview?.canReviewJoinRequests ? props.joinReview.pendingJoinRequests ?? [] : []}
            decidingJoinRequestId={props.joinReview?.decidingJoinRequestId ?? null}
            onApprove={(id) => void props.joinReview?.onApproveJoinRequest?.(id)}
            onDecline={(id) => void props.joinReview?.onDenyJoinRequest?.(id)}
            onMessage={props.onMessageUser}
            refreshKey={0}
            admission={props.admission}
            currentUserId={props.currentUserId ?? null}
            recordContainer={recordEl}
            getAvatarColor={props.getAvatarColor}
            getInitials={props.getInitials}
          />
        </Suspense>
        <aside ref={setRecordEl} className="community-context-panel members-page-record" aria-label="Member record" />
      </>
    );
  }

  return (
    <>
      <KitMembersDirectory
        onMessage={props.onMessageUser}
        profileContainer={recordEl}
        getAvatarColor={props.getAvatarColor}
        getInitials={props.getInitials}
      />
      <aside ref={setRecordEl} className="community-context-panel members-page-record" aria-label="Member" />
    </>
  );
}
