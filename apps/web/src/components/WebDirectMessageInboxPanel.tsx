import { Bell, BellOff, MessageCircle, Search, UsersRound } from "lucide-react";
import { formatRelativeTimeFromIso } from "../../../../shared/contentFormatting";
import { PremiumMemberBadge } from "../../../../shared/PremiumMemberBadge";
import type {
  DirectMessageConversation,
  DirectMessageNetworkPerson,
  DirectMessageParticipant,
} from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";

type WebDirectMessageInboxPanelProps = {
  conversations: DirectMessageConversation[];
  isLoading: boolean;
  error: string | null;
  searchValue: string;
  people: DirectMessageNetworkPerson[];
  isLoadingPeople: boolean;
  peopleError: string | null;
  sourceCommunityCount: number | null;
  hasMorePeople?: boolean;
  onLoadMorePeople?: () => void | Promise<void>;
  peerPresenceByUserId?: Record<string, string | null>;
  notificationsState?: "hidden" | "on" | "off" | "blocked";
  onToggleNotifications?: () => void;
  canBrowsePeople: boolean;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  onSearchValueChange: (value: string) => void;
  onSelectConversation: (conversation: DirectMessageConversation) => void;
  onSelectPerson: (person: DirectMessageNetworkPerson) => void | Promise<void>;
};

const ACTIVE_NOW_WINDOW_MS = 5 * 60 * 1000;

function resolveDirectMessagePeer(
  conversation: DirectMessageConversation,
  sessionUserId: string | null,
): DirectMessageParticipant | null {
  const activeParticipants = conversation.participants.filter((participant) => participant.status === "active");
  return (
    activeParticipants.find(
      (participant) => participant.participant_type === "user" && participant.user_id !== sessionUserId,
    ) ??
    activeParticipants.find((participant) => participant.participant_type === "user") ??
    activeParticipants[0] ??
    null
  );
}

function formatInboxTime(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return formatRelativeTimeFromIso(normalized);
}

function isActiveNow(lastActiveAt: string | null): boolean {
  const normalized = String(lastActiveAt ?? "").trim();
  if (!normalized) return false;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) && Date.now() - ms <= ACTIVE_NOW_WINDOW_MS;
}

function formatPersonPresenceLabel(person: DirectMessageNetworkPerson): string {
  const communityName = String(person.community_name ?? "").trim() || "a shared community";
  const lastActiveAt = String(person.last_active_at ?? "").trim();
  if (!lastActiveAt) return `In ${communityName}`;
  if (isActiveNow(person.last_active_at)) return `Active now · ${communityName}`;
  const relative = formatRelativeTimeFromIso(lastActiveAt);
  return relative ? `Active ${relative} · ${communityName}` : `In ${communityName}`;
}

