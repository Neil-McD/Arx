// Design system v1: the command palette's places and communities, taken from
// the community's left column, so the palette goes exactly where the column
// does and shows what the column shows (and nothing the lens hides).
import { useMemo } from "react";
import type { PaletteCommunity, PalettePlace } from "../../../../shared/commandPalette";
import { KitCommandPalette } from "../v1/KitCommandPalette";
import type { WebCommunityShellProps } from "./webShellChromeShared";

// The same questions as Home's chips.
const HOST_SUGGESTIONS = ["How was this week?", "Who should I welcome?"];
const MEMBER_SUGGESTIONS = ["What did I miss?", "Who should I meet?"];

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "·";
}

export function WebCommunityCommandPalette({ communityShell }: { communityShell: WebCommunityShellProps }) {
  const shell = communityShell;
  const isHost = shell.canManageMembersActiveCommunity || shell.canViewActiveCommunitySettings;

  const places = useMemo<PalettePlace[]>(() => {
    const list: PalettePlace[] = [{ id: "home", label: "Home", icon: "home" }];
    if (shell.canOpenDirectMessages) {
      const unread = shell.directMessagesUnreadCount;
      list.push({ id: "inbox", label: "Inbox", icon: "inbox", hint: unread > 0 ? String(unread) : null, fresh: unread > 0 });
    }
    for (const channel of shell.communityChannels) {
      const indicator = shell.communityChannelIndicators[channel.slug] ?? shell.communityChannelIndicators[channel.id];
      const mentioned = Boolean(indicator?.mentions);
      const fresh = mentioned || Boolean(indicator?.chat);
      list.push({
        id: `channel:${channel.id}`,
        label: channel.name,
        icon: channel.access_mode === "restricted" ? "lock" : "hash",
        hint: mentioned ? "mentioned" : fresh ? "new" : null,
        fresh,
        quiet: true,
      });
    }
    list.push({ id: "knowledge", label: "Knowledge", icon: "stars" }, { id: "events", label: "Events", icon: "cal" });
    if (shell.canViewMembersActiveCommunity) list.push({ id: "members", label: "Members", icon: "users" });
    if (isHost && shell.onOpenCommunitySettingsPane) list.push({ id: "guide", label: "Your guide", icon: "sliders" });
    return list;
  }, [shell.canOpenDirectMessages, shell.directMessagesUnreadCount, shell.communityChannels, shell.communityChannelIndicators, shell.canViewMembersActiveCommunity, shell.onOpenCommunitySettingsPane, isHost]);

  const communities = useMemo<PaletteCommunity[]>(() => shell.railCommunities
    .filter((community) => String(community.slug ?? "").trim() !== shell.selectedActiveCommunitySlug)
    .map((community) => ({ id: community.id, label: community.name, initials: initials(community.name), fresh: Boolean(shell.communityRailAttentionById[community.id]) })),
  [shell.railCommunities, shell.selectedActiveCommunitySlug, shell.communityRailAttentionById]);

  const actions = useMemo(() => ({
    openPlace: (id: string) => {
      const leaveInbox = () => { if (shell.isDirectMessagesOpen) shell.onToggleDirectMessages(); };
      if (id === "inbox") { if (!shell.isDirectMessagesOpen) shell.onToggleDirectMessages(); return; }
      if (id.startsWith("channel:")) {
        const channel = shell.communityChannels.find((entry) => `channel:${entry.id}` === id);
        if (channel) { leaveInbox(); shell.onSelectCommunityChannel(channel); }
        return;
      }
      if (id === "members") { leaveInbox(); shell.onOpenMembers(); return; }
      if (id === "guide") { leaveInbox(); shell.onOpenCommunitySettingsPane?.("agent"); return; }
      const tab = id === "home" ? "agent" : id === "knowledge" ? "resources" : id === "events" ? "events" : null;
      if (tab) { leaveInbox(); shell.onSelectCommunityTab(tab); }
    },
    openCommunity: (id: string) => {
      const community = shell.railCommunities.find((entry) => entry.id === id);
      if (!community) return;
      const changed = shell.onSelectActiveCommunity(community);
      const slug = String(community.slug ?? "").trim();
      if (changed && slug) shell.onOpenCommunityHome(slug);
    },
  }), [shell]);

  return <KitCommandPalette places={places} suggestions={isHost ? HOST_SUGGESTIONS : MEMBER_SUGGESTIONS} communities={communities} actions={actions} />;
}
