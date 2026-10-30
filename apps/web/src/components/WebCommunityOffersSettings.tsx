import { useEffect, useState } from "react";
import { ExternalLink, Lock, Plus } from "lucide-react";
import { offerButtonLabel, WebCommunityOfferChooser } from "./WebCommunityOfferChooser";
import {
  fetchCloudCommunityOffers,
  formatCommunityOfferPrice,
  saveCloudCommunityOffer,
  setCloudCommunityChannelOfferAudience,
  setCloudCommunityBaseOfferPrice,
  setCloudCommunityOfferArchived,
  type CommunityBuilderOffer,
  type CommunityBuilderOffers,
} from "../../../../shared/cloudCommunityOffersGateway";
import "./WebCommunityOffersSettings.css";

// Settings › Offers: the packages this community sells, as a ladder. Each offer
// includes everything in the ones above it in the list, so "Membership +
// Consulting" gets all of Membership. Below it, which private channels each
// offer opens. Members are added and removed by their offer.

type Draft = { key: string | null; name: string; blurb: string; amount: string; period: "monthly" | "annual"; showOnSalesPage: boolean;
  /** Membership only: free, or paid for new members. */
  paid?: boolean };

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("offer_name_taken")) return "Another offer already has that name.";
  if (message.includes("offer_name_required")) return "Give the offer a name.";
  if (message.includes("offer_price_invalid")) return "Enter a price of at least $1, like 130.";
  if (/community_(payout_access_required|stripe_connect_required|stripe_connect_not_ready)/.test(message)) {
    return "Connect Stripe in General › Payments first, then Membership can be paid.";
  }
  if (message.includes("community_settings_revision")) return "Someone changed the settings just now. Reload and try again.";
  if (message.includes("offer_limit_reached")) return "A community can sell up to 6 offers. Archive one first.";
  if (message.includes("community_owner_required")) return "Only the owner can change offers.";
  if (message.includes("offer_channel_not_private")) return "Make the channel invite-only first.";
  return "That didn't save. Try again in a moment.";
}

function draftOf(offer: CommunityBuilderOffer | null): Draft {
  return {
    key: offer?.key ?? null,
    name: offer?.name ?? "",
    blurb: offer?.blurb ?? "",
    amount: offer?.price ? String(offer.price.amount_base_units / 10 ** offer.price.currency_decimals) : "",
    period: offer?.price?.billing_period ?? "monthly",
    showOnSalesPage: offer?.show_on_sales_page ?? true,
    paid: Boolean(offer?.is_base && offer.price),
  };
}

function PriceInputs(props: { id: string; draft: Draft; onChange: (draft: Draft) => void }) {
  const { id, draft } = props;
  return (
    <div className="pn-offer-price">
      <label className="pn-settings-affix is-compact" htmlFor={`offer-${id}-amount`}>
        <span>$</span>
        <input id={`offer-${id}-amount`} className="pn-settings-input" inputMode="decimal" value={draft.amount} placeholder="130"
          onChange={(event) => props.onChange({ ...draft, amount: event.target.value.replace(/[^0-9.]/g, "") })} />
      </label>
      <select id={`offer-${id}-period`} className="pn-settings-select" aria-label="How often" value={draft.period}
        onChange={(event) => props.onChange({ ...draft, period: event.target.value as Draft["period"] })}>
        <option value="monthly">per month</option>
        <option value="annual">per year</option>
      </select>
    </div>
  );
}

