import { Bell, BellOff, Search, UsersRound } from "lucide-react";
import { formatRelativeTimeFromIso } from "../../../../shared/contentFormatting";
import type {
  DirectMessageConversation,
  DirectMessageNetworkPerson,
  DirectMessageParticipant,
} from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { useState } from "react";
import { Icon, KitApp, Top, View, cx } from "../v1/kit";
import { ConversationListSkeleton } from "./WebLoadingSkeleton";

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
  // Design system v1: the conversation open beside the list, if any.
  activeConversationId?: string | null;
  onSelectConversation: (conversation: DirectMessageConversation) => void;
  onSelectPerson: (person: DirectMessageNetworkPerson) => void | Promise<void>;
  // Design system v1, the Inbox page on a wide window: drawn from the kit
  // (the mock's Inbox, docs/design/hifi-mock), the current community first.
  kitPage?: { activeCommunityId: string | null } | null;
};

type InboxFilter = "reply" | "all" | "here";

// The guide's line at the top of the Inbox, worked out from the list.
export function inboxLeadFor(needsReply: number, newestFrom?: string | null): string {
  if (needsReply === 0) return "Nothing here needs a reply.";
  const who = String(newestFrom ?? "").trim().split(/\s+/)[0] ?? "";
  if (needsReply === 1) return who ? `${who} is waiting on a reply.` : "1 of these needs a reply.";
  return who ? `${needsReply} of these need a reply. The newest is from ${who}.` : `${needsReply} of these need a reply.`;
}

// The mock's times: "now", "20 min", "3 h", "Yesterday", "Tue", "Nov 3".
export function inboxTimeFor(iso: string | null | undefined, now: Date = new Date()): string {
  const at = new Date(String(iso ?? ""));
  if (Number.isNaN(at.getTime())) return "";
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at.getTime() >= startOfToday) return `${Math.floor(minutes / 60)} h`;
  if (at.getTime() >= startOfToday - 86_400_000) return "Yesterday";
  if (at.getTime() >= startOfToday - 6 * 86_400_000) return at.toLocaleDateString("en-US", { weekday: "short" });
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function communityInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

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
  // Conversations without messages are legacy ghost rows from the old eager
  // create flow; their peers belong in the people zone instead.
  const conversationsWithMessages = props.conversations.filter(
    (conversation) => Math.max(0, Math.floor(Number(conversation.last_seq ?? 0))) > 0,
  );
  return (
    <KitInboxPage
      {...props}
      kitPage={props.kitPage ?? { activeCommunityId: null }}
      conversations={conversationsWithMessages}
      people={props.people}
    />
  );
}

