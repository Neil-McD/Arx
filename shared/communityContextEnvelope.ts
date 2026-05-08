import {
  composePlatformCommunityContextSystemPrompt,
  type RuntimeCommunityPromptFields,
} from "./runtimePrompt";

export type CloudCommunityContextPromptSource = "community_draft" | "default_template";

export type CloudCommunityContextEnvelope = {
  communityId: string | null;
  communityName: string | null;
  communitySlug: string | null;
  communitySystemPromptSource: CloudCommunityContextPromptSource | null;
  communityPromptDraftId: string | null;
  scopedSystemPrompt: string;
};

function normalizeTrimmed(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function buildCloudCommunityContextEnvelope(params: RuntimeCommunityPromptFields & {
  communityPromptDraftId?: string | null;
}): CloudCommunityContextEnvelope {
  const communityIdRaw = normalizeTrimmed(params.communityId);
  const communityNameRaw = normalizeTrimmed(params.communityName);
  const communitySlugRaw = normalizeTrimmed(params.communitySlug);
  const communityOneLinerRaw = normalizeTrimmed(params.communityOneLiner);
  const communityAboutRaw = normalizeTrimmed(params.communityAbout);
  const communitySystemPrompt = normalizeTrimmed(params.communitySystemPrompt);
  const communityPromptDraftIdRaw = normalizeTrimmed(params.communityPromptDraftId);

  const hasCommunityScope = communityIdRaw.length > 0;
  const communitySystemPromptSource: CloudCommunityContextPromptSource | null = hasCommunityScope
    ? communitySystemPrompt
      ? "community_draft"
      : "default_template"
    : null;

  return {
    communityId: hasCommunityScope ? communityIdRaw : null,
    communityName: hasCommunityScope ? communityNameRaw || null : null,
    communitySlug: hasCommunityScope ? communitySlugRaw || null : null,
    communitySystemPromptSource,
    communityPromptDraftId: communityPromptDraftIdRaw || null,
    scopedSystemPrompt: composePlatformCommunityContextSystemPrompt({
      communityId: hasCommunityScope ? communityIdRaw : null,
      communityName: hasCommunityScope ? communityNameRaw || null : null,
      communitySlug: hasCommunityScope ? communitySlugRaw || null : null,
      communityOneLiner: hasCommunityScope ? communityOneLinerRaw || null : null,
      communityAbout: hasCommunityScope ? communityAboutRaw || null : null,
      communitySystemPrompt,
    }),
  };
}
