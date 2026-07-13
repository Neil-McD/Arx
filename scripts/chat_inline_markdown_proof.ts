import assert from "node:assert/strict";
import {
  chatTextHasInlineMarkdown,
  stripChatInlineMarkdown,
  tokenizeChatInlineMarkdown,
  type ChatInlineToken,
} from "../shared/chatInlineMarkdown.ts";

function kinds(tokens: ChatInlineToken[]): string[] {
  return tokens.map((token) => token.kind);
}

// Basic grammar.
assert.deepEqual(tokenizeChatInlineMarkdown("hello **world**"), [
  { kind: "text", text: "hello " },
  { kind: "bold", text: "world" },
]);
assert.deepEqual(tokenizeChatInlineMarkdown("Read [the guide](https://example.com/guide)."), [
  { kind: "text", text: "Read " },
  { kind: "text", text: "[the guide](https://example.com/guide)" },
  { kind: "text", text: "." },
]);
assert.deepEqual(tokenizeChatInlineMarkdown("Read [the guide](https://example.com/guide).", {
  allowLabeledLinks: true,
}), [
  { kind: "text", text: "Read " },
  { kind: "link", text: "the guide", href: "https://example.com/guide" },
  { kind: "text", text: "." },
]);
assert.deepEqual(tokenizeChatInlineMarkdown("Read [the reference](https://en.wikipedia.org/wiki/Foo_(bar)).", {
  allowLabeledLinks: true,
}), [
  { kind: "text", text: "Read " },
  { kind: "link", text: "the reference", href: "https://en.wikipedia.org/wiki/Foo_(bar)" },
  { kind: "text", text: "." },
]);
assert.deepEqual(tokenizeChatInlineMarkdown("Email [the owner](mailto:owner@example.com)", {
  allowLabeledLinks: true,
}), [
  { kind: "text", text: "Email " },
  { kind: "link", text: "the owner", href: "mailto:owner@example.com" },
]);
assert.deepEqual(tokenizeChatInlineMarkdown("[unsafe](tel:javascript:alert)", {
  allowLabeledLinks: true,
}), [
  { kind: "text", text: "[unsafe](tel:javascript:alert)" },
]);
assert.deepEqual(tokenizeChatInlineMarkdown("*hi* and ~~bye~~ and `x=1`"), [
  { kind: "italic", text: "hi" },
  { kind: "text", text: " and " },
  { kind: "strike", text: "bye" },
  { kind: "text", text: " and " },
  { kind: "code", text: "x=1" },
]);

// Fenced code blocks, with and without language, trailing newline trimmed.
assert.deepEqual(tokenizeChatInlineMarkdown("```ts\nconst a = 1;\n```"), [
  { kind: "code_block", text: "const a = 1;", language: "ts" },
]);
assert.deepEqual(tokenizeChatInlineMarkdown("before\n```\nplain\n```\nafter **b**"), [
  { kind: "text", text: "before\n" },
  { kind: "code_block", text: "plain", language: null },
  { kind: "text", text: "\nafter " },
  { kind: "bold", text: "b" },
]);

// Inline syntax inside a fence stays literal.
assert.deepEqual(tokenizeChatInlineMarkdown("```\n**not bold**\n```"), [
  { kind: "code_block", text: "**not bold**", language: null },
]);

// Unmatched markers render literally.
assert.deepEqual(kinds(tokenizeChatInlineMarkdown("**dangling")), ["text"]);
assert.deepEqual(kinds(tokenizeChatInlineMarkdown("a * b * c")), ["text"]);
assert.deepEqual(kinds(tokenizeChatInlineMarkdown("2 ** 3 ** 4")), ["text"]);
assert.deepEqual(kinds(tokenizeChatInlineMarkdown("```no closing fence")), ["text"]);

// Block syntax is not part of the grammar: renders literally, never eaten.
assert.deepEqual(tokenizeChatInlineMarkdown("# 1 priority"), [
  { kind: "text", text: "# 1 priority" },
]);
assert.deepEqual(tokenizeChatInlineMarkdown("1. first\n2. second"), [
  { kind: "text", text: "1. first\n2. second" },
]);

// Underscores never format (snake_case safety).
assert.deepEqual(kinds(tokenizeChatInlineMarkdown("my_var_name and _emph_")), ["text"]);

// Bold wins over italic at the same position.
assert.deepEqual(tokenizeChatInlineMarkdown("**bold** *ital*"), [
  { kind: "bold", text: "bold" },
  { kind: "text", text: " " },
  { kind: "italic", text: "ital" },
]);

// URLs adjacent to markers survive as text (linking happens at render time).
assert.deepEqual(tokenizeChatInlineMarkdown("see https://a.io/x_y_z now"), [
  { kind: "text", text: "see https://a.io/x_y_z now" },
]);

// Strip round-trips to plain content.
assert.equal(stripChatInlineMarkdown("**hey** `code` ~~gone~~ *soft*"), "hey code gone soft");
assert.equal(
  stripChatInlineMarkdown("Read [the guide](https://example.com/guide)"),
  "Read [the guide](https://example.com/guide)",
);
assert.equal(stripChatInlineMarkdown("```ts\nconst a = 1;\n```"), "const a = 1;");
assert.equal(stripChatInlineMarkdown("plain text"), "plain text");
assert.equal(stripChatInlineMarkdown(null), "");
assert.equal(stripChatInlineMarkdown(undefined), "");

// Detection helper.
assert.equal(chatTextHasInlineMarkdown("plain"), false);
assert.equal(chatTextHasInlineMarkdown("**b**"), true);

// Multiline bold does not span newlines... unless within one line run it stays
// inline-only: markers containing a newline render literally.
assert.deepEqual(kinds(tokenizeChatInlineMarkdown("**a\nb**")), ["text"]);

console.log("chat_inline_markdown_proof: PASS");