function OfferEditor(props: {
  draft: Draft;
  isBase: boolean;
  busy: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenPricing?: () => void;
}) {
  const { draft } = props;
  const id = draft.key ?? "new";
  return (
    <form
      className="pn-offer-editor"
      onSubmit={(event) => { event.preventDefault(); props.onSave(); }}
    >
      <label className="pn-offer-field" htmlFor={`offer-${id}-name`}>
        <span className="pn-settings-label">Name</span>
        <input id={`offer-${id}-name`} className="pn-settings-input" value={draft.name} maxLength={60} autoFocus
          placeholder="Membership + Consulting" onChange={(event) => props.onChange({ ...draft, name: event.target.value })} />
      </label>
      <label className="pn-offer-field" htmlFor={`offer-${id}-blurb`}>
        <span className="pn-settings-label">One line for the sales page</span>
        <input id={`offer-${id}-blurb`} className="pn-settings-input" value={draft.blurb} maxLength={280}
          placeholder="Everything in Membership, plus a private room with me."
          onChange={(event) => props.onChange({ ...draft, blurb: event.target.value })} />
      </label>
      {props.isBase ? (
        <div className="pn-offer-field">
          <span className="pn-settings-label">Price</span>
          <div className="pn-offer-ticks" role="radiogroup" aria-label="Price">
            <label className={`pn-offer-check${draft.paid ? "" : " is-on"}`}>
              <input type="radio" name={`offer-${id}-paid`} checked={!draft.paid} onChange={() => props.onChange({ ...draft, paid: false })} />Free
            </label>
            <label className={`pn-offer-check${draft.paid ? " is-on" : ""}`}>
              <input type="radio" name={`offer-${id}-paid`} checked={Boolean(draft.paid)} onChange={() => props.onChange({ ...draft, paid: true })} />Paid
            </label>
          </div>
          {draft.paid ? <PriceInputs id={id} draft={draft} onChange={props.onChange} /> : null}
          <span className="pn-settings-help">
            {draft.paid
              ? "New people pay to join. Everyone already in keeps their access and isn't charged."
              : "Anyone can join for free."}
            {props.onOpenPricing ? <> Paid needs Stripe, which you connect in <button type="button" className="pn-settings-link" onClick={props.onOpenPricing}>General › Payments</button>.</> : null}
          </span>
        </div>
      ) : (
        <div className="pn-offer-field">
          <span className="pn-settings-label">Price</span>
          <PriceInputs id={id} draft={draft} onChange={props.onChange} />
        </div>
      )}
      <label className="pn-offer-check" htmlFor={`offer-${id}-show`}>
        <input id={`offer-${id}-show`} type="checkbox" checked={draft.showOnSalesPage}
          onChange={(event) => props.onChange({ ...draft, showOnSalesPage: event.target.checked })} />
        Show on the sales page
      </label>
      <div className="pn-offer-actions">
        <button type="button" className="pn-settings-button" disabled={props.busy} onClick={props.onCancel}>Cancel</button>
        <button type="submit" className="pn-settings-button is-primary" disabled={props.busy || !draft.name.trim() || ((!props.isBase || draft.paid) && !draft.amount)}>
          {props.busy ? "Saving…" : draft.key ? "Save" : "Add offer"}
        </button>
      </div>
    </form>
  );
}

