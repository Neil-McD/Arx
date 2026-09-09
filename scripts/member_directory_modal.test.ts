import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const roster = read("apps/web/src/components/ChannelRosterPanel.tsx");

test("members popup reuses the roster renderer with community scope, not a second directory engine", () => {
  expect(roster).toContain('channelId={undefined} narrowOpen={false}');
  expect(roster).toContain('directory onCloseMembers=');
  expect(roster.match(/watchQuery\(api.communityChannelParticipants.listChannelRoster/g)).toHaveLength(1);
  expect(roster.match(/<UserAvatar\b/g)).toHaveLength(1);
  expect(roster.match(/<CommunityMemberSettingsDialog\b/g)).toHaveLength(1);
  expect(roster).toContain('props.directory ? <CommunityAutoJoinControl');
  expect(roster).toContain('className="members-view-all"');
  expect(roster).toContain('>View all</button>');
  expect(roster).toContain('if (!scope || props.directory) return;');
});

test("popup resets scope and restores focus without resetting the mounted conversation", () => {
  expect(roster).toContain('JSON.stringify([props.currentUserId, scope?.communityId, props.channelId])');
  expect(roster).toContain('<ChannelRosterWorkspace key={scopeKey}');
  expect(roster).toContain('if (opener?.isConnected) opener.focus()');
  expect(roster).toContain('style={props.memberDetailOpen ? { display: "none" } : undefined}');
  expect(roster).toContain('if (selectedMember) {');
  expect(roster).toContain('aria-labelledby="members-directory-title"');
  expect(roster).toContain('event.key !== "Tab"');
  expect(read("apps/web/src/components/WebCommunityInteractionProjection.tsx")).toContain('memberDetailOpen={hasDetailPanel}');
});
