export const WORKFLOW_SECTIONS = ["workflows", "runs", "changes", "forms", "welcome"] as const;
export type WorkflowSection = typeof WORKFLOW_SECTIONS[number];
export function workflowSectionFromSearch(search: string): WorkflowSection {
  const value = new URLSearchParams(search).get("section");
  // "test" is the old Test run tab, now part of Run history.
  if (value === "test") return "runs";
  // "clients" (Members) moved to its own tab; isWorkflowMembersSearch sends it there.
  return value === "runs" || value === "changes" || value === "forms" || value === "welcome" ? value : "workflows";
}
export function workflowSectionUrl(href: string, section: WorkflowSection) {
  const url = new URL(href);
  if (section === "workflows") url.searchParams.delete("section");
  else url.searchParams.set("section", section);
  return `${url.pathname}${url.search}${url.hash}`;
}
/** The old Workflows › Members address, now the community's own Members tab. */
export function isWorkflowMembersSearch(search: string) {
  return new URLSearchParams(search).get("section") === "clients";
}
