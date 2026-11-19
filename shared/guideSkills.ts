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
  "- Sources: the host adds a link or a file as a source in Knowledge. Use only sources marked ready. Never move or delete a source.",
  "- In your reply use titles, not ids: what changed, which courses are still drafts, what members can see.",
].join("\n");

export const GUIDE_SKILLS: readonly GuideSkill[] = [
  {
    name: "course-building",
    about: "making, changing or reorganising courses and lessons.",
    tool: "polynet_change_courses",
    loadedOn: ["resources", "knowledge"],
    text: COURSE_BUILDING_SKILL_MD,
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
