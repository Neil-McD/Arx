import { describe, expect, test } from "vitest";
import { deriveMemberCheckInPosture } from "../apps/web/src/components/CommunityMemberCoachSettingsSection";

describe("Community Guide check-in posture", () => {
  test("treats empty or commitment-only auto_reasons as Review on Home first", () => {
    expect(deriveMemberCheckInPosture([])).toBe("review");
    expect(deriveMemberCheckInPosture(["commitment_followup"])).toBe("review");
  });

  test("treats any routine check-in reason in auto_reasons as automatic", () => {
    expect(deriveMemberCheckInPosture(["member_onboarding"])).toBe("auto");
    expect(deriveMemberCheckInPosture(["commitment_followup", "quiet_newcomer"])).toBe("auto");
    expect(
      deriveMemberCheckInPosture([
        "member_onboarding",
        "commitment_followup",
        "board_coaching",
        "quiet_newcomer",
        "course_stall",
        "quiet_member",
      ]),
    ).toBe("auto");
  });
});
