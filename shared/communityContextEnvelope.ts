import { composeCloudScopedSystemPrompt } from "./communitySystemPromptResolver";

export type CloudCommunityContextPromptSource = "community_draft" | "default_template";

export type CloudCommunityContextEnvelope = {
  communityId: string | null;
  communityName: string | null;
  communitySystemPromptSource: CloudCommunityContextPromptSource | null;
  communityPromptDraftId: string | null;
  scopedSystemPrompt: string;
};

function normalizeTrimmed(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function buildCloudCommunityContextEnvelope(params: {
  communityId?: string | null;
  communityName?: string | null;
  customCommunitySystemPrompt?: string | null;
  communityPromptDraftId?: string | null;
  personalSystemPrompt?: string | null;
}): CloudCommunityContextEnvelope {
  const communityIdRaw = normalizeTrimmed(params.communityId);
  const communityNameRaw = normalizeTrimmed(params.communityName);
  const customCommunitySystemPrompt = normalizeTrimmed(params.customCommunitySystemPrompt);
  const personalSystemPrompt = normalizeTrimmed(params.personalSystemPrompt);
  const communityPromptDraftIdRaw = normalizeTrimmed(params.communityPromptDraftId);

  const hasCommunityScope = communityIdRaw.length > 0;
  const communitySystemPromptSource: CloudCommunityContextPromptSource | null = hasCommunityScope
    ? customCommunitySystemPrompt
      ? "community_draft"
      : "default_template"
    : null;

  return {
    communityId: hasCommunityScope ? communityIdRaw : null,
    communityName: hasCommunityScope ? communityNameRaw || null : null,
    communitySystemPromptSource,
    communityPromptDraftId: communityPromptDraftIdRaw || null,
    scopedSystemPrompt: composeCloudScopedSystemPrompt({
      communityId: hasCommunityScope ? communityIdRaw : null,
      communityName: hasCommunityScope ? communityNameRaw || null : null,
      customCommunitySystemPrompt,
      personalSystemPrompt,
    }),
  };
}
