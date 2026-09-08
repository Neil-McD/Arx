import { expect, test, vi } from "vitest";
import { CommunityAutoJoinControl } from "../apps/web/src/components/CommunityAutoJoinControl";

test("Auto-join fails closed for missing policy or management permission", () => {
  const onChange = vi.fn();
  expect(CommunityAutoJoinControl({})).toBeNull();
  for (const admission of [
    { mode: null, canManage: true },
    { mode: "open" as const, canManage: false },
  ]) expect(CommunityAutoJoinControl({ admission: { ...admission, pending: false, error: null, onChange } })).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

test("Auto-join delegates to the existing host action and blocks pending writes", () => {
  for (const mode of ["open", "approval"] as const) {
    for (const pending of [false, true]) {
      const onChange = vi.fn();
      const control = CommunityAutoJoinControl({ admission: { mode, canManage: true, pending, error: null, onChange } })!;
      expect(control.props["aria-checked"]).toBe(mode === "open");
      expect(control.props.disabled).toBe(pending);
      control.props.onClick();
      if (pending) expect(onChange).not.toHaveBeenCalled();
      else expect(onChange).toHaveBeenCalledExactlyOnceWith(mode === "open" ? "approval" : "open");
    }
  }
});
