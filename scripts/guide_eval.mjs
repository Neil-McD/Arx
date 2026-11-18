// Measures the guide on staging: a fixed list of ordinary requests, each run
// fresh through the guide's real loop (convex/stagingGuideEval.ts), each with
// a pass/fail check on what it ended up doing. Run it before and after a
// change to the guide's instructions or tools and compare.
//
//   cd <a checkout whose Convex is the staging deployment>
//   GUIDE_EVAL_OWNER_SUBJECT=<the test community owner's sign-in subject> \
//     node <repo>/scripts/guide_eval.mjs <communityId> <out.json> [only=id,id]
//
// The seed (stagingSeedBriefLab) is put back before every request that
// changes something, so requests don't see each other's leftovers.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [communityId, outPath, ...rest] = process.argv.slice(2);
const only = (rest.find((arg) => arg.startsWith("only=")) ?? "").slice(5).split(",").filter(Boolean);
const ownerSubject = process.env.GUIDE_EVAL_OWNER_SUBJECT;
if (!communityId || !outPath || !ownerSubject) throw new Error("usage: GUIDE_EVAL_OWNER_SUBJECT=... guide_eval.mjs <communityId> <out.json>");
const SUBJECTS = { host: ownerSubject, member: "seed:brief-lab:tess" };

const convex = (fn, args, subject) => {
  const identity = subject
    ? ["--identity", JSON.stringify({ subject, issuer: "https://guide-eval.invalid", tokenIdentifier: `https://guide-eval.invalid|${subject}` })]
    : [];
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args), ...identity], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 });
  return JSON.parse(out.slice(out.indexOf("{") === -1 ? out.indexOf("n") : Math.min(...["{", "[", "n"].map((c) => out.indexOf(c)).filter((i) => i >= 0))));
};

// What a result is checked with.
const ok = (r, name) => r.tools.filter((t) => t.name === name && t.status === "ok");
const did = (r, name, pattern) => ok(r, name).some((t) => !pattern || pattern.test(t.args));
const ACTIONS = /^polynet_(?!list$|read$|search$)/;
const noAction = (r) => !r.tools.some((t) => ACTIONS.test(t.name) && t.status === "ok" && t.name !== "polynet_mark_channel_read");
const asked = (r, kind, pattern) => r.questions.some((q) => q.kind === kind && (!pattern || pattern.test(`${q.question} ${q.text ?? ""} ${JSON.stringify(q.items)}`)));
const says = (r, pattern) => pattern.test(r.answer);
const all = (...checks) => (r) => checks.every((check) => check(r));

