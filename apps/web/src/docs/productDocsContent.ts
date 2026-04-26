import productDocsManifest from "../../../../docs/product/manifest.json";

import agentDoc from "../../../../docs/product/primitives/agent.md?raw";
import communityDoc from "../../../../docs/product/primitives/community.md?raw";
import communityLensDoc from "../../../../docs/product/primitives/community-lens.md?raw";
import funnelDoc from "../../../../docs/product/primitives/funnel.md?raw";
import memoryDoc from "../../../../docs/product/primitives/memory.md?raw";
import polynetDoc from "../../../../docs/product/primitives/polynet.md?raw";
import voiceDoc from "../../../../docs/product/primitives/voice.md?raw";
import workspaceDoc from "../../../../docs/product/primitives/workspace.md?raw";
import builderQuickstartDoc from "../../../../docs/product/guides/builder-quickstart.md?raw";
import chatAndResourcesDoc from "../../../../docs/product/guides/chat-and-resources.md?raw";
import configureCommunityAgentDoc from "../../../../docs/product/guides/configure-community-agent.md?raw";
import connectAppsAndMcpsDoc from "../../../../docs/product/guides/connect-apps-and-mcps.md?raw";
import createAndUseSkillsDoc from "../../../../docs/product/guides/create-and-use-skills.md?raw";
import launchACommunityDoc from "../../../../docs/product/guides/launch-a-community.md?raw";
import manageAccessBillingAndRolesDoc from "../../../../docs/product/guides/manage-access-billing-and-roles.md?raw";
import memberQuickstartDoc from "../../../../docs/product/guides/member-quickstart.md?raw";
import accessModelDoc from "../../../../docs/product/reference/access-model.md?raw";
import billingEntitlementsDoc from "../../../../docs/product/reference/billing-entitlements.md?raw";
import contextModelDoc from "../../../../docs/product/reference/context-model.md?raw";
import promptContextModelDoc from "../../../../docs/product/reference/prompt-context-model.md?raw";
import rolesPermissionsDoc from "../../../../docs/product/reference/roles-permissions.md?raw";
import securityPrivacyDoc from "../../../../docs/product/reference/security-privacy.md?raw";

export type ProductDocAudience = "builder" | "member" | "llm" | "operator";

export type ProductDocEntry = {
  id: string;
  slug: string;
  title: string;
  section: string;
  summary: string;
  audience: ProductDocAudience[];
  status: string;
  source: string;
  content: string;
};

type ProductDocManifestEntry = Omit<ProductDocEntry, "content">;

type ProductDocsManifest = {
  version: number;
  defaultSlug: string;
  docs: ProductDocManifestEntry[];
};

const PRODUCT_DOC_CONTENT_BY_SOURCE: Record<string, string> = {
  "docs/product/primitives/agent.md": agentDoc,
  "docs/product/primitives/community.md": communityDoc,
  "docs/product/primitives/community-lens.md": communityLensDoc,
  "docs/product/primitives/funnel.md": funnelDoc,
  "docs/product/primitives/memory.md": memoryDoc,
  "docs/product/primitives/polynet.md": polynetDoc,
  "docs/product/primitives/voice.md": voiceDoc,
  "docs/product/primitives/workspace.md": workspaceDoc,
  "docs/product/guides/builder-quickstart.md": builderQuickstartDoc,
  "docs/product/guides/chat-and-resources.md": chatAndResourcesDoc,
  "docs/product/guides/configure-community-agent.md": configureCommunityAgentDoc,
  "docs/product/guides/connect-apps-and-mcps.md": connectAppsAndMcpsDoc,
  "docs/product/guides/create-and-use-skills.md": createAndUseSkillsDoc,
  "docs/product/guides/launch-a-community.md": launchACommunityDoc,
  "docs/product/guides/manage-access-billing-and-roles.md": manageAccessBillingAndRolesDoc,
  "docs/product/guides/member-quickstart.md": memberQuickstartDoc,
  "docs/product/reference/access-model.md": accessModelDoc,
  "docs/product/reference/billing-entitlements.md": billingEntitlementsDoc,
  "docs/product/reference/context-model.md": contextModelDoc,
  "docs/product/reference/prompt-context-model.md": promptContextModelDoc,
  "docs/product/reference/roles-permissions.md": rolesPermissionsDoc,
  "docs/product/reference/security-privacy.md": securityPrivacyDoc,
};

function normalizeDocContent(raw: string): string {
  return raw.replace(/^---[\s\S]*?---\s*/, "").trim();
}

const manifest = productDocsManifest as ProductDocsManifest;

export const PRODUCT_DOCS_DEFAULT_SLUG = manifest.defaultSlug;

export const PRODUCT_DOCS: ProductDocEntry[] = manifest.docs.map((doc) => {
  const content = PRODUCT_DOC_CONTENT_BY_SOURCE[doc.source];
  if (!content) {
    throw new Error(`Missing product docs content for ${doc.source}`);
  }
  return {
    ...doc,
    content: normalizeDocContent(content),
  };
});

export function findProductDocBySlug(slug: string | null | undefined): ProductDocEntry | null {
  const normalized = String(slug ?? "").trim();
  if (!normalized) return null;
  return PRODUCT_DOCS.find((doc) => doc.slug === normalized) ?? null;
}

export function groupProductDocsBySection(): Array<{
  section: string;
  docs: ProductDocEntry[];
}> {
  const sections: Array<{ section: string; docs: ProductDocEntry[] }> = [];
  for (const doc of PRODUCT_DOCS) {
    let section = sections.find((candidate) => candidate.section === doc.section);
    if (!section) {
      section = { section: doc.section, docs: [] };
      sections.push(section);
    }
    section.docs.push(doc);
  }
  return sections;
}
