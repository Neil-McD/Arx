export type CommunityAgentLandingTab = {
  id: string;
  label: string;
  prompts: string[];
};

export type CommunityAgentLanding = {
  title: string;
  subtitle: string;
  tabs: CommunityAgentLandingTab[];
};

export const DEFAULT_EMPTY_THREAD_LANDING: CommunityAgentLanding = {
  title: "How can I help?",
  subtitle: "Start with a prompt, or ask anything.",
  tabs: [
    {
      id: "community",
      label: "Community",
      prompts: [
        "What is a community, and why would I start one?",
        "Help me pick a community topic people will care about.",
        "Write my welcome message and simple rules.",
        "How do I get my first 20 members? Give me a simple plan.",
      ],
    },
    {
      id: "plan",
      label: "Plan",
      prompts: [
        "Help me plan my week so I actually ship.",
        "Turn my big goal into 5 small steps. Ask me 2 questions first.",
        "Make a simple 30-day plan for a launch.",
        "What should I do first today? Ask me 3 questions.",
      ],
    },
    {
      id: "ops",
      label: "Desktop",
      prompts: [
        "What can the desktop app do that the web can't?",
        "Help me set up the desktop app in a safe way.",
        "How do I use the desktop app with my project folder (simple steps)?",
        "Should I use web or desktop for this? Ask me a few questions.",
      ],
    },
    {
      id: "learn",
      label: "Learn",
      prompts: [
        "What is Arx, in plain English?",
        "What does Arx remember, and what does it forget?",
        "What gets saved online vs on my computer?",
        "How do paid communities work here (simple version)?",
      ],
    },
  ],
};

export function buildDefaultCommunityEmptyThreadLanding(
  communityName: string,
): CommunityAgentLanding {
  const name = communityName.trim();
  return {
    title: name ? `Welcome to ${name}` : "Welcome",
    subtitle: "Say hi in Chat, browse Resources, or ask the AI agent for help.",
    tabs: [
      {
        id: "start",
        label: "Start here",
        prompts: [
          "Where do I find Chat and Resources in this community?",
          "Help me write a short intro message to post in Chat.",
          "Ask me 5 questions so you can point me to the right place in this community.",
          "What should I do first to get value here?",
        ],
      },
      {
        id: "community",
        label: "Community",
        prompts: [
          "Help me write a post asking for feedback (short + clear).",
          "Help me turn my idea into a good question for the community.",
          "Write a friendly reply to someone who responded to my post.",
          "Suggest 3 ways I can contribute here this week (even as a beginner).",
        ],
      },
      {
        id: "agent",
        label: "AI Agent",
        prompts: [
          "What can the AI agent help me do here? Give me 5 simple examples.",
          "Help me make a simple plan for the next 7 days.",
          "Turn my notes into a clean outline, then a first draft.",
          "Ask me 5 questions to scope my goal before we start.",
        ],
      },
    ],
  };
}

export function normalizeCommunityAgentLanding(
  input: unknown,
): CommunityAgentLanding | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const subtitle = typeof raw.subtitle === "string" ? raw.subtitle.trim() : "";
  const tabsRaw = Array.isArray(raw.tabs) ? raw.tabs : [];
  const tabs: CommunityAgentLandingTab[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < tabsRaw.length; i++) {
    if (tabs.length >= 4) break;
    const tabRaw = tabsRaw[i];
    if (!tabRaw || typeof tabRaw !== "object") continue;
    const tab = tabRaw as Record<string, unknown>;
    const label = typeof tab.label === "string" ? tab.label.trim() : "";
    const promptsRaw = Array.isArray(tab.prompts) ? tab.prompts : [];
    const prompts = promptsRaw
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter((p) => p)
      .slice(0, 12);
    if (!label || prompts.length === 0) continue;
    let id = typeof tab.id === "string" ? tab.id.trim() : "";
    if (!id) id = `tab-${i + 1}`;
    while (seenIds.has(id)) id = `${id}-x`;
    seenIds.add(id);
    tabs.push({ id, label, prompts });
  }
  if (tabs.length === 0) return null;
  return {
    title: title || DEFAULT_EMPTY_THREAD_LANDING.title,
    subtitle: subtitle || DEFAULT_EMPTY_THREAD_LANDING.subtitle,
    tabs,
  };
}

export function normalizeCommunityAgentDraftForSave(
  draft: CommunityAgentLanding,
): CommunityAgentLanding | null {
  const tabs = draft.tabs
    .map((tab) => ({
      id: tab.id,
      label: (tab.label ?? "").trim(),
      prompts: (tab.prompts ?? []).map((p) => (p ?? "").trim()).filter(Boolean),
    }))
    .filter((tab) => tab.label && tab.prompts.length > 0)
    .slice(0, 4);
  if (tabs.length === 0) return null;
  return {
    title: (draft.title ?? "").trim() || DEFAULT_EMPTY_THREAD_LANDING.title,
    subtitle: (draft.subtitle ?? "").trim() || DEFAULT_EMPTY_THREAD_LANDING.subtitle,
    tabs,
  };
}
