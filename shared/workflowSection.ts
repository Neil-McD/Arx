export const WORKFLOW_SECTIONS = ["workflows", "forms"] as const;
export type WorkflowSection = typeof WORKFLOW_SECTIONS[number];
export function workflowSectionFromSearch(search: string): WorkflowSection {
  const value = new URLSearchParams(search).get("section");
  return value === "forms" ? value : "workflows";
}
export function workflowSectionUrl(href: string, section: WorkflowSection) {
  const url = new URL(href);
  if (section === "workflows") url.searchParams.delete("section");
  else url.searchParams.set("section", section);
  return `${url.pathname}${url.search}${url.hash}`;
}
