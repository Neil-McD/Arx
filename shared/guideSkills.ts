// Skills: how the guide does a longer job well. Each is one document under a
// community's skills/ folder, read by whoever is offered the tools it is
// about (convex/polynetCanonicalExecutor.ts serves it), and put in the guide's
// prompt without being asked only on the page where that job is done
// (shared/runtimePrompt.ts). Otherwise the prompt carries a one-line pointer.

export type GuideSkill = {
  // skills/<name>.md
  name: string;
  // The pointer's words: what the skill is for.
  about: string;
  // Offered to whoever is given this tool.
  tool: string;
  // The page sections (shared/communityAgentSurfaceContext.ts) where it is
  // loaded without asking: the app's value, and the measurement's alias.
  loadedOn: readonly string[];
  text: string;
};

export const COURSE_BUILDING_SKILL_MD = [
  "Making and changing courses",
  "",
  "- A course holds lessons. A new course is a draft: members see nothing of it until the host turns on Published, in Knowledge. In a course that is already published, a new or changed lesson shows to members at once. Whether members can see a lesson is what its members_can_see says, in builder/resources/ and in what polynet_change_courses answers; a lesson is never a draft on its own.",
  "- Look once before changing anything: list builder/resources/. It shows every course and lesson, drafts included, and what needs attention.",
  "- When they ask for a specific change (\"add a lesson on X to Y\"), make it. Afterwards say what you added and, if the course is published, that members can see it now. Do not ask first.",
  "- When they ask for something broad (\"tidy this up\", \"organise the courses\"), say what is there and what you would change, and make the change once they agree.",
  "- Write a lesson from what they gave you, from what the community already has (its lessons, notes, posts), or from a source they added that is ready. If they ask you to draft from your own knowledge, do it, and say it is your draft for them to check. Never state something about this community that you have not read.",
  "- Make the whole change in one polynet_change_courses call (up to 25 changes; it is saved as a whole or not at all).",
  "- Publishing or unpublishing a course is polynet_publish_course; deleting a published course or a lesson in one is polynet_delete_published. Each asks them first, with Yes and No. Delete only when they clearly ask; drafts are deleted in a polynet_change_courses batch.",
  "- A lesson's video is its url (a YouTube, Loom, Vimeo or Wistia link; any other link is refused). Set it when they give you one; a lesson's video field in builder/resources/ shows what it has. Files under a lesson are added by a person in the app.",
  "- Sources: the host adds a link or a file as a source in Knowledge. Use only sources marked ready. Never move or delete a source.",
  "- In your reply use titles, not ids: what changed, which courses are still drafts, what members can see.",
].join("\n");

export const MEMBER_BOARD_SKILL_MD = [
  "Managing the Member Board",
  "",
  "- Read builder/journey.json once before changing anything on the board. In larger communities, list builder/journey/ to read filtered slices by stage (builder/journey/stage/<key>.json) or by status (builder/journey/status/stuck.json, needs_you.json, ready_to_advance.json, on_track.json, quiet.json, done.json).",
  "- Read builder/brief.md for the latest Daily Founder Brief and builder/suggestions.json for waiting Chief of Staff suggestions on Home (stage moves, plus owner-only member check-in and channel reply drafts).",
  "- Also check builder/community.json when you need to know the community's current plan tier (free, guide, or chief_of_staff) and whether hosted AI is turned on.",
  "- Never guess a person's handle, a stage key, or a draft id; copy them from builder/journey.json, builder/suggestions.json, or the members listing.",
  "- When the host asks for a specific update (move someone to a stage, pin or reset a status, check off a milestone, log a win, save a coaching note, approve/dismiss a stage move, or skip a waiting draft), do it directly and report back using names and stage titles rather than raw keys.",
  "- When the host replies to a morning brief or asks you to handle waiting Home actions (for example, 'can you do it', 'advance all 11', or 'move them'), read builder/suggestions.json first. Batch stage moves heading to the same destination stage in a single polynet_move_member_stage call (up to 50 members per call) instead of calling polynet_decide_stage_move one by one. For waiting check-in or reply drafts, use polynet_send_guide_draft (which asks Yes or No before messaging members).",
  "- To rename, reorder, or add stages or checkpoints, pass the full ordered list to polynet_update_journey_stages and keep every existing stage key.",
  "- Removing a stage uses polynet_remove_journey_stage, and sending a waiting Guide check-in or channel reply draft uses polynet_send_guide_draft; both always ask Yes or No first.",
  "- On Chief of Staff communities, Stage 1 of the Member Board drives automated Day-0 member onboarding (using Stage 1's goal, checkpoints, handbook, starter course, and connected app), followed by Day 2+ newcomer and stage check-ins. Connected software products can also check off custom Member Board milestones automatically via POST /apps/v1/milestones.",
  "- Coaching notes steer how the guide helps a member privately without ever telling the member a note exists. Never expose a member's private one-on-one conversation words when summarizing the board.",
].join("\n");

export const GUIDE_SKILLS: readonly GuideSkill[] = [
  {
    name: "course-building",
    about: "making, changing or reorganising courses and lessons.",
    tool: "polynet_change_courses",
    loadedOn: ["resources", "knowledge"],
    text: COURSE_BUILDING_SKILL_MD,
  },
  {
    name: "member-board",
    about: "inspecting and updating the Member Board (stages, checkpoints, statuses, wins, coaching notes, and acting on waiting Home suggestions or morning briefs).",
    tool: "polynet_move_member_stage",
    loadedOn: ["members"],
    text: MEMBER_BOARD_SKILL_MD,
  },
];

export const GUIDE_SKILLS_DIRECTORY_PATH = "/skills/";

export function guideSkillPath(skill: GuideSkill): string {
  return `${GUIDE_SKILLS_DIRECTORY_PATH}${skill.name}.md`;
}

// The skills offered with these tools.
export function guideSkillsFor(toolNames: readonly string[]): GuideSkill[] {
  return GUIDE_SKILLS.filter((skill) => toolNames.includes(skill.tool));
}

// skills/<name>.md, inside a community's folder.
export function guideSkillAt(localPath: string): GuideSkill | null {
  return GUIDE_SKILLS.find((skill) => guideSkillPath(skill) === localPath) ?? null;
}
