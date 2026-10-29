import { Check, Copy, Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { describeCommunityAccess, type CommunityMemberAccess } from "../../../../shared/communityAccess";
import {
  communityAccessErrorMessage,
  type CloudCommunityAccessEvent,
  type CloudCommunityAccessIntegration,
  type CloudCommunityAccessIntegrations,
  type CloudCommunityAccessPricePoint,
  type CloudCommunityClientAccessDetail,
  type CloudCommunityIntegrationInput,
  type CloudCommunityTimelineEntry,
  type CloudMyCommunityAccess,
} from "../../../../shared/cloudCommunityMemberAccessGateway";
import type { CommunityAccessGateway } from "../controllers/useWebCommunityAccessGateway";
// The workflow buttons and error text, shared with Settings → Access.
import "./WebCommunityWorkflowsSection.css";
import "./WebCommunityAccess.css";

// Who can use what, and until when. The owner sees it per client (Workflows →
// Clients and the member dossier), connects outside services such as a paid MCP
// server in Settings → Access, and each member makes their own license key.

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "");
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const dateInputValue = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function money(amount: number, currency: string, decimals: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount / 10 ** decimals);
  } catch {
    return `${(amount / 10 ** decimals).toFixed(decimals)} ${currency.toUpperCase()}`;
  }
}

function periodWord(period: string) {
  const value = period.toLowerCase();
  if (value.startsWith("month")) return "month";
  if (value.startsWith("quarter")) return "quarter";
  if (value.startsWith("year") || value.startsWith("annual")) return "year";
  return value;
}

function planText(access: CommunityMemberAccess): string {
  const plan = access.plan;
  if (!plan) return access.status === "ended" ? "No plan now" : "No plan";
  if (plan.kind === "price_point") return `${plan.name} · ${money(plan.amount_base_units, plan.currency, plan.currency_decimals)} a ${periodWord(plan.billing_period)}`;
  if (plan.kind === "grant") return "Access you gave by hand";
  if (plan.kind === "owner") return "Owner";
  return "Free member";
}

function endedText(reason: string | null): string {
  switch (reason) {
    case "access_grant_ended": return "the access you gave ended";
    case "member_left": return "they left";
    case "subscription_canceled": case "subscription_cancelled": return "their plan was cancelled";
    case "subscription_unpaid": return "their plan went unpaid";
    case null: case "": return "";
    default: return reason.replace(/_/g, " ");
  }
}

function accessTone(access: CommunityMemberAccess): "good" | "warn" | "off" {
  if (access.status === "past_due" || access.status === "cancelling") return "warn";
  return access.entitled ? "good" : "off";
}

export function AccessBadge({ access, label }: { access: CommunityMemberAccess; label?: string | null }) {
  const described = describeCommunityAccess(access, day);
  return <span className={`access-badge is-${accessTone(access)}`} title={label ? described : undefined}>{label ?? described}</span>;
}

function UsesList({ uses }: { uses: CommunityMemberAccess["can_use"] }) {
  return <ul className="access-uses">
    {uses.map((use) => <li key={use.key} className={use.included ? "is-included" : "is-excluded"}>
      {use.included ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
      <span>{use.label}</span>
      <small>{use.included ? "Can use" : use.why ?? "Can't use"}</small>
    </li>)}
  </ul>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="access-copy-field">
    <span>{label}</span>
    <code>{value}</code>
    <button type="button" className="workflow-secondary-button" onClick={() => {
      void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); });
    }}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? "Copied" : "Copy"}</button>
  </div>;
}

/** A settings card: plain in the classic settings page, a card in the Substack-style one. */
function AccessCard(props: { title: string; description?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`settings-section pn-settings-card access-card${props.className ? ` ${props.className}` : ""}`}>
    <header className="pn-settings-card-header">
      <h2 className="settings-section-title">{props.title}</h2>
      {props.description ? <p className="settings-section-desc">{props.description}</p> : null}
    </header>
    <div className="pn-settings-card-body access-card-body">{props.children}</div>
  </section>;
}

