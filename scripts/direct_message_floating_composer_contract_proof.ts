import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const dmPanel = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const baseCss = read("apps/web/src/base.css");

assert.match(
  dmPanel,
  /const composerFloatRef = useRef<HTMLDivElement \| null>\(null\);/,
  "DM composer should own a measurable floating layer",
);
assert.match(
  dmPanel,
  /useLayoutEffect\(\(\) => \{[\s\S]*composerFloatRef\.current[\s\S]*--community-dm-composer-float-height[\s\S]*new ResizeObserver\(syncComposerClearance\)[\s\S]*observer\.observe\(composerFloat\)/,
  "DM feed clearance should follow the rendered floating composer height",
);
assert.match(
  dmPanel,
  /if \(shouldFollowMessagesRef\.current\) \{[\s\S]*requestAnimationFrame\(scrollMessagesToBottom\);/,
  "composer height changes should preserve follow-latest behavior",
);
assert.match(
  dmPanel,
  /className="community-dm-composer-float" ref=\{composerFloatRef\}[\s\S]*community-dm-panel-typing[\s\S]*community-dm-composer-attachments[\s\S]*<form className="community-dm-panel-composer" onSubmit=\{onSubmit\}>/,
  "typing, attachments, and the composer should move as one floating stack",
);
assert.match(
  dmPanel,
  /event\.key === "Enter" && !event\.shiftKey[\s\S]*void props\.onSend\(\);[\s\S]*<VoiceInputButton \{\.\.\.props\.voiceButtonProps\}/,
  "the visual slice must preserve DM send and voice behavior",
);

assert.match(
  baseCss,
  /\.community-dm-composer-float \{[\s\S]*position: absolute;[\s\S]*bottom: 14px;[\s\S]*z-index: 3;/,
  "DM composer stack should float over the message feed",
);
assert.match(
  baseCss,
  /\.community-dm-panel-messages \{[\s\S]*padding:[^;]*var\(--community-dm-composer-float-height, 62px\)[^;]*;/,
  "DM feed should reserve measured scroll clearance without creating a fixed footer",
);
assert.match(
  baseCss,
  /\.community-dm-panel-composer \{[\s\S]*border-radius: var\(--composer-radius\);[\s\S]*background: var\(--web-context-panel-surface\);/,
  "DM composer should continue the canonical context-panel surface",
);
assert.match(
  baseCss,
  /\.community-dm-composer-float::before \{[\s\S]*linear-gradient\([\s\S]*var\(--web-context-panel-surface\) 100%/,
  "DM feed should dissolve into the same context-panel surface behind the composer",
);
assert.doesNotMatch(
  baseCss.slice(
    baseCss.indexOf(".community-dm-panel-composer {"),
    baseCss.indexOf(".community-dm-panel-file-input"),
  ),
  /backdrop-filter/,
  "DM composer should not use translucency as its separation mechanism",
);
assert.match(
  baseCss,
  /\.community-dm-panel-input \{[\s\S]*border: 0;[\s\S]*background: transparent;/,
  "DM input should read as part of the pill rather than as a nested field",
);
assert.match(
  baseCss,
  /\.web-direct-messages-host\.mobile-root \.community-dm-panel-attach,[\s\S]*\.community-dm-panel-send \{[\s\S]*width: 44px;[\s\S]*height: 44px;/,
  "mobile DM composer actions should keep 44px touch targets",
);

console.log("direct_message_floating_composer_contract_proof: ok");
