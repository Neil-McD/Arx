// Plans (one door, slice 1): the levels of membership a builder sells, one
// at a time per member, each with the grants a connected app reads. The base
// membership's price stays in Pricing above; here it gets a name and grants.
// A plan can include pods: whoever holds it has a seat in each.
import { announceCommunityPlansChanged } from "../controllers/communityAppLinks";
import { useCallback, useEffect, useState } from "react";
import {
  archiveCloudCommunityTier,
  fetchCloudCommunityTiers,
  saveCloudCommunityTier,
  type CloudCommunityTier,
} from "../../../../shared/cloudCommunityTiersGateway";
import { fetchCloudCommunityPods, type CloudCommunityPod } from "../../../../shared/cloudCommunityPodsGateway";

type Draft = { key: string | null; base: boolean; name: string; price: string; grants: string; pods: string[] };

const money = (cents: number | null) => (cents === null ? "Not set" : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}/month`);

export function CommunityPlansSection(props: { communityId: string; session: unknown; ensureSession: (session: any) => Promise<any | null> }) {
  const [tiers, setTiers] = useState<CloudCommunityTier[] | null>(null);
  const [pods, setPods] = useState<CloudCommunityPod[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await props.ensureSession(props.session);
      if (session) setTiers(await fetchCloudCommunityTiers({ session, communityId: props.communityId }));
    } catch { setTiers(null); }
    try {
      const session = await props.ensureSession(props.session);
      if (session) setPods((await fetchCloudCommunityPods({ session, communityId: props.communityId })).pods);
    } catch { setPods([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) return;
      const dollars = Number(draft.price);
      await saveCloudCommunityTier({
        session, communityId: props.communityId, name: draft.name,
        grants: draft.grants.split(/[\s,]+/), ...(draft.key ? { key: draft.key } : {}),
        ...(draft.base ? {} : { monthlyAmountBaseUnits: Math.round(dollars * 100) }),
        podChannelIds: draft.pods,
      });
      setDraft(null);
      await load();
      announceCommunityPlansChanged();
    } catch (failure) {
      const code = String((failure as Error)?.message ?? "");
      setError(code.includes("grant_invalid") ? "Grants are short lowercase names like de:setter (not \"community\" or pod:…)."
        : code.includes("price_invalid") ? "Use a monthly price from $1 to $10,000."
          : code.includes("name_required") ? "Give the plan a name."
            : code.includes("tier_pod_invalid") ? "That pod isn't open any more. Pick from the list." : "Couldn't save. Try again.");
    } finally { setBusy(false); }
  };

  const archive = async (key: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const session = await props.ensureSession(props.session);
      if (session) await archiveCloudCommunityTier({ session, communityId: props.communityId, key });
      await load();
      announceCommunityPlansChanged();
    } catch { setError("Couldn't stop selling it. Try again."); } finally { setBusy(false); }
  };

  if (!tiers) return null;
  const live = tiers.filter((tier) => !tier.archived);
  return (
    <div className="settings-section community-plans-section">
      <div className="settings-section-title">Plans</div>
      <div className="settings-section-desc">
        Levels of membership, one per member. Each plan gives grants: the names your own app reads to decide what someone can use. Members keep the price they joined at.
      </div>
      {live.map((tier) => (
        <div key={tier.key} className="community-plan-row">
          <div>
            <strong>{tier.name}</strong>
            <span className="settings-section-desc">{tier.base ? `${money(tier.monthly_amount_base_units)} (set in Pricing)` : money(tier.monthly_amount_base_units)} · {tier.members} {tier.members === 1 ? "member" : "members"}</span>
            <div className="settings-section-desc">Grants: {["community", ...tier.grants].join(", ")}</div>
            {tier.pod_channel_ids?.length ? (
              <div className="settings-section-desc">Includes: {tier.pod_channel_ids.map((id) => pods.find((pod) => pod.channel_id === id)?.name ?? "a pod").join(", ")}</div>
            ) : null}
          </div>
          <div className="community-plan-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => { setError(null); setDraft({ key: tier.key, base: tier.base, name: tier.name, price: tier.monthly_amount_base_units === null ? "" : String(tier.monthly_amount_base_units / 100), grants: tier.grants.join(", "), pods: tier.pod_channel_ids ?? [] }); }}>Edit</button>
            {tier.base ? null : <button type="button" className="secondary" disabled={busy} onClick={() => void archive(tier.key)}>Stop selling</button>}
          </div>
        </div>
      ))}
      {draft ? (
        <div className="community-plan-form">
          <label className="create-community-field">
            <span>Name</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={40} placeholder="e.g. Setter" autoFocus />
          </label>
          {draft.base ? null : (
            <label className="create-community-field">
              <span>Monthly price (USD)</span>
              <input value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" placeholder="197" />
            </label>
          )}
          <label className="create-community-field">
            <span>Grants (comma separated)</span>
            <input value={draft.grants} onChange={(event) => setDraft({ ...draft, grants: event.target.value })} placeholder="de:connect, de:setter" />
          </label>
          {pods.length ? (
            <fieldset className="create-community-field community-plan-pods">
              <span>Includes pods</span>
              {pods.map((pod) => (
                <label key={pod.channel_id} className="community-plan-pod">
                  <input
                    type="checkbox"
                    checked={draft.pods.includes(pod.channel_id)}
                    onChange={(event) => setDraft({ ...draft, pods: event.target.checked ? [...draft.pods, pod.channel_id] : draft.pods.filter((id) => id !== pod.channel_id) })}
                  />
                  {pod.name}
                </label>
              ))}
              <span className="settings-section-desc">Everyone on this plan gets a seat in these, and loses it when they leave the plan.</span>
            </fieldset>
          ) : null}
          {error ? <div className="settings-section-desc" role="alert">{error}</div> : null}
          <div className="community-plan-actions">
            <button type="button" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save plan"}</button>
            <button type="button" className="secondary" onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="secondary" style={{ marginTop: 10 }} onClick={() => { setError(null); setDraft({ key: null, base: false, name: "", price: "", grants: "", pods: [] }); }}>Add a plan</button>
      )}
      {!draft && error ? <div className="settings-section-desc" role="alert">{error}</div> : null}
    </div>
  );
}
