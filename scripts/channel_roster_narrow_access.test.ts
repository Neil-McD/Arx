import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("narrow access reuses one roster and preserves the mounted conversation", () => {
  const source = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
  expect(source.match(/<ChannelRosterPanel\b/g)).toHaveLength(1);
  expect(source).toContain('ref={peopleTriggerRef}');
  expect(source).toContain('peopleTriggerRef.current?.focus()');
  expect(source).toContain('narrowOpen={peopleOpen}');
  expect(source).toContain('[props.communityId, props.activeChannel?.id, props.selectedRootId, props.profilePanel]');
  const css = read("apps/web/src/styles/community-and-content.css");
  expect(css).toContain('.people-panel-open > .community-interaction-main { display: none; }');
  expect(css).toContain('.community-channel-header .channel-people-trigger');
});
test("roster Back and Escape reuse the host close callback", () => {
  const source = read("apps/web/src/components/ChannelRosterPanel.tsx");
  expect(source).toContain('event.key === "Escape" && !event.defaultPrevented && props.narrowOpen');
  expect(source).toContain('onClick={props.onCloseNarrow}');
  expect(source).toContain('backRef.current.focus()');
});
