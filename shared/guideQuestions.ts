// What the guide asks a person before doing something for them in their
// private talk, and what it says happened (convex/communityGuideQuestions.ts).
// Which actions ask: shared/operationCatalog.ts, guideAskFor.
import type { GuideAsk } from "./operationCatalog.ts";

// A question nobody answered in a day is dropped: nothing is done.
export const GUIDE_QUESTION_WAIT_MS = 24 * 60 * 60 * 1000;
// How many posts a question about removing shows by name; the rest are counted.
export const GUIDE_QUESTION_ITEMS_SHOWN = 100;
// The person is shown every word that would go out, never a cut: longer
// than this and the question isn't asked at all.
export const GUIDE_QUESTION_TEXT_MAX = 12_000;
export const GUIDE_QUESTION_ITEM_TEXT_MAX = 160;

export type GuideQuestionAnswer = "yes" | "no" | "always";

export type GuideQuestionView = {
  id: string;
  kind: GuideAsk;
  question: string;
  // The exact words that would go out, or the posts that would be removed.
  text: string | null;
  items: Array<{ who: string; text: string }>;
  // Whether "Always allow" is offered for this kind.
  canAlways: boolean;
};

export type GuideAnswerResult = {
  // done: it was done. declined: nothing was done. failed: it was tried and refused.
  status: "done" | "declined" | "failed";
  line: string;
  path: string | null;
};

// How a person who isn't in the community is described; never shown in a question.
export const NOT_A_MEMBER_HERE = "Not a member here.";

export function postQuestion(args: { mode: string; channelName: string }): string {
  const channel = `#${args.channelName}`;
  if (args.mode === "append") return `Reply with this in ${channel} as you?`;
  if (args.mode === "update") return `Change your post in ${channel} to this?`;
  return `Post this in ${channel} as you?`;
}

export function removeQuestion(args: { count: number; own?: { channelName: string } | null }): string {
  if (args.own) return `Delete your post in #${args.own.channelName}?`;
  return args.count === 1 ? "Remove this post? It can't be brought back." : `Remove these ${args.count} posts? They can't be brought back.`;
}

const ROLE_WORDS: Record<string, [string, string]> = {
  admin: ["an admin", "admins"], moderator: ["a moderator", "moderators"], member: ["a member with no host role", "members with no host role"],
};

export function roleQuestion(args: { names: string[]; role: string }): string {
  const [one, many] = ROLE_WORDS[args.role] ?? ROLE_WORDS.member;
  return args.names.length === 1 ? `Make ${args.names[0]} ${one}?` : `Make these ${args.names.length} people ${many}?`;
}

// Removing or banning people, in the words the Members page uses.
export function memberRemovalQuestion(args: { names: string[]; ban: boolean }): string {
  const who = args.names.length === 1 ? args.names[0] : `these ${args.names.length} people`;
  const then = args.ban ? "They can't rejoin unless unbanned." : "They lose access and can ask to join again later.";
  return `${args.ban ? "Ban" : "Remove"} ${who}? ${then} Anyone paying loses their subscription.`;
}

// A reply in the person's direct messages, to the one other person in it.
export function messageQuestion(name: string): string {
  return `Send this to ${name} as you?`;
}

export function messageResultLine(name: string): string {
  return `Sent to ${name} as you.`;
}

export function handbookQuestion(text: string): string {
  return text.trim() ? "Publish this handbook to every member?" : "Take the handbook away from members?";
}

export function changeResultLine(args: { operation: string; succeeded: number; asked: number }): string {
  const gone = args.operation === "community.members.ban" ? "banned" : args.operation === "community.members.remove" ? "removed" : null;
  if (gone) {
    if (args.succeeded === args.asked) return args.asked === 1 ? `They were ${gone}.` : `${args.asked} people were ${gone}.`;
    return `${args.succeeded} of ${args.asked} people were ${gone}; the others couldn't be.`;
  }
  if (args.operation !== "community.members.set_role") return "The handbook members see was changed.";
  if (args.succeeded === args.asked) return args.asked === 1 ? "Their role was changed." : `The role of ${args.asked} people was changed.`;
  return `The role of ${args.succeeded} of ${args.asked} people was changed; the others couldn't be.`;
}

export function postResultLine(args: { mode: string; channelName: string }): string {
  const channel = `#${args.channelName}`;
  if (args.mode === "append") return `Replied in ${channel} as you.`;
  if (args.mode === "update") return `Your post in ${channel} was changed.`;
  if (args.mode === "delete") return `Your post in ${channel} was deleted.`;
  return `Posted in ${channel} as you.`;
}

export function removeResultLine(args: { removed: number; asked: number }): string {
  if (args.removed === args.asked) return args.asked === 1 ? "The post was removed." : `${args.asked} posts were removed.`;
  return `${args.removed} of ${args.asked} posts were removed; the others couldn't be.`;
}

// What the guide is told at the start of its next turn.
export function answerLineForGuide(args: { question: string; status: "done" | "declined" | "failed"; resultLine: string | null }): string {
  if (args.status === "declined") return `"${args.question}" They said no. Nothing was done.`;
  if (args.status === "failed") return `"${args.question}" They said yes, but it couldn't be done: ${args.resultLine ?? "it was refused."}`;
  return `"${args.question}" They said yes. ${args.resultLine ?? "Done."}`;
}

// What the guide's tool call answers while the person hasn't.
export const WAITING_FOR_PERSON = "waiting_for_person";
export function waitingToolAnswer(question: string) {
  return {
    ok: true,
    status: WAITING_FOR_PERSON,
    question,
    note: "Not done yet. The person now sees this question, with what it would do, above the box where they type, with Yes and No. Say one short line that it is ready for their yes, and stop. Don't repeat the words and don't ask again. You are told their answer at the start of your next turn.",
  };
}
