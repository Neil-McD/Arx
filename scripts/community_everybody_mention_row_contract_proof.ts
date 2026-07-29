import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const autocomplete = read("apps/web/src/components/communityMentionAutocomplete.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const css = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");

// --- The @everybody row must never read as a person ---
assert.match(
  autocomplete,
  /candidate\.kind === "role" \? \(\s*<Users/,
  "the role row must render the Users icon tile, not person initials",
);
assert.match(
  autocomplete,
  /\(candidate\.kind \?\? "user"\) === "user"\s*\?\s*\{ backgroundColor: getAvatarColor/,
  "only user avatars may take a generated fill — role/agent tiles are CSS-styled so the theme accent can take hold",
);

// --- Alias triggers: only aliases that serialize end-to-end should surface everybody ---
assert.match(
  autocomplete,
  /candidate\.matchAliases\?\.some/,
  "matching must honor candidate aliases",
);
assert.match(
  chatPanel,
  /matchAliases: \["everyone"\]/,
  "everybody must advertise only aliases supported end-to-end",
);

// --- The local fallback subtitle stays truthful: backend decides exact email mode ---
assert.match(
  chatPanel,
  /Notifies \$\{everybodyMemberCount\.toLocaleString\(\)\}; email mode checked on send/,
  "the fallback everybody subtitle must not promise stale email semantics before backend hydration",
);

// --- The tile flows from the theme accent token (both platform themes) ---
assert.match(
  css,
  /\.mention-autocomplete-row\.is-role \.mention-autocomplete-avatar \{[\s\S]{0,200}--accent-gold/,
  "the role tile must derive from --accent-gold so dark + polynet themes are handled without per-theme code",
);

console.log("everybody mention row contract proof passed: themed non-person tile, real count, truthful aliases.");
