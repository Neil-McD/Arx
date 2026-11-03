import { expect, test } from "vitest";
import {
  handbookCanApprove,
  handbookDraftErrorText,
  handbookDraftNeedsConfirm,
  handbookEditorStatus,
  handbookEditorText,
  handbookOpenQuestions,
  type CommunityHandbookManagerView,
} from "../shared/communityHandbookEditorState";

const view = (patch: Partial<CommunityHandbookManagerView> = {}): CommunityHandbookManagerView => ({
  approved_md: null, approved_at: null, draft_md: null, draft_updated_at: null, draft_status: "idle", draft_error: null, ...patch,
});
const NOV3 = Date.parse("2026-11-03T18:00:00Z");

test("the editor opens on the latest draft, else the approved text", () => {
  expect(handbookEditorText(null)).toBe("");
  expect(handbookEditorText(view({ approved_md: "A" }))).toBe("A");
  expect(handbookEditorText(view({ approved_md: "A", draft_md: "B" }))).toBe("B");
});

test("the status says what members see now", () => {
  expect(handbookEditorStatus(view(), "", false)).toBe("No handbook yet.");
  expect(handbookEditorStatus(view({ draft_md: "x" }), "x", false)).toMatch(/not approved yet/);
  expect(handbookEditorStatus(view({ approved_md: "x", approved_at: NOV3 }), "x", false)).toBe("Approved Nov 3, 2026. Members and the agent see this.");
  expect(handbookEditorStatus(view({ approved_md: "x", approved_at: NOV3, draft_md: "y" }), "y", false)).toMatch(/approved Nov 3, 2026 is what members see/);
  expect(handbookEditorStatus(view({ approved_md: "x" }), "x!", true)).toBe("Unsaved changes.");
  expect(handbookEditorStatus(view({ draft_status: "drafting" }), "", false)).toMatch(/drafting/);
  expect(handbookEditorStatus(view({ draft_status: "failed", draft_error: "funding_unavailable:x" }), "", false)).toMatch(/AI budget/);
});

test("draft failures read as something a founder can act on", () => {
  expect(handbookDraftErrorText("funding_unavailable:community_budget_exhausted")).toMatch(/Billing/);
  expect(handbookDraftErrorText("invalid_model_output")).toMatch(/Try again/);
  expect(handbookDraftErrorText("weird")).toMatch(/Try again/);
});

test("approve, confirm and open questions", () => {
  expect(handbookCanApprove(view(), "")).toBe(false);
  expect(handbookCanApprove(view(), "new")).toBe(true);
  expect(handbookCanApprove(view({ approved_md: "same" }), "same")).toBe(false);
  expect(handbookCanApprove(view({ draft_status: "drafting" }), "new")).toBe(false);
  expect(handbookDraftNeedsConfirm(true, "edits")).toBe(true);
  expect(handbookDraftNeedsConfirm(false, "saved")).toBe(false);
  expect(handbookOpenQuestions("- _Ask the founder._\n- x\n- _Ask the founder._ about gear")).toBe(2);
});
