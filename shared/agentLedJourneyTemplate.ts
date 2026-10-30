import type { CommunityMemberWorkflowAutomation } from "./communityMemberWorkflow";

// The agent-led journey: a Workflow template where the community agent leads
// each member from joining to the owner's checkpoint. Every step uses features
// the Workflow already has (a private guide channel, the onboarding form, "ask
// the agent" steps, lesson and course triggers, goal reviews), so the owner can
// change any of it afterwards like any other stage.
//
// How the engine shapes it: every rule in a stage is a step the member's visit
// must finish before the goal review moves them on (nudges excepted: they only
// run if the member is still in the stage), and a lesson or course can
// only trigger a Form or a client-property write. So a finished lesson writes
// the "Journey" property, and the agent's follow-up runs right after that write.
//
// Settings UI applies it with the stage create/update calls; the owner's agent
// does the same with community.client.property.create and
// community.workflow.stage.create / .update, reading this plan from
// /builder/workflow-templates.json.

export const AGENT_LED_JOURNEY_TEMPLATE_KEY = "agent_led_journey";

/** Stands in for the Journey property's key until it exists. */
export const AGENT_LED_JOURNEY_PROPERTY_PLACEHOLDER = "{journey_property}";

export const AGENT_LED_JOURNEY_PROPERTY = {
  name: "Journey",
  type: "select" as const,
  options: ["Finished first lesson", "Finished a course"],
};

type TemplateAutomation = Omit<CommunityMemberWorkflowAutomation, "key">;

export type AgentLedJourneyStage = {
  name: string;
  goal: string;
  instructions: string;
  requireHumanApproval: boolean;
  automations: TemplateAutomation[];
};

export type AgentLedJourneyPlan = {
  key: typeof AGENT_LED_JOURNEY_TEMPLATE_KEY;
  property: typeof AGENT_LED_JOURNEY_PROPERTY;
  /** Rules added to the Workflow's existing first stage (its Member joins rules). */
  firstStageAdditions: TemplateAutomation[];
  /** Stages created, in order. With no Workflow yet, the first is the welcome stage. */
  stages: AgentLedJourneyStage[];
};

const ON_ENTRY_MINUTES = 1;
const DAY = 24 * 60;

const GUIDE_ROLE = "You are this member's guide. Lead, don't wait to be asked: one clear next step at a time, in plain words, tied to what they told us about their business. Keep messages short. Never invent progress; read it.";

const WELCOME_PROMPT = "Welcome the member by name in their guide channel. Use their onboarding answers to say, in two or three sentences, what they're here to get done. Then give the one first step that moves them toward it (usually the first lesson) and why it's first. End with one easy question they can answer in a line.";

const WELCOME_PROMPT_NO_FORM = "Welcome the member by name in their guide channel. Ask, in one short message, what their business sells and the one recurring job they most want off their plate. Say that you'll pick their first step from the answer.";

function setJourney(key: string, value: string): TemplateAutomation["action"] {
  return { key, type: "set_client_property", propertyKey: AGENT_LED_JOURNEY_PROPERTY_PLACEHOLDER, value };
}

/**
 * The plan for one community. `onboardingFormKey` is a published form to ask
 * on joining (the Workflow's own, when it has one). With `hasWorkflow`, the
 * welcome rules go onto the existing first stage instead of a new one.
 */
