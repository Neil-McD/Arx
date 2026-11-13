// A member's own plan here (design v1): what they're on, what each plan
// includes, and moving to another. Stripe's notice records a change; until then
// the old plan shows, with a note that it's on its way.
import { useCallback, useEffect, useState } from "react";
import { changeCloudMyCommunityPlan, fetchCloudMyCommunityPlan, type CloudMyPlan, type CloudMyPlanOption } from "../../../../shared/cloudCommunityPlanChangeGateway";

const money = (plan: CloudMyPlanOption) => {
  const value = plan.amount_base_units / Math.pow(10, plan.currency_decimals);
  const digits = Number.isInteger(value) ? 0 : 2;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }) + "/month";
};

export function CommunityMyPlanSection(props: { communityId: string; session: unknown; ensureSession: (session: any) => Promise<any | null> }) {
  const [mine, setMine] = useState<CloudMyPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await props.ensureSession(props.session);
      if (session) setMine(await fetchCloudMyCommunityPlan({ session, communityId: props.communityId }));
    } catch { setMine(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId]);
  useEffect(() => { void load(); }, [load]);

  const change = async (plan: CloudMyPlanOption) => {
    if (busy) return;
    setBusy(plan.key ?? "base");
    setNote(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) return;
      const result = await changeCloudMyCommunityPlan({ session, communityId: props.communityId, plan: plan.key });
      setNote(result.status === "payment_problem"
        ? "Your payment didn't go through, so you're still on your current plan. Update your card and try again."
        : `Moving you to ${plan.name}. It shows here once the payment is confirmed, usually within a minute.`);
      window.setTimeout(() => void load(), 8000);
    } catch (failure) {
      const code = String((failure as Error)?.message ?? "");
      setNote(code.includes("already_on_plan") ? "You're already on that plan."
        : code.includes("plan_unavailable") ? "That plan isn't on sale any more."
          : "Couldn't change your plan just now. Try again.");
    } finally { setBusy(null); }
  };

  if (!mine?.member || !mine.plans.length) return null;
  return (
    <div className="settings-section community-my-plan">
      <div className="settings-section-title">Your plan</div>
      <div className="settings-section-desc">
        {mine.current ? `You're on ${mine.current.name}.` : "Your plan."}
        {mine.can_change ? " Moving up charges the difference now; moving down credits the rest of this month." : ""}
        {!mine.can_change && mine.reason === "not_paying_polynet" ? " You bought it outside Polynet, so it's changed where you bought it." : ""}
      </div>
      {mine.plans.map((plan) => (
        <div key={plan.key ?? "base"} className="community-plan-row">
          <div>
            <strong>{plan.name}</strong>
            <span className="settings-section-desc">{money(plan)}{plan.includes.length ? ` · includes ${plan.includes.join(", ")}` : ""}</span>
          </div>
          <div className="community-plan-actions">
            {plan.current ? <span className="settings-section-desc">Current plan</span>
              : mine.can_change ? (
                <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void change(plan)}>
                  {busy === (plan.key ?? "base") ? "Changing…" : `Switch to ${plan.name}`}
                </button>
              ) : null}
          </div>
        </div>
      ))}
      {note ? <div className="settings-section-desc" role="status">{note}</div> : null}
    </div>
  );
}