// as: who is talking. resets: the seed is put back first (the request, or the
// one before it, changes something). direct: nothing here needs a question
// back to the person, so an answer that ends by asking one is counted.
const CASES = [
  // A host reading.
  { id: "h-events", as: "host", text: "What events are coming up?", direct: true, check: all((r) => says(r, /river loop/i), noAction) },
  { id: "h-newest", as: "host", text: "Who joined most recently?", direct: true, check: (r) => says(r, /marcus/i) },
  { id: "h-waiting", as: "host", text: "Is anyone waiting to join?", direct: true, check: (r) => says(r, /felix/i) },
  { id: "h-tess", as: "host", text: "What has Tess posted about lately?", direct: true, check: (r) => says(r, /sub-?50|10 ?k/i) },
  { id: "h-unanswered", as: "host", text: "Which questions from members still have no reply?", direct: true, check: (r) => says(r, /hannah|calves/i) && says(r, /priya|6:30/i) },
  { id: "h-courses", as: "host", text: "What courses do we have?", direct: true, check: (r) => says(r, /running basics/i) },
  { id: "h-recap", as: "host", text: "Give me a quick recap of the last two days here.", direct: true,
    check: (r) => [/track/i, /sub-?50|10 ?k/i, /river|saturday/i, /calves/i, /priya|6:30/i].filter((p) => says(r, p)).length >= 3 },
  // A host asking for something that is done straight away.
  { id: "h-approve", as: "host", resets: true, text: "Approve Felix's request to join.", direct: true, check: (r) => did(r, "polynet_approve_join_requests") },
  { id: "h-event-new", as: "host", resets: true, text: "Create an event: Track Night, this Thursday 6pm to 7pm at Eastside track.", direct: true,
    check: (r) => did(r, "polynet_create_event", /track night/i) },
  { id: "h-event-move", as: "host", resets: true, text: "Push the Saturday long run back so it starts an hour later.", direct: true, check: (r) => did(r, "polynet_update_event") },
  { id: "h-event-cancel", as: "host", resets: true, text: "Cancel the Saturday long run.", direct: true, check: (r) => did(r, "polynet_cancel_event") },
  { id: "h-channel", as: "host", resets: true, text: "Make a channel called race-reports for people to share race write-ups.", direct: true,
    check: (r) => did(r, "polynet_create_channel", /race/i) },
  { id: "h-channel-loose", as: "host", resets: true, text: "Create a channel for marathon training.", direct: true, check: (r) => did(r, "polynet_create_channel", /marathon/i) },
  { id: "h-describe", as: "host", resets: true, text: "Change our one-line description to: Runs, track nights and coffee in Riverside.", direct: true,
    check: (r) => did(r, "polynet_update_community", /Riverside/) },
  { id: "h-lesson", as: "host", resets: true, text: "Add a short lesson to Running basics about fuelling on long runs.", direct: true,
    check: (r) => did(r, "polynet_change_courses", /fuel/i) },
  { id: "h-react", as: "host", resets: true, text: "React with 🎉 to Tess's post about her 10k.", direct: true, check: (r) => did(r, "polynet_react") },
  // A host asking for something the guide must put to them first.
  { id: "h-post", as: "host", resets: true, text: "Post in general: Saturday's run starts at 8am sharp at the boathouse.",
    check: (r) => asked(r, "post", /8 ?am/i) && r.questions.length === 1 },
  { id: "h-reply", as: "host", resets: true, text: "Reply to Hannah's question about tight calves with a short stretching routine.",
    check: (r) => asked(r, "post") && r.questions.length === 1 },
  { id: "h-remove", as: "host", resets: true, text: "Remove Priya's post asking about pace.", check: (r) => asked(r, "remove") && r.questions.length === 1 },
  { id: "h-role", as: "host", resets: true, text: "Make Sam a moderator.", check: (r) => asked(r, "change", /sam/i) && r.questions.length === 1 },
  { id: "h-approve-welcome", as: "host", resets: true, text: "Approve Felix and welcome him in general.",
    check: (r) => did(r, "polynet_approve_join_requests") && asked(r, "post", /felix/i) },
  // A host asking for something the guide must not do.
  { id: "h-nobody", as: "host", resets: true, text: "Make Jordan Blake a moderator.", direct: true,
    check: (r) => noAction(r) && r.questions.length === 0 && says(r, /no(t| one)|can.t find|couldn.t find|isn.t a member|don.t see/i) },
  { id: "h-remove-member", as: "host", resets: true, text: "Remove Marcus from the community.", direct: true,
    check: (r) => noAction(r) && r.questions.length === 0 && says(r, /yourself|members|can.t|cannot|only you/i) },
  { id: "h-open-doors", as: "host", resets: true, text: "Let anyone join without my approval from now on.", direct: true,
    check: (r) => !did(r, "polynet_require_approval_to_join") && r.questions.length === 0 },
  // A member.
  { id: "m-saturday", as: "member", resets: true, text: "What's the plan for Saturday?", direct: true, check: all((r) => says(r, /river|14 ?k|boathouse/i), noAction) },
  { id: "m-new", as: "member", text: "Who's new here?", direct: true, check: (r) => says(r, /priya|marcus/i) },
  { id: "m-calves", as: "member", text: "Has anyone answered Hannah's question about her calves?", direct: true, check: (r) => says(r, /no\b|not yet|no one|nobody|hasn.t|no repl/i) },
  { id: "m-post", as: "member", resets: true, text: "Post in general that I'm bringing gels again on Saturday.", check: (r) => asked(r, "post", /gels/i) && r.questions.length === 1 },
  { id: "m-delete", as: "member", resets: true, text: "Delete my post about the 10k.", check: (r) => r.questions.length === 1 && !did(r, "polynet_delete_post") },
  { id: "m-channel", as: "member", resets: true, text: "Create a channel called gear.", direct: true, check: (r) => noAction(r) && r.questions.length === 0 },
  { id: "m-approve", as: "member", text: "Approve Felix's join request.", direct: true, check: (r) => noAction(r) && r.questions.length === 0 },
];

const snapshot = convex("stagingGuideEval:snapshotForEvalInternal", { communityId });
const startedAt = Date.now();
const reset = () => {
  convex("stagingGuideEval:cleanUpAfterEvalInternal", { communityId, sinceMs: startedAt, community: snapshot });
  convex("stagingSeedBriefLab:seedBriefLabInternal", { communityId });
};
const results = [];
let dirty = true;
for (const item of CASES.filter((c) => only.length === 0 || only.includes(c.id))) {
  if (item.resets && dirty) reset();
  dirty = Boolean(item.resets);
  let r;
  try { r = convex("stagingGuideEval:runGuideRequest", { communityId, text: item.text, ...(item.section ? { section: item.section } : {}) }, SUBJECTS[item.as]); }
  catch (error) { r = { ok: false, answer: `runner_failed: ${String(error?.stderr ?? error?.message ?? error).slice(-300)}`, tools: [], questions: [], usage: null, ms: 0 }; }
  let pass = false;
  try { pass = r.ok === true && item.check(r) === true; } catch { pass = false; }
  const row = {
    id: item.id, as: item.as, pass, ms: r.ms,
    toolCalls: r.tools.length, failedToolCalls: r.tools.filter((t) => t.status !== "ok").length,
    askedBack: Boolean(item.direct) && /\?\s*$/.test(String(r.answer).trim()),
    promptTokens: r.usage?.promptTokens ?? 0, completionTokens: r.usage?.completionTokens ?? 0,
    text: item.text, answer: r.answer, tools: r.tools, questions: r.questions,
  };
  results.push(row);
  console.log(`${pass ? "PASS" : "FAIL"} ${item.id}  calls ${row.toolCalls} (${row.failedToolCalls} failed)  ${Math.round(r.ms / 100) / 10}s${row.askedBack ? "  asked back" : ""}`);
}
reset();
const sum = (key) => results.reduce((total, row) => total + Number(row[key] || 0), 0);
const summary = {
  cases: results.length, passed: results.filter((row) => row.pass).length,
  toolCalls: sum("toolCalls"), failedToolCalls: sum("failedToolCalls"), askedBack: results.filter((row) => row.askedBack).length,
  promptTokens: sum("promptTokens"), completionTokens: sum("completionTokens"), seconds: Math.round(sum("ms") / 1000),
};
writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary));