/** The offers access can be given for, lowest first; empty while loading or when the community sells one. */
function useCommunityOfferOptions(gateway: CommunityAccessGateway): Array<{ key: string; name: string }> {
  const [offers, setOffers] = useState<Array<{ key: string; name: string }>>([]);
  useEffect(() => {
    let alive = true;
    gateway.offers()
      .then((result) => { if (alive) setOffers(result.offers.filter((offer) => !offer.archived).map((offer) => ({ key: offer.key, name: offer.name }))); })
      .catch(() => { if (alive) setOffers([]); });
    return () => { alive = false; };
  }, [gateway]);
  return offers;
}

/** End date (or none) and a reason; with an email when the person isn't picked yet. */
export function GrantForm(props: {
  withEmail?: boolean;
  initialEndsAt?: string | null;
  initialReason?: string;
  submitLabel: string;
  busy: boolean;
  /** The community's offers, when it sells more than one; access is then for one of them. */
  offers?: Array<{ key: string; name: string }>;
  initialOfferKey?: string | null;
  onSubmit: (input: { email?: string; endsAt: string | null; reason: string; offerKey?: string | null }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [noEnd, setNoEnd] = useState(props.initialEndsAt === null && props.initialReason !== undefined);
  const [endsAt, setEndsAt] = useState(props.initialEndsAt ? props.initialEndsAt.slice(0, 10) : dateInputValue(Date.now() + 30 * DAY_MS));
  const [reason, setReason] = useState(props.initialReason ?? "");
  const offers = props.offers ?? [];
  const [offerKey, setOfferKey] = useState(props.initialOfferKey ?? offers[0]?.key ?? "");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const done = await props.onSubmit({ ...(props.withEmail ? { email: email.trim() } : {}), endsAt: noEnd ? null : endsAt, reason: reason.trim(),
      ...(offers.length > 1 ? { offerKey: offerKey || null } : {}) });
    if (done && props.withEmail) { setEmail(""); setReason(""); }
  };
  return <form className="access-grant-form" onSubmit={submit}>
    {props.withEmail ? <label className="access-field">
      <span>Email</span>
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="dean@example.com" autoComplete="off" />
    </label> : null}
    {offers.length > 1 ? <label className="access-field">
      <span>Offer</span>
      <select value={offerKey || offers[0]!.key} onChange={(event) => setOfferKey(event.target.value)}>
        {offers.map((offer) => <option key={offer.key} value={offer.key}>{offer.name}</option>)}
      </select>
    </label> : null}
    <div className="access-field-row">
      <label className="access-field">
        <span>Until</span>
        <input type="date" value={endsAt} min={dateInputValue(Date.now() + DAY_MS)} disabled={noEnd} required={!noEnd}
          onChange={(event) => setEndsAt(event.target.value)} />
      </label>
      <label className="access-check">
        <input type="checkbox" checked={noEnd} onChange={(event) => setNoEnd(event.target.checked)} />
        <span>No end date</span>
      </label>
    </div>
    <label className="access-field">
      <span>Reason</span>
      <input type="text" required maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)}
        placeholder="Trial until their first payment" />
    </label>
    <div className="access-actions">
      <button type="submit" className="workflow-secondary-button access-primary" disabled={props.busy}>{props.busy ? "Saving…" : props.submitLabel}</button>
      {props.onCancel ? <button type="button" className="workflow-secondary-button" disabled={props.busy} onClick={props.onCancel}>Cancel</button> : null}
    </div>
  </form>;
}

function deliveryText(event: NonNullable<CloudCommunityClientAccessDetail["integrations"][number]["last_event"]>): string {
  if (event.status === "delivered") return `Told ${when(event.delivered_at)}`;
  if (event.status === "needs_attention") return `Couldn't reach it${event.last_error_code ? ` (${event.last_error_code.replace(/_/g, " ")})` : ""}. Retry in Settings → Access.`;
  return "Sending…";
}

