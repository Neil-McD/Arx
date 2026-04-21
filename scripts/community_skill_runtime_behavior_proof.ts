import assert from "node:assert/strict";

import { buildSkillMentionToken } from "../convex/skillCore.ts";
import {
  extractExplicitSkillMentions,
  resolveScopedExplicitlyMentionedSkills,
  selectExplicitlyMentionedSkills,
} from "../shared/runtimeSkillActivation.ts";

function main() {
  assert.equal(
    buildSkillMentionToken("Weekly Research"),
    "weekly-research",
    "expected mention token to derive from skill name",
  );

  assert.deepEqual(
    extractExplicitSkillMentions([
      { role: "user", content: "please use $weekly-research and $WEEKLY-RESEARCH" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "now use $board-summary and maybe $board-summary" },
    ]),
    ["board-summary"],
    "expected only the latest non-empty user message to drive explicit skill mentions",
  );

  const selected = selectExplicitlyMentionedSkills(
    [
      {
        mentionToken: "weekly-research",
        value: { name: "Weekly Research", instructionsMd: "research instructions" },
      },
      {
        mentionToken: "board-summary",
        value: { name: "Board Summary", instructionsMd: "board instructions" },
      },
    ],
    ["board-summary", "weekly-research"],
  );
  assert.deepEqual(
    selected,
    [
      { name: "Board Summary", instructionsMd: "board instructions" },
      { name: "Weekly Research", instructionsMd: "research instructions" },
    ],
    "expected explicitly mentioned skills to be selected in mention order",
  );

  const ambiguous = selectExplicitlyMentionedSkills(
    [
      {
        mentionToken: "weekly-research",
        value: { name: "Weekly Research", instructionsMd: "a" },
      },
      {
        mentionToken: "weekly-research",
        value: { name: "Weekly Research Copy", instructionsMd: "b" },
      },
    ],
    ["weekly-research"],
  );
  assert.deepEqual(
    ambiguous,
    [],
    "expected ambiguous mention token matches to fail closed",
  );

  const scoped = resolveScopedExplicitlyMentionedSkills(
    [
      {
        scope: "personal",
        mentionToken: "weekly-research",
        value: { scope: "personal", name: "Weekly Research" },
      },
      {
        scope: "community",
        mentionToken: "board-summary",
        value: { scope: "community", name: "Board Summary" },
      },
    ],
    ["board-summary", "weekly-research"],
  );
  assert.deepEqual(
    scoped,
    {
      selected: [
        { scope: "community", value: { scope: "community", name: "Board Summary" } },
        { scope: "personal", value: { scope: "personal", name: "Weekly Research" } },
      ],
      ambiguousMentionTokens: [],
    },
    "expected scoped skill selection to preserve mention order",
  );

  const crossScopeAmbiguous = resolveScopedExplicitlyMentionedSkills(
    [
      {
        scope: "personal",
        mentionToken: "weekly-research",
        value: { scope: "personal", name: "Weekly Research" },
      },
      {
        scope: "community",
        mentionToken: "weekly-research",
        value: { scope: "community", name: "Community Weekly Research" },
      },
    ],
    ["weekly-research"],
  );
  assert.deepEqual(
    crossScopeAmbiguous,
    {
      selected: [],
      ambiguousMentionTokens: ["weekly-research"],
    },
    "expected cross-scope token collisions to fail closed",
  );

  assert.deepEqual(
    selectExplicitlyMentionedSkills(
      [
        {
          mentionToken: "weekly-research",
          value: { name: "Weekly Research", instructionsMd: "research instructions" },
        },
      ],
      [],
    ),
    [],
    "expected no explicit mentions to load no skill instructions",
  );

  console.log("community_skill_runtime_behavior_proof: ok");
}

main();