export function WebDirectMessageInboxPanel(props: WebDirectMessageInboxPanelProps) {
  const normalizedSearch = props.searchValue.trim().replace(/^@+/, "").toLowerCase();
  // Conversations without messages are legacy ghost rows from the old eager
  // create flow; their peers belong in the people zone instead.
  const conversationsWithMessages = props.conversations.filter(
    (conversation) => Math.max(0, Math.floor(Number(conversation.last_seq ?? 0))) > 0,
  );
  const loadedConversationIds = new Set(
    conversationsWithMessages.map((conversation) => conversation.id),
  );

  const filteredConversations = normalizedSearch
    ? conversationsWithMessages.filter((conversation) => {
        const peer = resolveDirectMessagePeer(conversation, props.sessionUserId);
        const haystack = [
          peer?.display_name,
          peer?.user_id,
          conversation.last_message_preview,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : conversationsWithMessages;

  const visiblePeople = props.people.filter((person) => {
    const existingConversationId = String(person.existing_conversation_id ?? "").trim();
    if (existingConversationId && loadedConversationIds.has(existingConversationId)) return false;
    return true;
  });

  const hasZeroCommunities = props.sourceCommunityCount === 0 && !props.isLoadingPeople;
  const isInitialInboxLoad = props.isLoading && props.conversations.length === 0;
  const isInitialPeopleLoad = props.isLoadingPeople && visiblePeople.length === 0;
  const hasAnyRows = filteredConversations.length > 0 || visiblePeople.length > 0;

  return (
    <aside className="community-dm-panel community-dm-inbox-panel" role="dialog" aria-label="Direct messages">
      <div className="community-dm-inbox-header">
        <div>
          <div className="community-dm-inbox-title">Messages</div>
          <div className="community-dm-inbox-subtitle">People from your communities</div>
        </div>
        {props.notificationsState && props.notificationsState !== "hidden" && props.onToggleNotifications ? (
          <button
            className="community-dm-inbox-icon-button"
            type="button"
            onClick={props.onToggleNotifications}
            aria-pressed={props.notificationsState !== "off"}
            aria-label={
              props.notificationsState === "off"
                ? "Turn on message notifications"
                : "Turn off message notifications"
            }
            title={
              props.notificationsState === "off"
                ? "Notifications off"
                : props.notificationsState === "blocked"
                  ? "Sound on — browser is blocking banners"
                  : "Notifications on"
            }
          >
            {props.notificationsState === "off" ? (
              <BellOff aria-hidden="true" />
            ) : (
              <Bell aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      {props.canBrowsePeople ? (
        <label className="community-dm-recipient-search community-dm-inbox-search">
          <Search aria-hidden="true" />
          <input
            value={props.searchValue}
            onChange={(event) => props.onSearchValueChange(event.target.value)}
            aria-label="Search people and messages"
            placeholder="Search people and messages"
          />
        </label>
      ) : null}

      {props.error ? <div className="community-dm-panel-error">{props.error}</div> : null}
      {props.peopleError ? <div className="community-dm-panel-error">{props.peopleError}</div> : null}

      <div
        className="community-dm-inbox-list"
        onScroll={(event) => {
          if (!props.hasMorePeople || !props.onLoadMorePeople || normalizedSearch) return;
          const target = event.currentTarget;
          if (target.scrollHeight - target.scrollTop - target.clientHeight < 160) {
            void props.onLoadMorePeople();
          }
        }}
      >
        {hasZeroCommunities ? (
          <div className="community-dm-discovery-card">
            <UsersRound aria-hidden="true" />
            <h4>Messaging works through communities</h4>
            <p>Join a community and everyone in it becomes one tap away. Your messages live here.</p>
          </div>
        ) : null}

        {isInitialInboxLoad ? (
          <div className="community-dm-panel-empty">Loading messages...</div>
        ) : null}

        {filteredConversations.map((conversation) => {
          const peer = resolveDirectMessagePeer(conversation, props.sessionUserId);
          const peerLabel = String(peer?.display_name ?? peer?.user_id ?? "Direct message").trim() || "Direct message";
          const peerAvatarSeed = peer?.user_id ?? peerLabel;
          const communityName = conversation.created_from_community?.name ?? "shared community";
          const previewText =
            String(conversation.last_message_preview ?? "").trim() || `Started in ${communityName}`;
          const timeLabel = formatInboxTime(conversation.last_message_at ?? conversation.updated_at);
          const unreadCount = Math.max(0, Math.floor(Number(conversation.unread_count ?? 0)));
          const hasUnread = Boolean(conversation.has_unread || unreadCount > 0);
          const peerUserId = String(peer?.user_id ?? "").trim();
          const peerPresenceKnown = Boolean(
            peerUserId && props.peerPresenceByUserId && peerUserId in props.peerPresenceByUserId,
          );
          const peerLastActiveAt = peerPresenceKnown
            ? props.peerPresenceByUserId?.[peerUserId] ?? null
            : null;
          return (
            <button
              key={conversation.id}
              type="button"
              className={`community-dm-inbox-row${hasUnread ? " is-unread" : ""}`}
              aria-label={`${peerLabel}, ${hasUnread ? "unread, " : ""}${previewText}`}
              onClick={() => props.onSelectConversation(conversation)}
            >
              <span className="community-dm-inbox-avatar-wrap">
                <UserAvatar
                  className="community-dm-inbox-avatar"
                  readyClassName="has-image"
                  name={peerLabel}
                  imageUrl={peer?.avatar_url ?? null}
                  focusX={peer?.avatar_focus_x ?? 0.5}
                  focusY={peer?.avatar_focus_y ?? 0.5}
                  zoom={peer?.avatar_zoom ?? 1}
                  alt={peerLabel}
                  fallback={<span>{props.getInitials(peerLabel)}</span>}
                  fallbackStyle={{ backgroundColor: props.getAvatarColor(peerAvatarSeed) }}
                />
                {peerPresenceKnown ? (
                  <span
                    className={`community-dm-inbox-presence-dot${isActiveNow(peerLastActiveAt) ? " is-active-now" : ""}`}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <span className="community-dm-inbox-row-body">
                <span className="community-dm-inbox-row-top">
                  <span className="community-dm-inbox-row-name-line">
                    <span className="community-dm-inbox-row-name">{peerLabel}</span>
                    <PremiumMemberBadge badge={peer?.premium_badge ?? null} />
                  </span>
                  <span className="community-dm-inbox-row-meta-group">
                    {timeLabel ? <span className="community-dm-inbox-row-time">{timeLabel}</span> : null}
                    {hasUnread ? (
                      <span
                        className="community-dm-inbox-row-unread"
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                </span>
                <span className="community-dm-inbox-row-meta">{previewText}</span>
              </span>
            </button>
          );
        })}

        {props.canBrowsePeople && !hasZeroCommunities
          ? visiblePeople.map((person) => {
              const displayName =
                String(person.display_name ?? person.handle ?? person.user_id ?? "Member").trim() || "Member";
              const avatarSeed = person.user_id ?? displayName;
              const presenceLabel = formatPersonPresenceLabel(person);
              const activeNow = isActiveNow(person.last_active_at);
              return (
                <button
                  key={`person:${person.user_id}`}
                  type="button"
                  className="community-dm-inbox-row is-person"
                  aria-label={`Message ${displayName}, ${presenceLabel}`}
                  onClick={() => {
                    void props.onSelectPerson(person);
                  }}
                >
                  <span className="community-dm-inbox-avatar-wrap">
                    <UserAvatar
                      className="community-dm-inbox-avatar"
                      readyClassName="has-image"
                      name={displayName}
                      imageUrl={person.avatar_url ?? null}
                      focusX={person.avatar_focus_x ?? 0.5}
                      focusY={person.avatar_focus_y ?? 0.5}
                      zoom={person.avatar_zoom ?? 1}
                      alt={displayName}
                      fallback={<span>{props.getInitials(displayName)}</span>}
                      fallbackStyle={{ backgroundColor: props.getAvatarColor(avatarSeed) }}
                    />
                    <span
                      className={`community-dm-inbox-presence-dot${activeNow ? " is-active-now" : ""}`}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="community-dm-inbox-row-body">
                    <span className="community-dm-inbox-row-top">
                      <span className="community-dm-inbox-row-name-line">
                        <span className="community-dm-inbox-row-name">{displayName}</span>
                        <PremiumMemberBadge badge={person.premium_badge ?? null} />
                      </span>
                    </span>
                    <span className="community-dm-inbox-row-meta">{presenceLabel}</span>
                  </span>
                  <MessageCircle className="community-dm-inbox-row-go" aria-hidden="true" />
                </button>
              );
            })
          : null}

        {isInitialPeopleLoad && !hasZeroCommunities ? (
          <div className="community-dm-panel-empty community-dm-inbox-people-loading">Finding people...</div>
        ) : null}

        {props.hasMorePeople && visiblePeople.length > 0 && !normalizedSearch ? (
          <div className="community-dm-inbox-list-footer">Loading more people...</div>
        ) : null}

        {!props.hasMorePeople && visiblePeople.length > 0 && !normalizedSearch && !props.isLoadingPeople ? (
          <div className="community-dm-inbox-list-footer">That's everyone across your communities</div>
        ) : null}

        {!hasAnyRows && !isInitialInboxLoad && !isInitialPeopleLoad && !hasZeroCommunities ? (
          <div className="community-dm-panel-empty">
            <MessageCircle aria-hidden="true" />
            <span>{normalizedSearch ? "No matches." : "No one to show yet."}</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