/** One client's access: plan, what they can use, until when, and the controls. */
export function WebCommunityClientAccessPanel(props: { gateway: CommunityAccessGateway; membershipId: string; onChanged?: () => void }) {
  const { gateway, membershipId } = props;
  const [detail, setDetail] = useState<CloudCommunityClientAccessDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const offers = useCommunityOfferOptions(gateway);
  useEffect(() => {
    let alive = true;
    setState((previous) => (previous === "ready" ? "ready" : "loading"));
    gateway.clientAccess(membershipId)
      .then((loaded) => { if (alive) { setDetail(loaded); setState("ready"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [gateway, membershipId, reload]);
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try {
      await operation();
      setEditing(false); setConfirmEnd(false); setReload((n) => n + 1); props.onChanged?.();
      return true;
    } catch (caught) {
      setError(communityAccessErrorMessage(caught));
      return false;
    } finally { setBusy(false); }
  };
  if (state === "loading") return <p className="access-muted" role="status">Loading access…</p>;
  if (state === "error" || !detail) {
    return <p className="workflow-error" role="alert">Couldn't load their access. <button type="button" className="workflow-secondary-button" onClick={() => setReload((n) => n + 1)}>Try again</button></p>;
  }
  const { access, grant } = detail;
  const paying = access.source === "paid_subscription" && (access.status === "active" || access.status === "past_due" || access.status === "cancelling");
  const history = detail.grants.filter((row) => row.status === "ended");
  return <section className="access-panel" aria-label="Access">
    <div className="access-panel-summary">
      <AccessBadge access={access} />
      <dl className="access-facts">
        <div><dt>Plan</dt><dd>{planText(access)}</dd></div>
        {access.renews_at ? <div><dt>Renews</dt><dd>{day(access.renews_at)}</dd></div> : null}
        {access.ends_at ? <div><dt>Ends</dt><dd>{day(access.ends_at)}</dd></div> : null}
        {access.ended_at ? <div><dt>Ended</dt><dd>{day(access.ended_at)}{endedText(access.ended_reason) ? `, ${endedText(access.ended_reason)}` : ""}</dd></div> : null}
      </dl>
    </div>

    <h4>What they can use</h4>
    <UsesList uses={access.can_use} />
    {detail.is_test_member ? <p className="access-muted">Test member: connected services are never told about them.</p> : null}

    {access.status !== "owner" ? <>
      <h4>Access you give by hand</h4>
      {paying ? <p className="access-muted">They pay through a plan, so their access follows the plan. Change or cancel it in billing.</p>
        : grant ? <>
          <p>“{grant.reason}”, given {day(grant.granted_at)}{grant.granted_via === "agent" ? " by the agent" : ""}. {grant.ends_at ? `Ends ${day(grant.ends_at)}.` : "No end date."}
            {offers.length > 1 ? ` Offer: ${offers.find((offer) => offer.key === grant.offer_key)?.name ?? offers[0]!.name}.` : ""}</p>
          {!editing && !confirmEnd ? <div className="access-actions">
            <button type="button" className="workflow-secondary-button" onClick={() => setEditing(true)}>{offers.length > 1 ? "Change offer or end date" : "Change end date"}</button>
            <button type="button" className="workflow-secondary-button access-danger" onClick={() => setConfirmEnd(true)}>End access now</button>
          </div> : null}
        </>
        : <>
          <p className="access-muted">Give them access without a paid plan: a trial, a comp, a partner.</p>
          {!editing ? <div className="access-actions"><button type="button" className="workflow-secondary-button" onClick={() => setEditing(true)}><Plus size={14} aria-hidden="true" />Give access</button></div> : null}
        </>}
      {editing ? <GrantForm key={grant?.id ?? "new"} initialEndsAt={grant ? grant.ends_at : undefined} initialReason={grant?.reason}
        offers={offers} initialOfferKey={grant?.offer_key ?? null}
        submitLabel={grant ? "Save" : "Give access"} busy={busy} onCancel={() => setEditing(false)}
        onSubmit={(input) => act(() => gateway.grant({ membershipId, endsAt: input.endsAt, reason: input.reason, offerKey: input.offerKey }))} /> : null}
      {confirmEnd ? <div className="access-confirm" role="alertdialog" aria-label="End access now">
        <p>End their access now? They lose the community, courses and every connected service right away.</p>
        <div className="access-actions">
          <button type="button" className="workflow-secondary-button access-danger" disabled={busy} onClick={() => void act(() => gateway.end(membershipId))}>{busy ? "Ending…" : "End access"}</button>
          <button type="button" className="workflow-secondary-button" disabled={busy} onClick={() => setConfirmEnd(false)}>Keep it</button>
        </div>
      </div> : null}
      {history.length ? <details className="access-history">
        <summary>Earlier access you gave ({history.length})</summary>
        <ul>{history.map((row) => <li key={row.id}>
          “{row.reason}”, {day(row.granted_at)} to {day(row.ended_at)} · {row.ended_reason === "replaced" ? "changed" : row.ended_reason === "expired" ? "ended on its date" : "ended by you"}
        </li>)}</ul>
      </details> : null}
    </> : null}

    <h4>License key</h4>
    {detail.license_key ? <>
      <p>Key ending <code>{detail.license_key.last4}</code>, made {day(detail.license_key.created_at)}. {detail.license_key.last_checked_at ? `Last checked ${when(detail.license_key.last_checked_at)}.` : "Not used yet."}</p>
      <div className="access-actions">
        <button type="button" className="workflow-secondary-button access-danger" disabled={busy} onClick={() => void act(() => gateway.revokeKey(membershipId))}>Revoke key</button>
      </div>
    </> : <p className="access-muted">No key yet. They make one in this community's Settings, then paste it into a connected service such as a paid MCP server.</p>}

    {detail.integrations.length ? <>
      <h4>Connected services</h4>
      <ul className="access-services">
        {detail.integrations.map((integration) => <li key={integration.id}>
          <span className={integration.entitled ? "is-included" : "is-excluded"}>
            {integration.entitled ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
            {integration.name}
          </span>
          <small>{integration.last_event ? `${integration.last_event.entitled ? "Can use" : "Can't use"} · ${deliveryText(integration.last_event)}` : integration.entitled ? "Not told yet" : "Nothing to tell yet"}</small>
        </li>)}
      </ul>
    </> : null}
    {error ? <p role="alert" className="workflow-error">{error}</p> : null}
  </section>;
}

export function ClientTimeline({ gateway, membershipId, refreshKey }: { gateway: CommunityAccessGateway; membershipId: string; refreshKey: number }) {
  const [entries, setEntries] = useState<CloudCommunityTimelineEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    gateway.timeline(membershipId).then((rows) => { if (alive) setEntries(rows); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [gateway, membershipId, refreshKey]);
  if (failed) return <p className="access-muted">Couldn't load their history.</p>;
  if (!entries) return <p className="access-muted" role="status">Loading history…</p>;
  if (!entries.length) return <p className="access-muted">Nothing yet.</p>;
  return <ol className="access-timeline">
    {entries.map((entry, index) => <li key={`${entry.at}:${index}`}>
      <time dateTime={entry.at ?? undefined}>{when(entry.at)}</time>
      <span>{entry.summary}</span>
    </li>)}
  </ol>;
}

// ---------------------------------------------------------------------------
// The member's own access and license key

export function WebCommunityMyAccessCard({ gateway, title = "Your access" }: { gateway: CommunityAccessGateway; title?: string }) {
  const [mine, setMine] = useState<CloudMyCommunityAccess | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    gateway.myAccess().then((loaded) => { if (alive) setMine(loaded); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [gateway, reload]);
  if (failed) return null;
  if (!mine) return null;
  const { access } = mine;
  return <AccessCard title={title} className="access-my-card">
    <div className="access-panel-summary">
      <AccessBadge access={access} />
      <dl className="access-facts">
        <div><dt>Plan</dt><dd>{planText(access)}</dd></div>
        {access.renews_at ? <div><dt>Renews</dt><dd>{day(access.renews_at)}</dd></div> : null}
        {access.ends_at ? <div><dt>Ends</dt><dd>{day(access.ends_at)}</dd></div> : null}
      </dl>
    </div>
    <UsesList uses={access.can_use} />
    {mine.license_key_available && access.entitled ? <div className="access-key-block">
      <h4>License key</h4>
      <p className="access-muted">Paste this key into a connected tool, such as a paid MCP server, so it knows you're a member of {mine.community.name}. Keep it to yourself.</p>
      {newKey ? <>
        <CopyField label="Your key" value={newKey} />
        <p className="access-muted">Copy it now. Polynet won't show it again.</p>
      </> : mine.license_key ? <p>Key ending <code>{mine.license_key.last4}</code>, made {day(mine.license_key.created_at)}. {mine.license_key.last_checked_at ? `Last used ${when(mine.license_key.last_checked_at)}.` : "Not used yet."}</p> : null}
      <div className="access-actions">
        <button type="button" className="workflow-secondary-button" disabled={busy} onClick={async () => {
          setBusy(true); setError(null);
          try { const created = await gateway.createMyKey(); setNewKey(created.key); setReload((n) => n + 1); }
          catch (caught) { setError(communityAccessErrorMessage(caught)); }
          finally { setBusy(false); }
        }}>{busy ? "Making…" : mine.license_key || newKey ? "Replace key" : "Make my key"}</button>
      </div>
      {mine.license_key || newKey ? <p className="access-muted">Replacing it stops the old key working everywhere.</p> : null}
      {error ? <p role="alert" className="workflow-error">{error}</p> : null}
    </div> : null}
  </AccessCard>;
}

// ---------------------------------------------------------------------------
// Settings → Access: connected services and giving access by email

function IntegrationForm(props: {
  initial?: CloudCommunityAccessIntegration;
  pricePoints: CloudCommunityAccessPricePoint[];
  loopbackAllowed: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: (input: CloudCommunityIntegrationInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(props.initial?.name ?? "");
  const [webhookUrl, setWebhookUrl] = useState(props.initial?.webhook_url ?? "");
  const [allPlans, setAllPlans] = useState(!props.initial?.price_point_ids.length);
  const [plans, setPlans] = useState<string[]>(props.initial?.price_point_ids ?? []);
  const [includeOwnerGrants, setIncludeOwnerGrants] = useState(props.initial?.include_owner_grants ?? true);
  return <form className="access-integration-form" onSubmit={(event) => {
    event.preventDefault();
    props.onSubmit({ name: name.trim(), webhookUrl: webhookUrl.trim(), pricePointIds: allPlans ? [] : plans, includeOwnerGrants });
  }}>
    <label className="access-field"><span>Name</span><input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="access-field">
      <span>Webhook address</span>
      <input required type="url" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)}
        placeholder="https://your-mcp.example.com/api/polynet-webhook" />
      <small>Polynet sends a signed message here whenever someone's access changes.{props.loopbackAllowed ? " On this local build a http://localhost address works too." : ""}</small>
    </label>
    <fieldset className="access-fieldset">
      <legend>Who it covers</legend>
      <label className="access-check"><input type="radio" checked={allPlans} onChange={() => setAllPlans(true)} /><span>Everyone on any paid plan</span></label>
      <label className="access-check"><input type="radio" checked={!allPlans} onChange={() => setAllPlans(false)} disabled={!props.pricePoints.length} /><span>Only these plans</span></label>
      {!allPlans ? <div className="access-plan-picks">{props.pricePoints.map((point) => <label key={point.id} className="access-check">
        <input type="checkbox" checked={plans.includes(point.id)} onChange={(event) => setPlans((previous) => event.target.checked ? [...previous, point.id] : previous.filter((id) => id !== point.id))} />
        <span>{point.name} · {money(point.amount_base_units, point.currency, point.currency_decimals)} a {periodWord(point.billing_period)}</span>
      </label>)}</div> : null}
      <label className="access-check"><input type="checkbox" checked={includeOwnerGrants} onChange={(event) => setIncludeOwnerGrants(event.target.checked)} /><span>Also people you give access by hand (trials, comps)</span></label>
    </fieldset>
    <div className="access-actions">
      <button type="submit" className="workflow-secondary-button access-primary" disabled={props.busy || (!allPlans && !plans.length)}>{props.busy ? "Saving…" : props.submitLabel}</button>
      <button type="button" className="workflow-secondary-button" disabled={props.busy} onClick={props.onCancel}>Cancel</button>
    </div>
  </form>;
}

function eventLine(event: CloudCommunityAccessEvent): ReactNode {
  const who = event.type === "integration.test" ? "Test message" : event.member_email ?? event.member_id ?? "A member";
  const what = event.type === "integration.test" ? "" : event.entitled ? " can use it" : " can't use it";
  const status = event.status === "delivered" ? `delivered ${when(event.delivered_at)}`
    : event.status === "needs_attention" ? `not delivered${event.last_error_code ? ` (${event.last_error_code.replace(/_/g, " ")})` : ""}`
    : event.next_attempt_at ? `trying again ${when(event.next_attempt_at)}` : "sending";
  return <><strong>{who}</strong>{what} · {status}</>;
}

function IntegrationCard(props: {
  gateway: CommunityAccessGateway;
  integration: CloudCommunityAccessIntegration;
  lists: CloudCommunityAccessIntegrations;
  onChanged: () => void;
  onSecret: (secrets: { title: string; apiKey?: string; signingSecret?: string }) => void;
}) {
  const { gateway, integration } = props;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [events, setEvents] = useState<CloudCommunityAccessEvent[] | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const loadEvents = () => gateway.events(integration.id).then(setEvents).catch(() => setEvents([]));
  useEffect(() => { if (showEvents) void loadEvents(); }, [showEvents, integration.id]);
  const act = async (operation: () => Promise<unknown>, done?: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await operation(); if (done) setNotice(done); props.onChanged(); if (showEvents) void loadEvents(); }
    catch (caught) { setError(communityAccessErrorMessage(caught)); }
    finally { setBusy(false); }
  };
  const failing = Boolean(integration.last_failed_at && (!integration.last_delivered_at || integration.last_failed_at > integration.last_delivered_at));
  const planNames = integration.price_point_ids.length
    ? integration.price_point_ids.map((id) => props.lists.price_points.find((point) => point.id === id)?.name ?? "A removed plan").join(", ")
    : "Every paid plan";
  return <article className="access-integration">
    <header>
      <strong>{integration.name}</strong>
      <span className={`access-badge ${failing ? "is-warn" : integration.last_delivered_at ? "is-good" : "is-off"}`}>
        {failing ? "Can't reach it" : integration.last_delivered_at ? "Connected" : "Waiting for first delivery"}
      </span>
    </header>
    {editing ? <IntegrationForm initial={integration} pricePoints={props.lists.price_points} loopbackAllowed={props.lists.loopback_webhooks_allowed}
      busy={busy} submitLabel="Save" onCancel={() => setEditing(false)}
      onSubmit={(input) => void act(async () => { await gateway.updateIntegration(integration.id, input); setEditing(false); }, "Saved.")} /> : <>
      <dl className="access-facts access-integration-facts">
        <div><dt>Covers</dt><dd>{planNames}{integration.include_owner_grants ? ", plus access you give by hand" : ""}</dd></div>
        <div><dt>Webhook</dt><dd><code>{integration.webhook_url}</code></dd></div>
        <div><dt>API key</dt><dd>ends <code>{integration.api_key_last4}</code>{integration.last_lookup_at ? ` · last lookup ${when(integration.last_lookup_at)}` : " · no lookups yet"}</dd></div>
        <div><dt>Signing secret</dt><dd>ends <code>{integration.signing_secret_last4}</code></dd></div>
        <div><dt>Last delivery</dt><dd>{integration.last_delivered_at ? when(integration.last_delivered_at) : "None yet"}{failing ? ` · failed ${when(integration.last_failed_at)}${integration.last_error_code ? ` (${integration.last_error_code.replace(/_/g, " ")})` : ""}` : ""}</dd></div>
      </dl>
      <div className="access-actions access-integration-actions">
        <button type="button" className="workflow-secondary-button" disabled={busy} onClick={() => void act(() => gateway.sendTest(integration.id), "Test message sent. It shows under Deliveries.")}>Send test</button>
        <button type="button" className="workflow-secondary-button" disabled={busy} onClick={() => setShowEvents((value) => !value)}>{showEvents ? "Hide deliveries" : "Deliveries"}</button>
        <button type="button" className="workflow-secondary-button" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="workflow-secondary-button" disabled={busy} onClick={() => void act(async () => {
          const rotated = await gateway.rotateSecret(integration.id, "api_key");
          props.onSecret({ title: `New API key for ${integration.name}`, apiKey: rotated.api_key });
        })}>New API key</button>
        <button type="button" className="workflow-secondary-button" disabled={busy} onClick={() => void act(async () => {
          const rotated = await gateway.rotateSecret(integration.id, "signing_secret");
          props.onSecret({ title: `New signing secret for ${integration.name}`, signingSecret: rotated.signing_secret });
        })}>New signing secret</button>
        <button type="button" className="workflow-secondary-button access-danger" disabled={busy} onClick={() => setConfirmRevoke(true)}>Disconnect</button>
      </div>
    </>}
    {confirmRevoke ? <div className="access-confirm" role="alertdialog" aria-label={`Disconnect ${integration.name}`}>
      <p>Disconnect {integration.name}? Its API key stops working at once and Polynet stops telling it about access changes. It will treat everyone as not covered.</p>
      <div className="access-actions">
        <button type="button" className="workflow-secondary-button access-danger" disabled={busy} onClick={() => void act(() => gateway.revokeIntegration(integration.id))}>Disconnect</button>
        <button type="button" className="workflow-secondary-button" disabled={busy} onClick={() => setConfirmRevoke(false)}>Keep it</button>
      </div>
    </div> : null}
    {showEvents ? <div className="access-events">
      {!events ? <p className="access-muted" role="status">Loading deliveries…</p>
        : !events.length ? <p className="access-muted">No deliveries yet.</p>
        : <ul>{events.map((event) => <li key={event.event_id} className={`is-${event.status}`}>
          <span>{eventLine(event)}</span>
          {event.status === "needs_attention" ? <button type="button" className="workflow-secondary-button" disabled={busy}
            onClick={() => void act(() => gateway.retryEvent(integration.id, event.event_id), "Sending again.")}>Retry</button> : null}
        </li>)}</ul>}
    </div> : null}
    {notice ? <p role="status" className="access-notice">{notice}</p> : null}
    {error ? <p role="alert" className="workflow-error">{error}</p> : null}
  </article>;
}

function SecretsReveal(props: { title: string; apiKey?: string; signingSecret?: string; lookupUrl: string | null; onDone: () => void }) {
  return <div className="access-secrets" role="region" aria-label={props.title}>
    <strong>{props.title}</strong>
    <p className="access-muted">Copy these into the service's settings now. Polynet only keeps a fingerprint, so it can't show them again.</p>
    {props.lookupUrl && props.apiKey ? <CopyField label="Lookup address" value={props.lookupUrl} /> : null}
    {props.apiKey ? <CopyField label="API key" value={props.apiKey} /> : null}
    {props.signingSecret ? <CopyField label="Signing secret" value={props.signingSecret} /> : null}
    <div className="access-actions"><button type="button" className="workflow-secondary-button access-primary" onClick={props.onDone}>I've saved them</button></div>
  </div>;
}

export function WebCommunityAccessSettings({ gateway }: { gateway: CommunityAccessGateway }) {
  const [lists, setLists] = useState<CloudCommunityAccessIntegrations | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ title: string; apiKey?: string; signingSecret?: string } | null>(null);
  const [granting, setGranting] = useState(false);
  const offers = useCommunityOfferOptions(gateway);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantNotice, setGrantNotice] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    gateway.integrations().then((loaded) => { if (alive) setLists(loaded); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [gateway, reload]);
  return <div className="access-settings pn-settings-stack">
    <AccessCard title="Connected services" description={<>
      An outside tool, such as a paid MCP server, checks here who can use it. Polynet tells it the moment someone's access starts or stops,
      and it can look anyone up by email, member id or license key.
    </>}>
      {failed ? <p className="workflow-error" role="alert">Couldn't load connected services. <button type="button" className="workflow-secondary-button" onClick={() => setReload((n) => n + 1)}>Try again</button></p>
        : !lists ? <p className="access-muted" role="status">Loading…</p>
        : <>
          {secrets ? <SecretsReveal {...secrets} lookupUrl={lists.lookup_url} onDone={() => setSecrets(null)} /> : null}
          {lists.integrations.map((integration) => <IntegrationCard key={integration.id} gateway={gateway} integration={integration} lists={lists}
            onChanged={() => setReload((n) => n + 1)} onSecret={setSecrets} />)}
          {lists.lookup_url && lists.integrations.length ? <p className="access-muted">Lookup address: <code>{lists.lookup_url}</code></p> : null}
          {creating ? <IntegrationForm pricePoints={lists.price_points} loopbackAllowed={lists.loopback_webhooks_allowed} busy={busy}
            submitLabel="Connect" onCancel={() => setCreating(false)} onSubmit={async (input) => {
              setBusy(true); setError(null);
              try {
                const created = await gateway.createIntegration(input);
                setCreating(false);
                setSecrets({ title: `${created.integration.name} is connected`, apiKey: created.api_key, signingSecret: created.signing_secret });
                setReload((n) => n + 1);
              } catch (caught) { setError(communityAccessErrorMessage(caught)); } finally { setBusy(false); }
            }} />
            : lists.integrations.length < 5 ? <button type="button" className="workflow-secondary-button" onClick={() => setCreating(true)}><Plus size={14} aria-hidden="true" />Connect a service</button> : null}
          {error ? <p role="alert" className="workflow-error">{error}</p> : null}
        </>}
    </AccessCard>
    <AccessCard title="Give someone access" description={<>
      For a trial, a comp or a partner. They need a Polynet account with a verified email. Access ends on the date you pick and
      connected services hear about it. Change or end it later from their row in Members.
    </>}>
      <GrantForm withEmail submitLabel="Give access" busy={granting} offers={offers} onSubmit={async (input) => {
        setGranting(true); setGrantError(null); setGrantNotice(null);
        try {
          await gateway.grant({ email: input.email, endsAt: input.endsAt, reason: input.reason, offerKey: input.offerKey });
          setGrantNotice(`Gave ${input.email} access${input.endsAt ? ` until ${day(`${input.endsAt}T12:00:00Z`)}` : ""}.`);
          return true;
        } catch (caught) { setGrantError(communityAccessErrorMessage(caught)); return false; } finally { setGranting(false); }
      }} />
      {grantNotice ? <p role="status" className="access-notice">{grantNotice}</p> : null}
      {grantError ? <p role="alert" className="workflow-error">{grantError}</p> : null}
    </AccessCard>
    <WebCommunityMyAccessCard gateway={gateway} title="Your own key" />
  </div>;
}
