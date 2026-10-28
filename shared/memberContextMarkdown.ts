/* THE renderer: ledger rows + account context in, markdown out. The agent's
   view of a member and the member's "what Polynet knows about me" view are
   this same artifact. Pure and deterministic (no clock, fixed ordering) so
   the contract proof can golden-test the exact output.
   docs/member-ontology-contract-v1.md */
import {
  MEMBER_FACT_KINDS,
  memberFactVisibleToLens,
  type MemberFactKind,
  type MemberFactLike,
  type MemberOntologyLens,
} from "./memberOntology.ts";

export type MemberAccountContextLike = {
  displayName: string | null;
  handle: string | null;
  timezone: string | null;
  socialLinks: string[];
  memberships: Array<{
    communityName: string;
    role: string;
    accessSource: string;
  }>;
  ownedCommunities: Array<{ name: string }>;
};

const KIND_LABELS: Record<MemberFactKind, string> = {
  situation: "Situation",
  goal: "Goals",
  skill: "Skills",
  interest: "Interests",
  availability: "Availability",
  preference: "Preferences",
  link: "Links",
};

function renderFactSections(facts: MemberFactLike[], headerLevel: string): string[] {
  const lines: string[] = [];
  for (const kind of MEMBER_FACT_KINDS) {
    const bodies = facts
      .filter((fact) => fact.kind === kind)
      .map((fact) => fact.body)
      .sort((a, b) => a.localeCompare(b));
    if (bodies.length === 0) continue;
    lines.push("", `${headerLevel} ${KIND_LABELS[kind]}`, ...bodies.map((body) => `- ${body}`));
  }
  return lines;
}

export function renderMemberContextMarkdown(args: {
  account: MemberAccountContextLike;
  facts: MemberFactLike[];
  lens: MemberOntologyLens;
  communityId?: string | null;
  communityName?: string | null;
  /* Lifecycle prompts can exclude provider context: the model cannot mention
     a connection it never saw. */
}): { memberMd: string; communityMd: string | null } {
  /* Defense in depth: callers pass lens-filtered rows, but the renderer
     re-applies the one predicate so it cannot leak what a caller forgot. */
  const visible = args.facts.filter((fact) => memberFactVisibleToLens(fact, args.lens));
  const accountSocialLinks = new Set(
    args.account.socialLinks.map((link) => String(link ?? "").trim()).filter(Boolean),
  );
  const platformFacts = visible.filter(
    (fact) =>
      fact.communityId === null &&
      !(fact.kind === "link" && accountSocialLinks.has(fact.body.trim())),
  );
  const communityId = args.communityId ?? null;
  const communityFacts = communityId
    ? visible.filter((fact) => fact.communityId === communityId)
    : [];

  const { account } = args;
  const name = account.displayName?.trim() || "Member";
  const title = account.handle?.trim() ? `# Member — ${name} (@${account.handle.trim()})` : `# Member — ${name}`;

  const accountLines: string[] = ["", "## Account"];
  if (account.timezone?.trim()) accountLines.push(`- Timezone: ${account.timezone.trim()}`);
  const memberships = [...account.memberships].sort((a, b) =>
    a.communityName.localeCompare(b.communityName),
  );
  for (const membership of memberships) {
    accountLines.push(
      `- Member of: ${membership.communityName} (${membership.role} · ${membership.accessSource})`,
    );
  }
  const owned = [...account.ownedCommunities].sort((a, b) => a.name.localeCompare(b.name));
  for (const community of owned) {
    accountLines.push(`- Owns: ${community.name}`);
  }
  for (const link of [...account.socialLinks].sort((a, b) => a.localeCompare(b))) {
    accountLines.push(`- Link: ${link}`);
  }

  const personLines = platformFacts.length > 0 ? ["", "## Person", ...renderFactSections(platformFacts, "###")] : [];

  const memberMd = [title, ...accountLines, ...personLines].join("\n");

  let communityMd: string | null = null;
  if (communityId) {
    const communityTitle = `# ${args.communityName?.trim() || "Community"} — member context`;
    communityMd =
      communityFacts.length > 0
        ? [communityTitle, ...renderFactSections(communityFacts, "##")].join("\n")
        : [communityTitle, "", "_No community-scoped context yet._"].join("\n");
  }

  return { memberMd, communityMd };
}
