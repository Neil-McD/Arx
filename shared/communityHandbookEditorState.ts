// What Studio's handbook editor shows and allows, as plain functions of the
// server view and the founder's unsaved text (tested in scripts/).

export type CommunityHandbookManagerView = {
  approved_md: string | null;
  approved_at: number | null;
  draft_md: string | null;
  draft_updated_at: number | null;
  draft_status: "idle" | "drafting" | "failed";
  draft_error: string | null;
};

// The text the editor opens with: the latest draft, else what's approved.
export function handbookEditorText(view: CommunityHandbookManagerView | null): string {
  return view?.draft_md ?? view?.approved_md ?? "";
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Why a draft failed, in words a founder can act on.
export function handbookDraftErrorText(code: string | null): string {
  const value = String(code ?? "");
  if (value.startsWith("funding_unavailable")) return "the community's AI budget isn't available. Check the AI plan in Billing, then try again.";
  if (value === "community_unavailable") return "the community isn't active.";
  if (value === "empty_draft" || value === "invalid_model_output") return "the agent returned nothing usable. Try again.";
  return "something went wrong. Try again.";
}

export function handbookEditorStatus(view: CommunityHandbookManagerView | null, text: string, dirty: boolean): string {
  if (view?.draft_status === "drafting") return "The agent is drafting from your community. This takes about a minute.";
  if (view?.draft_status === "failed") return `The last draft failed: ${handbookDraftErrorText(view.draft_error)}`;
  if (dirty) return "Unsaved changes.";
  if (!view?.approved_md) return text.trim() ? "Draft saved, not approved yet. Members and the agent don't see it." : "No handbook yet.";
  if (text.trim() !== view.approved_md.trim()) return `Draft saved. The version approved ${shortDate(view.approved_at ?? Date.now())} is what members see.`;
  return `Approved ${shortDate(view.approved_at ?? Date.now())}. Members and the agent see this.`;
}

// How many points still say "Ask the founder."
export function handbookOpenQuestions(text: string): number {
  return (text.match(/Ask the founder\./g) ?? []).length;
}

// Drafting replaces the text in the box: ask first when there are unsaved edits.
export function handbookDraftNeedsConfirm(dirty: boolean, text: string): boolean {
  return dirty && text.trim().length > 0;
}

export function handbookCanApprove(view: CommunityHandbookManagerView | null, text: string): boolean {
  if (view?.draft_status === "drafting") return false;
  return text.trim().length > 0 && text.trim() !== (view?.approved_md ?? "").trim();
}
