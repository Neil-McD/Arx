// Plans (one door, slice 1): the levels of membership a builder sells, one
// at a time per member, each with the grants a connected app reads. The base
// membership's price stays in Pricing (below it); here it gets a name and grants.
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
import { SettingsButton, SettingsCheckbox, SettingsGroup, SettingsNote, SettingsRow } from "./SettingsRows";

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
  const podNames = (ids: string[] | undefined) => (ids ?? []).map((id) => pods.find((pod) => pod.channel_id === id)?.name ?? "a pod");
  const edit = (tier: CloudCommunityTier) => {
    setError(null);
    setDraft({ key: tier.key, base: tier.base, name: tier.name, price: tier.monthly_amount_base_units === null ? "" : String(tier.monthly_amount_base_units / 100), grants: tier.grants.join(", "), pods: tier.pod_channel_ids ?? [] });
  };
  // Design v1, rows: one row per plan; editing opens the plan's fields below.
  return (
    <>
      <SettingsGroup label="Plans">
        {live.map((tier) => {
          const includes = podNames(tier.pod_channel_ids);
          return (
            <SettingsRow key={tier.key} label={tier.name}
              help={<>
                {money(tier.monthly_amount_base_units)}{tier.base ? " (the base price, below)" : ""} · {tier.members} {tier.members === 1 ? "member" : "members"}
                <br />Grants: {["community", ...tier.grants].join(", ")}{includes.length ? <><br />Includes: {includes.join(", ")}</> : null}
              </>}>
              <SettingsButton disabled={busy || Boolean(draft)} onClick={() => edit(tier)}>Edit</SettingsButton>
              {tier.base ? null : <SettingsButton variant="quiet" disabled={busy || Boolean(draft)} onClick={() => void archive(tier.key)}>Stop selling</SettingsButton>}
            </SettingsRow>
          );
        })}
        {draft ? null : (
          <SettingsRow label="Add a plan" help="Another level with its own price, grants and pods. Members keep the price they joined at.">
            <SettingsButton onClick={() => { setError(null); setDraft({ key: null, base: false, name: "", price: "", grants: "", pods: [] }); }}>Add plan</SettingsButton>
          </SettingsRow>
        )}
      </SettingsGroup>
      {!draft && error ? <SettingsNote tone="error">{error}</SettingsNote> : null}
      {draft ? (
        <SettingsGroup label={draft.key ? `Edit ${live.find((tier) => tier.key === draft.key)?.name ?? "plan"}` : "New plan"}>
          <SettingsRow label="Name" htmlFor="plan-name">
            <input id="plan-name" className="settings-v1-input" value={draft.name} maxLength={40} placeholder="e.g. Setter" autoFocus
              onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </SettingsRow>
          {draft.base ? null : (
            <SettingsRow label="Monthly price" htmlFor="plan-price">
              <span className="settings-v1-prefixed"><span aria-hidden="true">$</span>
                <input id="plan-price" className="settings-v1-input" inputMode="decimal" placeholder="197" value={draft.price}
                  onChange={(event) => setDraft({ ...draft, price: event.target.value.replace(/[^0-9.]/g, "") })} />
              </span>
            </SettingsRow>
          )}
          <SettingsRow label="Grants" htmlFor="plan-grants" help="Names your app reads, comma separated.">
            <input id="plan-grants" className="settings-v1-input" placeholder="de:connect, de:setter" value={draft.grants}
              onChange={(event) => setDraft({ ...draft, grants: event.target.value })} />
          </SettingsRow>
          {pods.length ? (
            <SettingsRow label="Includes pods" help="Everyone on this plan gets a seat in these, and loses it when they leave the plan." stacked>
              <div className="settings-v1-checklist">
                {pods.map((pod) => (
                  <SettingsCheckbox key={pod.channel_id} label={pod.name} checked={draft.pods.includes(pod.channel_id)}
                    onChange={(checked) => setDraft({ ...draft, pods: checked ? [...draft.pods, pod.channel_id] : draft.pods.filter((id) => id !== pod.channel_id) })} />
                ))}
              </div>
            </SettingsRow>
          ) : null}
          <SettingsRow label="" help={error ? <span className="settings-v1-error" role="alert">{error}</span> : undefined}>
            <SettingsButton variant="quiet" onClick={() => { setDraft(null); setError(null); }}>Cancel</SettingsButton>
            <SettingsButton variant="primary" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save plan"}</SettingsButton>
          </SettingsRow>
        </SettingsGroup>
      ) : null}
    </>
  );
}
