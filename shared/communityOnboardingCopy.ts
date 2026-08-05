import type { CommunityOnboardingCopyCue } from "./communityOnboarding";
import { formatCommunityIntelligenceName } from "./memberAgentSurfaceContext";

export function buildCommunityOnboardingCopy(params: {
  cue: CommunityOnboardingCopyCue;
  communityName: string;
  hasVideo: boolean;
}): string {
  const intelligenceName = formatCommunityIntelligenceName(params.communityName) ?? "Community Intelligence";
  if (params.cue === "community_composer") {
    return [
      `Let’s introduce you to ${params.communityName}.`,
      "I started the message below. Finish it in your own words, then send it to the community.",
    ].join("\n\n");
  }
  if (params.cue === "personal_agent_intro") {
    return [
      `Meet ${intelligenceName}.`,
      `It understands ${params.communityName} context. Send the focused question below to discover one useful first action in the community.`,
    ].join("\n\n");
  }
  if (params.cue === "personal_agent_review") {
    return [
      `${intelligenceName} has answered.`,
      "Read its response and keep chatting if you want. When the next move makes sense, continue to the final step.",
    ].join("\n\n");
  }
  if (params.cue === "mcp_handoff") {
    return [
      "**Take Polynet with you.**",
      `Polynet MCP lets you work with ${params.communityName} and your other authorized Polynet communities from the AI harnesses you already use.`,
    ].join("\n\n");
  }

  return [
    `Welcome to ${params.communityName}.`,
    "I’m your community concierge. I’ll help you get oriented and take your first steps here.",
    params.hasVideo
      ? "Start with this short welcome from the founder. When you’re finished, I’ll help you introduce yourself to the community."
      : "Let’s begin with a quick introduction so the community can get to know you.",
  ].join("\n\n");
}
