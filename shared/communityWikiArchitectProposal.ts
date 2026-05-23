import {
  COMMUNITY_WIKI_ARCHITECT_MAX_DRAFTS,
  COMMUNITY_WIKI_ARCHITECT_SCAFFOLD_ONLY_TITLES,
  type CommunityWikiArchitectProposal,
} from "./communityWikiArchitectPrompt.ts";
import {
  getCommunityResourceBuilderModulePageKey,
  normalizeCommunityResourceBuilderTitle,
} from "./communityResourceBuilder.ts";

export type CommunityWikiArchitectValidationError = {
  path: string;
  message: string;
};

export type CommunityWikiArchitectValidationModule = {
  id?: string | null;
  name: string;
};

export type CommunityWikiArchitectValidationPage = {
  id: string;
  title: string;
  moduleName: string | null;
  status: string;
  updatedAt: number;
  bodyMd?: string | null;
  sourceResourceId?: string | null;
};

export type CommunityWikiArchitectValidationSource = {
  id: string;
  title: string;
  status?: string | null;
};

export type CommunityWikiArchitectProposalValidationInput = {
  proposal: unknown;
  existingModules: CommunityWikiArchitectValidationModule[];
  existingPages: CommunityWikiArchitectValidationPage[];
  sourceInbox: CommunityWikiArchitectValidationSource[];
};

export type CommunityWikiArchitectProposalValidationResult =
  | {
      ok: true;
      errors: [];
      value: CommunityWikiArchitectProposal;
    }
  | {
      ok: false;
      errors: CommunityWikiArchitectValidationError[];
    };

const REQUIRED_ARRAY_FIELDS = [
  "modules_created",
  "modules_existing",
  "drafts_created",
  "drafts_updated",
  "pages_left_unchanged",
  "proposed_changes_to_existing",
  "sources_assigned",
  "sources_unassigned",
  "gaps",
  "deferred",
  "recommended_next_uploads",
  "needs_from_builder",
] as const;

const FORBIDDEN_DRAFT_FIELDS = [
  "body",
  "body_md",
  "bodyMd",
  "content",
  "summary",
] as const;

