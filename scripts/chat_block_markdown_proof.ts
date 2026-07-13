import assert from "node:assert/strict";
import { parseChatBlockMarkdown } from "../shared/chatBlockMarkdown.ts";
import { tokenizeChatContactText } from "../shared/chatContactText.ts";

const blocks = parseChatBlockMarkdown(`# Payment recovery
Status is **healthy**\nand links stay inline.

- First account
  - Nested owner: @Neil
  1. Call +1 (312) 555-8941
- Second account

3. Review invoice
4. Send reminder

> Needs personal attention
> Email owner@example.com

---

\`\`\`ts
const total = invoices.length;
// **Markdown stays literal here.**
\`\`\``);

assert.deepEqual(blocks, [
  { kind: "heading", level: 1, text: "Payment recovery" },
  { kind: "paragraph", text: "Status is **healthy**\nand links stay inline." },
  {
    kind: "list",
    ordered: false,
    start: 1,
    items: [
      {
        text: "First account",
        children: [
          {
            kind: "list",
            ordered: false,
            start: 1,
            items: [{ text: "Nested owner: @Neil", children: [] }],
          },
          {
            kind: "list",
            ordered: true,
            start: 1,
            items: [{ text: "Call +1 (312) 555-8941", children: [] }],
          },
        ],
      },
      { text: "Second account", children: [] },
    ],
  },
  {
    kind: "list",
    ordered: true,
    start: 3,
    items: [
      { text: "Review invoice", children: [] },
      { text: "Send reminder", children: [] },
    ],
  },
  { kind: "blockquote", text: "Needs personal attention\nEmail owner@example.com" },
  { kind: "divider" },
  {
    kind: "code_block",
    language: "ts",
    text: "const total = invoices.length;\n// **Markdown stays literal here.**",
  },
]);

assert.deepEqual(parseChatBlockMarkdown("#1 priority\n1.5 is not a list\n#### literal heading"), [
  { kind: "paragraph", text: "#1 priority\n1.5 is not a list\n#### literal heading" },
]);
assert.deepEqual(parseChatBlockMarkdown("```ts\nconst unfinished = true;"), [
  { kind: "paragraph", text: "```ts\nconst unfinished = true;" },
]);
assert.deepEqual(parseChatBlockMarkdown(null), []);

assert.deepEqual(tokenizeChatContactText("Email owner@example.com or call +1 (312) 555-8941."), [
  { kind: "text", text: "Email " },
  { kind: "email", text: "owner@example.com", href: "mailto:owner@example.com" },
  { kind: "text", text: " or call " },
  { kind: "phone", text: "+1 (312) 555-8941", href: "tel:+13125558941" },
  { kind: "text", text: "." },
]);
assert.deepEqual(tokenizeChatContactText("Call 1-800-555-0199."), [
  { kind: "text", text: "Call " },
  { kind: "phone", text: "1-800-555-0199", href: "tel:18005550199" },
  { kind: "text", text: "." },
]);
assert.deepEqual(tokenizeChatContactText("https://example.com/u/owner@example.com"), [
  { kind: "text", text: "https://example.com/u/owner@example.com" },
]);
assert.deepEqual(tokenizeChatContactText("ID 1234567890 and date 2026-07-13 stay text"), [
  { kind: "text", text: "ID 1234567890 and date 2026-07-13 stay text" },
]);

console.log("chat_block_markdown_proof: PASS");