export function WebCommunityOffersSettings<SessionT>(props: {
  /** For "Open sales page": the public page, scrolled to the offer cards. */
  communitySlug?: string | null;
  communityId: string;
  session: SessionT | null;
  isOwner: boolean;
  onOpenPricing?: () => void;
}) {
  const [data, setData] = useState<CommunityBuilderOffers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!props.session) return;
    let current = true;
    fetchCloudCommunityOffers({ session: props.session, communityId: props.communityId })
      .then((result) => { if (current) setData(result); })
      .catch(() => { if (current) setError("Couldn't load the offers. Try again in a moment."); });
    return () => { current = false; };
  }, [props.communityId, props.session, reload]);

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
      setReload((value) => value + 1);
      return true;
    } catch (caught) {
      setError(errorText(caught));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft || !props.session) return;
    const offer = data?.offers.find((item) => item.key === draft.key) ?? null;
    const amount = Math.round(Number(draft.amount) * 100);
    if ((!offer?.is_base || draft.paid) && !(Number.isSafeInteger(amount) && amount >= 100)) {
      setError(errorText(new Error("offer_price_invalid")));
      return;
    }
    const ok = await run("save", async () => {
      await saveCloudCommunityOffer({
        session: props.session!, communityId: props.communityId, ...(draft.key ? { key: draft.key } : {}),
        name: draft.name.trim(), blurb: draft.blurb.trim() || null, showOnSalesPage: draft.showOnSalesPage,
        ...(offer?.is_base ? {} : { price: { billingPeriod: draft.period, amountBaseUnits: amount } }),
      });
      if (!offer?.is_base) return;
      const before = offer.price;
      const next = draft.paid ? { billingPeriod: draft.period, amountBaseUnits: amount } : null;
      const unchanged = next === null ? before === null
        : before !== null && before.billing_period === next.billingPeriod && before.amount_base_units === next.amountBaseUnits;
      if (!unchanged) await setCloudCommunityBaseOfferPrice({ session: props.session!, communityId: props.communityId, price: next });
    });
    if (ok) setDraft(null);
  };

  const live = (data?.offers ?? []).filter((offer) => !offer.archived);
  const archived = (data?.offers ?? []).filter((offer) => offer.archived);
  const privateChannels = (data?.channels ?? []).filter((channel) => channel.access_mode === "restricted");
  const sharedCount = (data?.channels ?? []).length - privateChannels.length;
  const canAdd = props.isOwner && live.length < (data?.limits.offers ?? 6);

  const setAudience = (channelId: string, key: string) => {
    if (!props.session) return;
    void run(`channel:${channelId}`, () => setCloudCommunityChannelOfferAudience({ session: props.session!, communityId: props.communityId, channelId, offerKeys: key ? [key] : [] }));
  };

  return (
    <div className="pn-settings-stack">
      <section className="settings-section pn-settings-card" aria-labelledby="settings-offers-title">
        <header className="pn-settings-card-header is-row">
          <div>
            <h2 className="settings-section-title" id="settings-offers-title">Your offers</h2>
            <p className="settings-section-desc">
              What people can buy. Each offer gets everything in the offers above it, plus what you open to it below.
            </p>
          </div>
          {canAdd && !draft ? (
            <button type="button" className="pn-settings-button is-primary" onClick={() => setDraft(draftOf(null))}>
              <Plus size={16} aria-hidden="true" />New offer
            </button>
          ) : null}
        </header>
        <div className="pn-settings-card-body">
          {error ? <p className="pn-settings-inline-error" role="alert">{error}</p> : null}
          {data === null && !error ? (
            <div className="pn-settings-loading" role="status"><span className="pn-settings-spinner" aria-hidden="true" />Loading offers…</div>
          ) : null}
          {live.map((offer, index) => (
            <div className="pn-settings-row pn-offer-row" key={offer.key}>
              {draft?.key === offer.key ? (
                <OfferEditor draft={draft} isBase={offer.is_base} busy={busy === "save"} onChange={setDraft} onSave={() => void save()}
                  onCancel={() => setDraft(null)} onOpenPricing={props.onOpenPricing} />
              ) : (
                <div className="pn-settings-row-head">
                  <div className="pn-settings-row-text">
                    <span className="pn-offer-name">
                      {offer.name}
                      {offer.show_on_sales_page ? null : <span className="pn-offer-chip is-muted">Not on sales page</span>}
                    </span>
                    {index > 0 ? <span className="pn-offer-includes">Everything in {live[index - 1]!.name}, plus more</span> : null}
                    <span className="pn-settings-help">
                      {offer.is_base && !offer.price ? "Free" : formatCommunityOfferPrice(offer.price)}
                      {" · "}{offer.members === 1 ? "1 member" : `${offer.members} members`}
                      {offer.blurb ? <> · {offer.blurb}</> : null}
                    </span>
                  </div>
                  {props.isOwner ? (
                    <div className="pn-settings-row-control">
                      <button type="button" className="pn-settings-button" disabled={busy !== null || draft !== null} onClick={() => setDraft(draftOf(offer))}>Edit</button>
                      {offer.is_base ? null : (
                        <button type="button" className="pn-settings-button" disabled={busy !== null}
                          onClick={() => {
                            if (!window.confirm(`Stop selling ${offer.name}? Members on it keep it, and you can restore it later.`)) return;
                            void run(`archive:${offer.key}`, () => setCloudCommunityOfferArchived({ session: props.session!, communityId: props.communityId, key: offer.key, archived: true }));
                          }}>
                          Archive
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
          {draft && draft.key === null ? (
            <div className="pn-settings-row pn-offer-row is-new">
              <OfferEditor draft={draft} isBase={false} busy={busy === "save"} onChange={setDraft} onSave={() => void save()} onCancel={() => setDraft(null)} />
            </div>
          ) : null}
          {archived.length ? (
            <p className="pn-settings-note">
              Archived, no longer sold (members on them keep them): {archived.map((offer, index) => (
                <span key={offer.key}>
                  {index ? ", " : ""}{offer.name}{props.isOwner ? <> (<button type="button" className="pn-settings-link" disabled={busy !== null}
                    onClick={() => void run(`archive:${offer.key}`, () => setCloudCommunityOfferArchived({ session: props.session!, communityId: props.communityId, key: offer.key, archived: false }))}>restore</button>)</> : null}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </section>
      <SalesPagePreview offers={live} communitySlug={props.communitySlug ?? null} />

      <section className="settings-section pn-settings-card" aria-labelledby="settings-offer-channels-title">
        <header className="pn-settings-card-header">
          <h2 className="settings-section-title" id="settings-offer-channels-title">Pods</h2>
          <p className="settings-section-desc">
            Choose who&rsquo;s in each pod. For example, set a &ldquo;Consulting calls&rdquo; pod to
            &ldquo;Everyone on {live[1]?.name ?? "Consulting"}&rdquo;: people join it when they buy that offer and leave it if they cancel.
          </p>
        </header>
        <div className="pn-settings-card-body">
          {data && !privateChannels.length ? (
            <p className="pn-settings-note">
              {sharedCount ? "Every channel here is open to all members. " : ""}Make a pod with New pod, then choose who&rsquo;s in it here.
            </p>
          ) : null}
          {privateChannels.map((channel) => {
            // On a ladder one offer is enough: it lets in everyone on it and above.
            const chosen = live.find((offer) => channel.offer_audience.includes(offer.key)) ?? null;
            const selectId = `offer-channel-${channel.id}`;
            return (
              <div className="pn-settings-row pn-offer-channel" key={channel.id}>
                <div className="pn-settings-row-text">
                  <span className="pn-offer-name"><Lock size={14} aria-hidden="true" />{channel.name}</span>
                  <span className="pn-settings-help">
                    {chosen
                      ? `${audienceLabel(live, chosen)} is added automatically. People you added yourself stay.`
                      : "Only the people you add yourself."}
                  </span>
                </div>
                <label className="pn-offer-audience" htmlFor={selectId}>
                  <span className="pn-settings-label">Who&rsquo;s in it</span>
                  <select id={selectId} className="pn-settings-select" value={chosen?.key ?? ""} disabled={busy !== null || !props.session}
                    onChange={(event) => setAudience(channel.id, event.target.value)}>
                    <option value="">Only people I add</option>
                    {live.map((offer) => <option key={offer.key} value={offer.key}>{audienceLabel(live, offer)}</option>)}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="settings-section pn-settings-card" aria-labelledby="settings-offer-more-title">
        <header className="pn-settings-card-header">
          <h2 className="settings-section-title" id="settings-offer-more-title">Offers work everywhere else too</h2>
        </header>
        <ul className="pn-offer-more">
          <li><strong>Workflows.</strong> Start steps "When they start an offer" or "When they leave an offer", or add "Only if Offer is…" to any step.</li>
          <li><strong>Roadmap.</strong> A track can open only while a member's Offer is one you pick.</li>
          <li><strong>Members.</strong> The Offer column shows who is on what. Give someone an offer by hand from their Access panel.</li>
        </ul>
      </section>
    </div>
  );
}

// The same cards the sales page shows, from the offers above, and a link to the page itself.
function SalesPagePreview(props: { offers: CommunityBuilderOffer[]; communitySlug: string | null }) {
  const [picked, setPicked] = useState<string | null>(null);
  const onSale = props.offers.filter((offer) => offer.is_base || (offer.show_on_sales_page && offer.price));
  const cards = onSale.map((offer) => ({ key: offer.key, name: offer.name, blurb: offer.blurb, rank: offer.rank, is_base: offer.is_base,
    prices: offer.price ? [offer.price] : [] }));
  const selected = cards.find((card) => card.key === picked) ?? cards[0] ?? null;
  const href = props.communitySlug ? `/c/${encodeURIComponent(props.communitySlug)}#offers` : null;
  return (
    <section className="settings-section pn-settings-card" aria-labelledby="settings-offers-sales-title">
      <header className="pn-settings-card-header is-row">
        <div>
          <h2 className="settings-section-title" id="settings-offers-sales-title">On your sales page</h2>
          <p className="settings-section-desc">
            {cards.length > 1
              ? "Visitors pick one of these cards above the join button. Members see their own offer and can upgrade."
              : "With one offer the sales page shows just the join button. Add a second offer and people choose between cards like these."}
          </p>
        </div>
        {href ? (
          <a className="pn-settings-button" href={href} target="_blank" rel="noreferrer">
            Open sales page<ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
      </header>
      <div className="pn-settings-card-body">
        <div className="pn-offer-sales-preview" aria-label="Preview of the offer cards">
          <WebCommunityOfferChooser preferredPeriod={null} choice={{ offers: cards.length ? cards : [], selected, current: null,
            onSelect: setPicked, button: null, note: null }} />
          {cards.length ? (
            <button type="button" className="pn-offer-sales-preview-button" tabIndex={-1} aria-hidden="true">
              {selected && !selected.is_base ? offerButtonLabel("Join", selected, null) : "Join free"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** "Everyone on Membership (all members)", "Everyone on Consulting or higher", "Everyone on Done for you". */
function audienceLabel(ladder: CommunityBuilderOffer[], offer: CommunityBuilderOffer): string {
  if (offer.is_base) return `Everyone on ${offer.name} (all members)`;
  const higher = ladder.some((other) => other.rank > offer.rank);
  return `Everyone on ${offer.name}${higher ? " or higher" : ""}`;
}