const FORBIDDEN_PLURAL_LINEAGE_FIELDS = [
  "source_dependencies",
  "source_dependencies_added",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getArrayField(source: Record<string, unknown>, key: string): unknown[] {
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function pushError(
  errors: CommunityWikiArchitectValidationError[],
  path: string,
  message: string,
): void {
  errors.push({ path, message });
}

function scanForbiddenPluralLineage(
  value: unknown,
  path: string,
  errors: CommunityWikiArchitectValidationError[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenPluralLineage(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if ((FORBIDDEN_PLURAL_LINEAGE_FIELDS as readonly string[]).includes(key)) {
      pushError(errors, `${path}.${key}`, "Use singular source_resource_id; plural source dependency fields are not supported.");
    }
    scanForbiddenPluralLineage(value[key], `${path}.${key}`, errors);
  }
}

function validateObjectArray(
  rows: unknown[],
  path: string,
  errors: CommunityWikiArchitectValidationError[],
): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  rows.forEach((row, index) => {
    if (!isRecord(row)) {
      pushError(errors, `${path}[${index}]`, "Expected an object.");
      return;
    }
    objects.push(row);
  });
  return objects;
}

export function validateCommunityWikiArchitectProposal(
  input: CommunityWikiArchitectProposalValidationInput,
): CommunityWikiArchitectProposalValidationResult {
  const errors: CommunityWikiArchitectValidationError[] = [];
  const proposal = input.proposal;
  if (!isRecord(proposal)) {
    return {
      ok: false,
      errors: [{ path: "$", message: "Proposal must be a JSON object." }],
    };
  }

  scanForbiddenPluralLineage(proposal, "$", errors);

  if (proposal.run_type !== "first" && proposal.run_type !== "rerun") {
    pushError(errors, "$.run_type", "run_type must be first or rerun.");
  }
  if (
    proposal.run_type === "first" &&
    (input.existingModules.length > 0 || input.existingPages.length > 0)
  ) {
    pushError(errors, "$.run_type", "run_type cannot be first when modules or pages already exist.");
  }

  for (const key of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(proposal[key])) {
      pushError(errors, `$.${key}`, "Expected an array.");
    }
  }

  const existingModuleNames = new Set(
    input.existingModules.map((module) => normalizeCommunityResourceBuilderTitle(module.name)).filter(Boolean),
  );
  const sourceIds = new Set(input.sourceInbox.map((source) => String(source.id ?? "").trim()).filter(Boolean));
  const existingPageById = new Map(input.existingPages.map((page) => [String(page.id), page]));
  const existingPageKeys = new Set(
    input.existingPages.map((page) =>
      getCommunityResourceBuilderModulePageKey({
        moduleName: page.moduleName ?? "",
        title: page.title,
      }),
    ),
  );
  const scaffoldOnlyTitles = new Set(
    COMMUNITY_WIKI_ARCHITECT_SCAFFOLD_ONLY_TITLES.map((title) =>
      normalizeCommunityResourceBuilderTitle(title),
    ),
  );

  const modulesCreated = validateObjectArray(getArrayField(proposal, "modules_created"), "$.modules_created", errors);
  const proposedModuleNames = new Set<string>();
  for (const [index, row] of modulesCreated.entries()) {
    if (!isShortString(row.name, 120)) {
      pushError(errors, `$.modules_created[${index}].name`, "Module name is required and must be 120 characters or fewer.");
      continue;
    }
    const normalized = normalizeCommunityResourceBuilderTitle(row.name);
    if (proposedModuleNames.has(normalized)) {
      pushError(errors, `$.modules_created[${index}].name`, "Duplicate proposed module name.");
    }
    if (existingModuleNames.has(normalized)) {
      pushError(errors, `$.modules_created[${index}].name`, "Proposed module already exists.");
    }
    proposedModuleNames.add(normalized);
    if (!isShortString(row.purpose, 280)) {
      pushError(errors, `$.modules_created[${index}].purpose`, "Module purpose is required and must be 280 characters or fewer.");
    }
  }

  const modulesExisting = getArrayField(proposal, "modules_existing");
  for (const [index, name] of modulesExisting.entries()) {
    if (!isShortString(name, 120)) {
      pushError(errors, `$.modules_existing[${index}]`, "Existing module name must be a non-empty string.");
      continue;
    }
    if (!existingModuleNames.has(normalizeCommunityResourceBuilderTitle(name))) {
      pushError(errors, `$.modules_existing[${index}]`, "Claimed existing module does not exist.");
    }
  }

  const validModuleNames = new Set([...existingModuleNames, ...proposedModuleNames]);
  const assignedSourceIds = new Set<string>();
  const sourcesAssigned = getArrayField(proposal, "sources_assigned");
  for (const [index, sourceId] of sourcesAssigned.entries()) {
    if (!isShortString(sourceId, 160)) {
      pushError(errors, `$.sources_assigned[${index}]`, "Assigned source id must be a non-empty string.");
      continue;
    }
    if (!sourceIds.has(sourceId)) {
      pushError(errors, `$.sources_assigned[${index}]`, "Assigned source id does not exist in source inbox.");
    }
    assignedSourceIds.add(sourceId);
  }

  const unassignedSourceIds = new Set<string>();
  const sourcesUnassigned = validateObjectArray(
    getArrayField(proposal, "sources_unassigned"),
    "$.sources_unassigned",
    errors,
  );
  for (const [index, row] of sourcesUnassigned.entries()) {
    if (!isShortString(row.id, 160)) {
      pushError(errors, `$.sources_unassigned[${index}].id`, "Unassigned source id must be a non-empty string.");
      continue;
    }
    if (!sourceIds.has(row.id)) {
      pushError(errors, `$.sources_unassigned[${index}].id`, "Unassigned source id does not exist in source inbox.");
    }
    if (assignedSourceIds.has(row.id)) {
      pushError(errors, `$.sources_unassigned[${index}].id`, "Source cannot be both assigned and unassigned.");
    }
    unassignedSourceIds.add(row.id);
    if (!isShortString(row.reason, 500)) {
      pushError(errors, `$.sources_unassigned[${index}].reason`, "Unassigned source reason is required.");
    }
  }

  const draftsCreated = validateObjectArray(getArrayField(proposal, "drafts_created"), "$.drafts_created", errors);
  if (draftsCreated.length > COMMUNITY_WIKI_ARCHITECT_MAX_DRAFTS) {
    pushError(errors, "$.drafts_created", `Propose at most ${COMMUNITY_WIKI_ARCHITECT_MAX_DRAFTS} drafts per run.`);
  }
  const proposedDraftKeys = new Set<string>();
  const usedSourceIds = new Set<string>();
  for (const [index, row] of draftsCreated.entries()) {
    for (const field of FORBIDDEN_DRAFT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(row, field)) {
        pushError(errors, `$.drafts_created[${index}].${field}`, "Draft proposals must not include page bodies or summaries.");
      }
    }
    if (!isShortString(row.title, 120)) {
      pushError(errors, `$.drafts_created[${index}].title`, "Draft title is required and must be 120 characters or fewer.");
    }
    if (!isShortString(row.module, 120)) {
      pushError(errors, `$.drafts_created[${index}].module`, "Draft module is required and must be 120 characters or fewer.");
    } else if (!validModuleNames.has(normalizeCommunityResourceBuilderTitle(row.module))) {
      pushError(errors, `$.drafts_created[${index}].module`, "Draft module must match an existing or proposed module.");
    }
    if (!isShortString(row.purpose, 280)) {
      pushError(errors, `$.drafts_created[${index}].purpose`, "Draft purpose is required and must be 280 characters or fewer.");
    }
    if (typeof row.title === "string" && typeof row.module === "string") {
      const key = getCommunityResourceBuilderModulePageKey({
        moduleName: row.module,
        title: row.title,
      });
      if (proposedDraftKeys.has(key)) {
        pushError(errors, `$.drafts_created[${index}].title`, "Duplicate proposed draft for this module/title.");
      }
      proposedDraftKeys.add(key);
      if (existingPageKeys.has(key)) {
        pushError(errors, `$.drafts_created[${index}].title`, "A page with this module/title already exists.");
      }
    }
    if (row.source_resource_id !== null && !isShortString(row.source_resource_id, 160)) {
      pushError(errors, `$.drafts_created[${index}].source_resource_id`, "source_resource_id must be a source id or null.");
    } else if (row.source_resource_id === null) {
      const normalizedTitle = normalizeCommunityResourceBuilderTitle(row.title);
      if (!scaffoldOnlyTitles.has(normalizedTitle)) {
        pushError(errors, `$.drafts_created[${index}].source_resource_id`, "Only scaffold-whitelist pages may omit source_resource_id.");
      }
    } else if (typeof row.source_resource_id === "string") {
      if (!sourceIds.has(row.source_resource_id)) {
        pushError(errors, `$.drafts_created[${index}].source_resource_id`, "source_resource_id does not exist in source inbox.");
      }
      usedSourceIds.add(row.source_resource_id);
    }
  }

  const draftsUpdated = validateObjectArray(getArrayField(proposal, "drafts_updated"), "$.drafts_updated", errors);
  for (const [index, row] of draftsUpdated.entries()) {
    for (const field of FORBIDDEN_DRAFT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(row, field)) {
        pushError(errors, `$.drafts_updated[${index}].${field}`, "Draft updates must not include page bodies or summaries.");
      }
    }
    if (!isShortString(row.resource_id, 160)) {
      pushError(errors, `$.drafts_updated[${index}].resource_id`, "resource_id is required.");
      continue;
    }
    const existingPage = existingPageById.get(row.resource_id);
    if (!existingPage) {
      pushError(errors, `$.drafts_updated[${index}].resource_id`, "Draft update target does not exist.");
      continue;
    }
    if (String(existingPage.status ?? "").trim().toLowerCase() !== "draft") {
      pushError(errors, `$.drafts_updated[${index}].resource_id`, "Draft update target must be an existing draft page.");
    }
    // Architect updates can only attach a first primary source. Source swaps stay out of this review/apply path.
    if (existingPage.sourceResourceId) {
      pushError(errors, `$.drafts_updated[${index}].resource_id`, "Draft update target already has source_resource_id.");
    }
    if (row.expected_updated_at !== existingPage.updatedAt) {
      pushError(errors, `$.drafts_updated[${index}].expected_updated_at`, "expected_updated_at must match the current page updatedAt.");
    }
    if (!isShortString(row.source_resource_id, 160)) {
      pushError(errors, `$.drafts_updated[${index}].source_resource_id`, "source_resource_id is required for draft updates.");
    } else {
      if (!sourceIds.has(row.source_resource_id)) {
        pushError(errors, `$.drafts_updated[${index}].source_resource_id`, "source_resource_id does not exist in source inbox.");
      }
      usedSourceIds.add(row.source_resource_id);
    }
    if (!isShortString(row.title, 120)) {
      pushError(errors, `$.drafts_updated[${index}].title`, "Draft update title is required and must be 120 characters or fewer.");
    } else if (
      normalizeCommunityResourceBuilderTitle(row.title) !==
      normalizeCommunityResourceBuilderTitle(existingPage.title)
    ) {
      pushError(errors, `$.drafts_updated[${index}].title`, "Draft update title must match the target page.");
    }
    if (!isShortString(row.change, 280)) {
      pushError(errors, `$.drafts_updated[${index}].change`, "Draft update change is required and must be 280 characters or fewer.");
    }
  }

  for (const sourceId of usedSourceIds) {
    if (!assignedSourceIds.has(sourceId)) {
      pushError(errors, "$.sources_assigned", `Source ${sourceId} is used by a draft but missing from sources_assigned.`);
    }
  }
  for (const sourceId of assignedSourceIds) {
    if (unassignedSourceIds.has(sourceId)) {
      pushError(errors, "$.sources_assigned", `Source ${sourceId} cannot be both assigned and unassigned.`);
    }
  }

  const pagesLeftUnchanged = validateObjectArray(
    getArrayField(proposal, "pages_left_unchanged"),
    "$.pages_left_unchanged",
    errors,
  );
  for (const [index, row] of pagesLeftUnchanged.entries()) {
    if (!isShortString(row.title, 120)) {
      pushError(errors, `$.pages_left_unchanged[${index}].title`, "Page title is required.");
    }
    if (!isShortString(row.module, 120)) {
      pushError(errors, `$.pages_left_unchanged[${index}].module`, "Page module is required.");
    }
    if (typeof row.title === "string" && typeof row.module === "string") {
      const pageKey = getCommunityResourceBuilderModulePageKey({
        moduleName: row.module,
        title: row.title,
      });
      if (!existingPageKeys.has(pageKey)) {
        pushError(errors, `$.pages_left_unchanged[${index}].title`, "Unchanged page does not exist in that module.");
      }
    }
    if (!isShortString(row.reason, 500)) {
      pushError(errors, `$.pages_left_unchanged[${index}].reason`, "Reason is required.");
    }
  }

  const proposedChanges = validateObjectArray(
    getArrayField(proposal, "proposed_changes_to_existing"),
    "$.proposed_changes_to_existing",
    errors,
  );
  for (const [index, row] of proposedChanges.entries()) {
    if (!isShortString(row.title, 120)) {
      pushError(errors, `$.proposed_changes_to_existing[${index}].title`, "Title is required.");
    }
    if (!isShortString(row.module, 120)) {
      pushError(errors, `$.proposed_changes_to_existing[${index}].module`, "Module is required.");
    }
    if (typeof row.title === "string" && typeof row.module === "string") {
      const pageKey = getCommunityResourceBuilderModulePageKey({
        moduleName: row.module,
        title: row.title,
      });
      if (!existingPageKeys.has(pageKey)) {
        pushError(errors, `$.proposed_changes_to_existing[${index}].title`, "Proposed change target does not exist in that module.");
      }
    }
    if (!isShortString(row.status, 80)) {
      pushError(errors, `$.proposed_changes_to_existing[${index}].status`, "Status is required.");
    }
    if (!isShortString(row.suggestion, 500)) {
      pushError(errors, `$.proposed_changes_to_existing[${index}].suggestion`, "Suggestion is required.");
    }
  }

  const gaps = validateObjectArray(getArrayField(proposal, "gaps"), "$.gaps", errors);
  for (const [index, row] of gaps.entries()) {
    if (!isShortString(row.title, 120)) pushError(errors, `$.gaps[${index}].title`, "Gap title is required.");
    if (!isShortString(row.module, 120)) {
      pushError(errors, `$.gaps[${index}].module`, "Gap module is required.");
    } else if (!validModuleNames.has(normalizeCommunityResourceBuilderTitle(row.module))) {
      pushError(errors, `$.gaps[${index}].module`, "Gap module must match an existing or proposed module.");
    }
    if (!isShortString(row.needed_source, 500)) {
      pushError(errors, `$.gaps[${index}].needed_source`, "Gap needed_source is required.");
    }
  }

  const deferred = validateObjectArray(getArrayField(proposal, "deferred"), "$.deferred", errors);
  for (const [index, row] of deferred.entries()) {
    if (!isShortString(row.title, 120)) pushError(errors, `$.deferred[${index}].title`, "Deferred title is required.");
    if (!isShortString(row.module, 120)) pushError(errors, `$.deferred[${index}].module`, "Deferred module is required.");
    if (!isShortString(row.reason, 500)) pushError(errors, `$.deferred[${index}].reason`, "Deferred reason is required.");
  }

  for (const key of ["recommended_next_uploads", "needs_from_builder"] as const) {
    getArrayField(proposal, key).forEach((value, index) => {
      if (!isShortString(value, 500)) {
        pushError(errors, `$.${key}[${index}]`, "Expected a non-empty string.");
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: proposal as unknown as CommunityWikiArchitectProposal,
  };
}