function KitInboxPage(props: WebDirectMessageInboxPanelProps & { kitPage: { activeCommunityId: string | null } }) {
  const isUnread = (conversation: DirectMessageConversation) =>
    !conversation.viewer_muted && Boolean(conversation.has_unread || Number(conversation.unread_count ?? 0) > 0);
  const needsReply = props.conversations.filter(isUnread).length;
  const [filter, setFilter] = useState<InboxFilter | null>(null);
  const [findingSomeone, setFindingSomeone] = useState(false);
  const activeFilter: InboxFilter = filter ?? (needsReply > 0 ? "reply" : "all");
  const here = props.kitPage.activeCommunityId;
  const hereName = props.conversations.find((conversation) => conversation.created_from_community?.id === here)?.created_from_community?.name ?? null;
  const fromElsewhere = props.conversations.some((conversation) => conversation.created_from_community && conversation.created_from_community.id !== here);
  const rows = props.conversations.filter((conversation) =>
    activeFilter === "reply" ? isUnread(conversation)
      : activeFilter === "here" ? conversation.created_from_community?.id === here
        : true);
  const search = props.searchValue.trim().replace(/^@+/, "").toLowerCase();
  const people = search
    ? props.people.filter((person) => [person.display_name, person.handle].filter(Boolean).join(" ").toLowerCase().includes(search))
    : props.people;
  const hasZeroCommunities = props.sourceCommunityCount === 0 && !props.isLoadingPeople;

  const closeFindSomeone = () => {
    setFindingSomeone(false);
    if (props.searchValue) props.onSearchValueChange("");
  };

  const notificationsButton =
    props.notificationsState && props.notificationsState !== "hidden" && props.onToggleNotifications ? (
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
    ) : null;

  const avatar = (
    name: string,
    seed: string,
    imageUrl: string | null | undefined,
    frame?: { focusX?: number | null; focusY?: number | null; zoom?: number | null } | null,
    badge?: { label: string; name: string } | null,
  ) => (
    <span className={cx("av", badge && "has")} title={badge ? `From ${badge.name}` : undefined}>
      <UserAvatar
        className="community-dm-kit-avatar"
        readyClassName="has-image"
        name={name}
        imageUrl={imageUrl ?? null}
        focusX={frame?.focusX}
        focusY={frame?.focusY}
        zoom={frame?.zoom}
        alt=""
        fallback={<span>{props.getInitials(name)}</span>}
        fallbackStyle={{ backgroundColor: props.getAvatarColor(seed) }}
      />
      {badge ? <i className={cx("cb")} style={{ background: props.getAvatarColor(badge.name) }}>{badge.label}</i> : null}
    </span>
  );

  return (
    <aside className="community-dm-panel community-dm-inbox-panel is-kit" role="dialog" aria-label="Inbox">
      <KitApp view="inbox" part="main">
        <View index={3}>
          <Top title="Inbox" titleView={3} actions={notificationsButton} />
          <div
            className={cx("page")}
            style={{ overflowY: "auto" }}
            onScroll={(event) => {
              if (!findingSomeone || !props.hasMorePeople || !props.onLoadMorePeople || search) return;
              const target = event.currentTarget;
              if (target.scrollHeight - target.scrollTop - target.clientHeight < 160) {
                void props.onLoadMorePeople();
              }
            }}
          >
            <p className={cx("lead")}>
              <span className={cx("aura")}><Icon name="spark" /></span>
              {props.isLoading && props.conversations.length === 0
                ? " "
                : inboxLeadFor(needsReply, (() => {
                    const newest = props.conversations.find(isUnread);
                    return newest ? resolveDirectMessagePeer(newest, props.sessionUserId)?.display_name ?? null : null;
                  })())}
            </p>
            <div className={cx("filters")} style={{ marginTop: 20 }} role="group" aria-label="Show">
              {findingSomeone ? (
                // Finding someone takes the filters' place on this line: the
                // filters sort conversations, which are hidden while you look.
                <label className="community-dm-recipient-search community-dm-inbox-search">
                  <Search aria-hidden="true" />
                  <input autoFocus value={props.searchValue} onChange={(event) => props.onSearchValueChange(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Escape") closeFindSomeone(); }} aria-label="Find someone" placeholder="Find someone" />
                </label>
              ) : (
                <>
                  <button type="button" className={cx("chip", activeFilter === "reply" && "sel")} aria-pressed={activeFilter === "reply"} onClick={() => setFilter("reply")}>
                    Needs a reply{needsReply ? ` · ${needsReply}` : ""}
                  </button>
                  <button type="button" className={cx("chip", activeFilter === "all" && "sel")} aria-pressed={activeFilter === "all"} onClick={() => setFilter("all")}>
                    Everything
                  </button>
                  {hereName && fromElsewhere ? (
                    <button type="button" className={cx("chip", activeFilter === "here" && "sel")} aria-pressed={activeFilter === "here"} onClick={() => setFilter("here")}>
                      Only {hereName}
                    </button>
                  ) : null}
                </>
              )}
              {props.canBrowsePeople ? (
                <button
                  type="button"
                  className={cx("chip")}
                  style={{ marginLeft: "auto" }}
                  aria-pressed={findingSomeone}
                  onClick={() => {
                    if (findingSomeone) closeFindSomeone();
                    else setFindingSomeone(true);
                  }}
                >
                  {findingSomeone ? "Done" : "New message"}
                </button>
              ) : null}
            </div>
            {props.error ? <div className="community-dm-panel-error">{props.error}</div> : null}

            {findingSomeone ? (
              <>
                {props.peopleError ? <div className="community-dm-panel-error">{props.peopleError}</div> : null}
                {hasZeroCommunities ? (
                  <div className="community-dm-discovery-card" style={{ marginTop: 14 }}>
                    <UsersRound aria-hidden="true" />
                    <h4>Messaging works through communities</h4>
                    <p>Join a community and everyone in it becomes one tap away. Your messages live here.</p>
                  </div>
                ) : (
                  <div className={cx("list")} style={{ marginTop: 14 }}>
                    {people.map((person) => {
                      const name = String(person.display_name ?? person.handle ?? "Member").trim() || "Member";
                      return (
                        <button
                          key={`person:${person.user_id}`}
                          type="button"
                          className={cx("mrow", "read")}
                          onClick={() => {
                            closeFindSomeone();
                            void props.onSelectPerson(person);
                          }}
                          aria-label={`Message ${name}`}
                        >
                          {avatar(name, person.user_id ?? name, person.avatar_url, {
                            focusX: person.avatar_focus_x,
                            focusY: person.avatar_focus_y,
                            zoom: person.avatar_zoom,
                          })}
                          <div><div className={cx("h")}><b>{name}</b><span>{formatPersonPresenceLabel(person)}</span></div></div>
                          <span />
                        </button>
                      );
                    })}
                    {props.isLoadingPeople && people.length === 0 ? <ConversationListSkeleton label="Finding people…" rows={3} compact /> : null}
                    {props.hasMorePeople && people.length > 0 && !search ? (
                      <div className="community-dm-inbox-list-footer">Loading more people…</div>
                    ) : null}
                    {!props.hasMorePeople && people.length > 0 && !search && !props.isLoadingPeople ? (
                      <div className="community-dm-inbox-list-footer">That's everyone across your communities</div>
                    ) : null}
                    {!props.isLoadingPeople && people.length === 0 ? <p className={cx("sub")}>No one found.</p> : null}
                  </div>
                )}
              </>
            ) : (
              <div className={cx("list")} style={{ marginTop: 14 }}>
                {props.isLoading && rows.length === 0 ? <ConversationListSkeleton /> : null}
                {rows.map((conversation) => {
                  const peer = resolveDirectMessagePeer(conversation, props.sessionUserId);
                  const name = String(peer?.display_name ?? "Direct message").trim() || "Direct message";
                  const community = conversation.created_from_community;
                  const elsewhere = community && community.id !== here ? community : null;
                  const unread = isUnread(conversation);
                  const preview = String(conversation.last_message_preview ?? "").trim() || (community ? `Started in ${community.name}` : "");
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      className={cx("mrow", "one", props.activeConversationId === conversation.id && "sel", !unread && "read")}
                      aria-current={props.activeConversationId === conversation.id ? "true" : undefined}
                      aria-label={`${name}, ${unread ? "unread, " : ""}${preview}`}
                      onClick={() => props.onSelectConversation(conversation)}
                    >
                      {avatar(
                        name,
                        peer?.user_id ?? name,
                        peer?.avatar_url,
                        { focusX: peer?.avatar_focus_x, focusY: peer?.avatar_focus_y, zoom: peer?.avatar_zoom },
                        elsewhere ? { label: communityInitials(elsewhere.name), name: elsewhere.name } : null,
                      )}
                      <div>
                        <div className={cx("h")}>
                          <b>{name}</b>
                          {/* Everything here is a direct message; only where it began is worth saying. */}
                          {elsewhere ? <span>{elsewhere.name}</span> : null}
                          <time>{inboxTimeFor(conversation.last_message_at ?? conversation.updated_at)}</time>
                        </div>
                        <p>{preview}</p>
                      </div>
                      {unread ? <span className={cx("dot")} aria-hidden="true" /> : <span />}
                    </button>
                  );
                })}
                {rows.length === 0 && !props.isLoading ? (
                  hasZeroCommunities ? (
                    <div className="community-dm-discovery-card">
                      <UsersRound aria-hidden="true" />
                      <h4>Messaging works through communities</h4>
                      <p>Join a community and everyone in it becomes one tap away. Your messages live here.</p>
                    </div>
                  ) : (
                    <p className={cx("sub")} style={{ marginTop: 6 }}>
                      {activeFilter === "reply" ? "You're all caught up." : "No messages yet. Start one with New message."}
                    </p>
                  )
                ) : null}
              </div>
            )}
          </div>
        </View>
      </KitApp>
    </aside>
  );
}