export function buildAgentLedJourneyPlan(args: {
  hasWorkflow: boolean;
  onboardingFormKey: string | null;
  firstStageAutomations?: CommunityMemberWorkflowAutomation[];
}): AgentLedJourneyPlan {
  const existing = args.firstStageAutomations ?? [];
  const has = (match: (automation: CommunityMemberWorkflowAutomation) => boolean) => existing.some(match);

  const welcome: TemplateAutomation[] = [];
  if (!has((a) => a.trigger.type === "member_joined" && a.action.type === "create_service_channel")) {
    welcome.push({ trigger: { type: "member_joined" }, action: { key: "draft-guide-channel", type: "create_service_channel" } });
  }
  const formKey = args.onboardingFormKey;
  if (formKey) {
    if (!has((a) => a.trigger.type === "member_joined" && a.action.type === "request_form" && a.action.formKey === formKey)) {
      welcome.push({ trigger: { type: "member_joined" }, action: { key: "draft-onboarding-form", type: "request_form", formKey } });
    }
    // One "ask the agent" per submitted form; keep the owner's if there is one.
    if (!has((a) => a.trigger.type === "form_submitted" && a.trigger.formKey === formKey && a.action.type === "prompt_agent")) {
      welcome.push({ trigger: { type: "form_submitted", formKey }, action: { key: "draft-welcome", type: "prompt_agent", prompt: WELCOME_PROMPT } });
    }
  } else {
    welcome.push({ trigger: { type: "milestone_elapsed", delayMinutes: ON_ENTRY_MINUTES }, action: { key: "draft-welcome", type: "prompt_agent", prompt: WELCOME_PROMPT_NO_FORM } });
  }

  const welcomeStage: AgentLedJourneyStage = {
    name: "Welcome",
    goal: "The member has told us about their business and knows their first step.",
    instructions: GUIDE_ROLE,
    requireHumanApproval: false,
    automations: welcome,
  };

  const stages: AgentLedJourneyStage[] = [
    {
      name: "First win",
      goal: "Finished their first lesson and tried it on their own business.",
      instructions: `${GUIDE_ROLE} In this stage the member works through their first lesson.`,
      requireHumanApproval: false,
      automations: [
        { trigger: { type: "milestone_elapsed", delayMinutes: ON_ENTRY_MINUTES }, action: { key: "draft-first-intro", type: "prompt_agent",
          prompt: "The member just reached this stage. In their guide channel, name the one lesson to do now (read their progress and onboarding answers to pick it), say what they'll have when it's done, and how long it takes." } },
        { trigger: { type: "lesson_completed" }, action: setJourney("draft-first-lesson", "Finished first lesson") },
        { trigger: { type: "previous_action_completed", predecessorActionKey: "draft-first-lesson" }, action: { key: "draft-first-follow-up", type: "prompt_agent",
          prompt: "The member just finished a lesson. Name what they finished, ask what happened when they tried it on their business, and give the next lesson with one line on why it's next." } },
        { trigger: { type: "milestone_elapsed", delayMinutes: 3 * DAY, nudge: true }, action: { key: "draft-first-nudge", type: "prompt_agent",
          prompt: "The member has been on their first lesson for three days. Read their progress, then check in kindly: ask where they got stuck and offer a 10-minute version of the step." } },
      ],
    },
    {
      name: "Build it",
      goal: "Has a working result on real data from their business and has shown it in their guide channel.",
      instructions: `${GUIDE_ROLE} In this stage the member builds their first real result. Ask for evidence (a screenshot, a link, a short write-up) rather than taking 'done' on faith.`,
      requireHumanApproval: false,
      automations: [
        { trigger: { type: "milestone_elapsed", delayMinutes: ON_ENTRY_MINUTES }, action: { key: "draft-build-intro", type: "prompt_agent",
          prompt: "The member just reached this stage. In their guide channel, say what they'll build next from their onboarding answers, which course gets them there, and what you'll ask to see when it works." } },
        { trigger: { type: "course_completed" }, action: setJourney("draft-course-done", "Finished a course") },
        { trigger: { type: "previous_action_completed", predecessorActionKey: "draft-course-done" }, action: { key: "draft-course-follow-up", type: "prompt_agent",
          prompt: "The member finished a course. Congratulate them in one line, then ask them to show the result they built with it here: what it does and one example run on real data." } },
        { trigger: { type: "milestone_elapsed", delayMinutes: 7 * DAY, nudge: true }, action: { key: "draft-build-nudge", type: "prompt_agent",
          prompt: "The member has been building for a week. Read their progress and messages. Ask one question that unblocks the next step, and offer to break it into something they can finish today." } },
      ],
    },
    {
      name: "Checkpoint",
      goal: "The owner has reviewed the member's result and agreed what they work on next.",
      instructions: `${GUIDE_ROLE} The owner reviews every member here. Summarise what the member built, the evidence, and what you'd suggest next.`,
      requireHumanApproval: true,
      automations: [
        { trigger: { type: "milestone_elapsed", delayMinutes: ON_ENTRY_MINUTES }, action: { key: "draft-checkpoint", type: "prompt_agent",
          prompt: "The member reached the checkpoint. Tell them what happens now: the owner reviews their result, and you'll share what's next after that. List, in three short bullets, what they've finished so far." } },
      ],
    },
  ];

  return {
    key: AGENT_LED_JOURNEY_TEMPLATE_KEY,
    property: AGENT_LED_JOURNEY_PROPERTY,
    firstStageAdditions: args.hasWorkflow ? welcome : [],
    stages: args.hasWorkflow ? stages : [welcomeStage, ...stages],
  };
}

/** Puts the Journey property's real key into the plan's rules. */
export function withJourneyPropertyKey<T extends { action: TemplateAutomation["action"] }>(automations: T[], propertyKey: string): T[] {
  return automations.map((automation) => automation.action.type === "set_client_property"
    && automation.action.propertyKey === AGENT_LED_JOURNEY_PROPERTY_PLACEHOLDER
    ? { ...automation, action: { ...automation.action, propertyKey } }
    : automation);
}

/** Plain-words summary for the confirm step and for agents. */
export function describeAgentLedJourneyPlan(plan: AgentLedJourneyPlan): string[] {
  const lines: string[] = [];
  if (plan.firstStageAdditions.length) {
    lines.push("Your first stage: the agent opens a private guide channel and welcomes each member from their onboarding answers.");
  }
  for (const stage of plan.stages) {
    lines.push(`${stage.name}: ${stage.goal}${stage.requireHumanApproval ? " You approve each member." : ""}`);
  }
  return lines;
}
