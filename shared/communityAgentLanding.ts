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

type ParsedCommunityAgentLandingTab = {
  id: string;
  label: string;
  prompts: string[];
};

export const DEFAULT_EMPTY_THREAD_LANDING: CommunityAgentLanding = {
  title: "How can I help?",
  subtitle: "Start with a prompt, or ask anything.",
  tabs: [
    {
      id: "business",
      label: "Help me build a business",
      prompts: [
        "I’m exploring ideas that could become real businesses. Help me think through the strongest opportunities, which would fit me best, where I should begin, and how this platform could help me do it.",
      ],
    },
    {
      id: "platform",
      label: "Tell me about the platform",
      prompts: [
        "I’m new here and want to understand what this actually is. Give me a clear overview of how it works, who it’s most useful for, and the best way to get oriented.",
      ],
    },
    {
      id: "specific",
      label: "Help me with something specific",
      prompts: [
        "I have something specific I want help with. Help me get clear on the problem, what matters most, and the best next step.",
      ],
    },
  ],
};

function cloneDefaultLandingTabs(): CommunityAgentLandingTab[] {
  return DEFAULT_EMPTY_THREAD_LANDING.tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    prompts: [...tab.prompts],
  }));
}

function parseCommunityAgentLandingTabs(input: unknown): ParsedCommunityAgentLandingTab[] {
  const tabsRaw = Array.isArray(input) ? input : [];
  const tabs: ParsedCommunityAgentLandingTab[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < tabsRaw.length; i++) {
    const tabRaw = tabsRaw[i];
    if (!tabRaw || typeof tabRaw !== "object") continue;
    const tab = tabRaw as Record<string, unknown>;
    const promptsRaw = Array.isArray(tab.prompts) ? tab.prompts : [];
    const prompts = promptsRaw
      .map((prompt) => (typeof prompt === "string" ? prompt.trim() : ""))
      .filter(Boolean)
      .slice(0, 1);
    if (prompts.length === 0) continue;
    const label = typeof tab.label === "string" ? tab.label.trim() : "";
    let id = typeof tab.id === "string" ? tab.id.trim() : "";
    if (!id) id = `tab-${i + 1}`;
    while (seenIds.has(id)) id = `${id}-x`;
    seenIds.add(id);
    tabs.push({ id, label, prompts });
  }
  return tabs;
}

function canonicalizeCommunityAgentLandingTabs(
  input: unknown,
): CommunityAgentLandingTab[] | null {
  const candidates = parseCommunityAgentLandingTabs(input);
  if (candidates.length === 0) return null;
  return DEFAULT_EMPTY_THREAD_LANDING.tabs.map((defaultTab, index) => {
    const source = candidates.find((tab) => tab.id === defaultTab.id) ?? candidates[index] ?? null;
    return {
      id: defaultTab.id,
      label: source?.label || defaultTab.label,
      prompts: [source?.prompts[0] ?? defaultTab.prompts[0]],
    };
  });
}

export function normalizeCommunityAgentLanding(
  input: unknown,
): CommunityAgentLanding | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const tabs = canonicalizeCommunityAgentLandingTabs(raw.tabs);
  if (!tabs) return null;
  return {
    title: DEFAULT_EMPTY_THREAD_LANDING.title,
    subtitle: DEFAULT_EMPTY_THREAD_LANDING.subtitle,
    tabs,
  };
}

export function normalizeCommunityAgentDraftForSave(
  draft: CommunityAgentLanding,
): CommunityAgentLanding | null {
  const tabs = canonicalizeCommunityAgentLandingTabs(draft.tabs) ?? cloneDefaultLandingTabs();
  return {
    title: DEFAULT_EMPTY_THREAD_LANDING.title,
    subtitle: DEFAULT_EMPTY_THREAD_LANDING.subtitle,
    tabs,
  };
}
