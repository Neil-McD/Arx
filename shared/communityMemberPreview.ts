import type { CommunityAccess } from "./communityTypes";

// "View as a member" (design v1, the mock's account menu and Manage's "Check
// your work"). A host sees the community through a member's lens on their own
// screen. It only ever takes powers away: the server still authorises every
// request as the real viewer, so a preview can never open anything up.

// Who may preview: the people who run the community (owners and admins).
export function canPreviewAsMember(access: CommunityAccess | null | undefined): boolean {
  if (!access) return false;
  if (access.is_owner === true) return true;
  const role = String(access.effective_role ?? "").trim().toLowerCase();
  return role === "admin";
}

// The same viewer as a plain member: reading and posting stay, every host and
// moderator power goes, and the owner's billing prompt with it.
export function memberPreviewAccess(access: CommunityAccess): CommunityAccess {
  return {
    ...access,
    relation: "member",
    is_owner: false,
    entitlement_role: "member",
    effective_role: "member",
    primary_cta: "open_community",
    can_manage_resources: false,
    can_moderate_content: false,
    can_manage_members: false,
    can_review_join_requests: false,
    can_manage_pricing: false,
    can_manage_branding: false,
    can_manage_publishing: false,
    can_manage_payouts: false,
  };
}

// A new member has no grant to a restricted channel, so a preview hides them
// all rather than show a room the host only sees by being the host.
export function memberPreviewChannels<T extends { access_mode?: string | null }>(channels: T[]): T[] {
  return channels.filter((channel) => channel.access_mode !== "restricted");
}

const STORAGE_KEY = "polynet.memberPreview";

// Lasts for this tab only, for one community, so it never lingers into next week.
export function readMemberPreviewCommunityId(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function writeMemberPreview(communityId: string | null, on: boolean): void {
  try {
    if (on && communityId) window.sessionStorage.setItem(STORAGE_KEY, communityId);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the preview still works until the page reloads.
  }
}
