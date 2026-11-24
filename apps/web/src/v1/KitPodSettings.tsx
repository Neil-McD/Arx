// A pod's settings (docs/specs/pods-v0.md, "Pod settings"): one window over
// the pod, opened from its right column. Pitch and People are for the pod's
// hosts and the builder; Access (listed, seats, price) and Pod (rename,
// delete) are the builder's, since they touch money and who sees what. The
// same window will open from community settings' Pods section later.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  addCloudPodMember,
  decideCloudPodRequest,
  formatPodPrice,
  removeCloudPodMember,
  saveCloudPodDetails,
  saveCloudPodPrice,
  setCloudPodHost,
  type CloudPodDetail,
} from "../../../../shared/cloudCommunityPodsGateway";
import { deleteCloudCommunityChannel, renameCloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { listCloudCommunityMemberDirectory, type CloudMemberDirectoryRow } from "../../../../shared/cloudCommunityMemberRecordsGateway";
import { prepareCloudCommunityBrandingField } from "../../../../shared/cloudCommunityAdminGateway";
import { readBannerFileAsWideDataUrlWithinLimit } from "../../../../shared/imageTransforms";
import { askInApp } from "../../../../shared/inAppConfirm";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { Btn, cx, Icon, KitApp } from "./kit";
import { askForPodPagePreview, goToPodsPath } from "./podMemory";
import { podSettingsTabsFor, type PodSettingsTab } from "./podSettingsTabs";

const POD_COVER_CHAR_LIMIT = 1_200_000;
const TAB_LABEL: Record<PodSettingsTab, string> = { pitch: "Pitch", people: "People", access: "Access", pod: "Pod" };

type Props = {
  session: unknown;
  communityId: string;
  pod: CloudPodDetail;
  tab: PodSettingsTab;
  onTab: (tab: PodSettingsTab) => void;
  onClose: () => void;
  onChanged: () => void;
};

function errorText(error: unknown): string {
  const code = String((error as Error)?.message ?? "");
  if (code.includes("community_checkout_unavailable")) return "To charge for a pod, connect Stripe in Manage first.";
  if (code.includes("community_pod_price_invalid")) return "Use a price from $1 to $10,000 a month.";
  if (code.includes("community_pod_cover_invalid")) return "That image couldn't be used. Try another.";
  if (code.includes("community_pod_seat_from_plan")) return "Their plan gives them this seat. Change their plan to take it away.";
  if (code.includes("community_pod_has_payments")) return "People still pay for this pod. Remove them first (that stops their billing), then delete it.";
  if (code.includes("community_manager_required")) return "Only the community's builders can change that.";
  return "That didn't go through. Try again.";
}

// The pod's link, for sharing.
function podLink(slug: string): string {
  const community = window.location.pathname.split("/")[2] ?? "";
  return `${window.location.origin}/c/${community}/pods/${slug}`;
}

export function KitPodSettings(props: Props) {
  const { pod } = props;
  const tabs = podSettingsTabsFor(pod);
  const tab = tabs.includes(props.tab) ? props.tab : tabs[0];
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKey);
    boxRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <KitApp view="wins" part="podsettings">
      <div className={cx("veil")} onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
        <div className={cx("podset")} role="dialog" aria-modal="true" aria-label={`${pod.name} settings`} ref={boxRef} tabIndex={-1}>
          <header className={cx("podset-head")}>
            <div>
              <span className={cx("lab")}>Pod settings</span>
              <h2>{pod.name}</h2>
            </div>
            <button type="button" className={cx("podset-x")} aria-label="Close" onClick={props.onClose}><Icon name="close" /></button>
          </header>
          <nav className={cx("podset-tabs")} role="tablist" aria-label="Settings">
            {tabs.map((entry) => (
              <button key={entry} type="button" role="tab" aria-selected={tab === entry} className={cx(tab === entry ? "on" : "")} onClick={() => props.onTab(entry)}>
                {TAB_LABEL[entry]}{entry === "people" && pod.requests.length ? <em>{pod.requests.length}</em> : null}
              </button>
            ))}
          </nav>
          <div className={cx("podset-body")}>
            {tab === "pitch" ? <PitchTab {...props} />
              : tab === "people" ? <PeopleTab {...props} />
                : tab === "access" ? <AccessTab {...props} />
                  : <PodTab {...props} />}
          </div>
        </div>
      </div>
    </KitApp>,
    document.body,
  );
}

function Field(props: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className={cx("podset-field")}>
      <span className={cx("podset-label")}>{props.label}</span>
      {props.children}
      {props.help ? <span className={cx("sub2")}>{props.help}</span> : null}
    </label>
  );
}

// Pitch: what members outside the pod read, with the page they'll see beside it.
type Cover = { kind: "keep" } | { kind: "remove" } | { kind: "new"; dataUrl: string };
function PitchTab(props: Props) {
  const { pod } = props;
  const [purpose, setPurpose] = useState(pod.purpose);
  const [bullets, setBullets] = useState(pod.what_you_get.join("\n"));
  const [about, setAbout] = useState(pod.about_md ?? "");
  const [cover, setCover] = useState<Cover>({ kind: "keep" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const coverUrl = cover.kind === "new" ? cover.dataUrl : cover.kind === "keep" ? pod.cover?.url ?? null : null;
  const dirty = purpose !== pod.purpose || bullets !== pod.what_you_get.join("\n") || about !== (pod.about_md ?? "") || cover.kind !== "keep";
  const save = async () => {
    if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const bannerStorageId = cover.kind === "new"
        ? (await prepareCloudCommunityBrandingField({ session: props.session, kind: "banner", nextValue: cover.dataUrl })).storageId ?? null
        : cover.kind === "remove" ? null : undefined;
      await saveCloudPodDetails({ session: props.session, communityId: props.communityId, channelId: pod.channel_id,
        purpose, whatYouGet: bullets.split("\n"), about, ...(bannerStorageId !== undefined ? { bannerStorageId } : {}) });
      setCover({ kind: "keep" });
      setSaved(true);
      props.onChanged();
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  const lines = bullets.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4);
  return (
    <div className={cx("podset-split")}>
      <div className={cx("podset-form")}>
        <Field label="What it's for" help="One sentence, under the pod's name.">
          <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={2} maxLength={280} />
        </Field>
        <Field label="What you get" help="Up to four short lines.">
          <textarea value={bullets} onChange={(event) => setBullets(event.target.value)} rows={4} placeholder={"Weekly call with the host\nFeedback on your work"} />
        </Field>
        <Field label="About" help="A few short paragraphs for members deciding whether to join.">
          <textarea value={about} onChange={(event) => setAbout(event.target.value)} rows={7} maxLength={1500} placeholder={"Who it's for, what happens inside, what they'll leave with."} />
        </Field>
        <div className={cx("podset-field")}>
          <span className={cx("podset-label")}>Cover</span>
          <div className={cx("podform-cover")}>
            <label className={cx("btn sm")}>
              {coverUrl ? "Change cover" : "Add a cover"}
              <input type="file" accept="image/*" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (!file.type.toLowerCase().startsWith("image/")) { setError("A cover is an image file."); return; }
                void readBannerFileAsWideDataUrlWithinLimit(file, POD_COVER_CHAR_LIMIT)
                  .then((dataUrl) => setCover({ kind: "new", dataUrl }))
                  .catch(() => setError("That image couldn't be used. Try another."));
              }} />
            </label>
            {coverUrl ? <Btn txt small onClick={() => setCover({ kind: "remove" })}>Remove cover</Btn> : null}
          </div>
        </div>
        {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
        <div className={cx("acts")}>
          <Btn go small disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Btn>
          {saved && !dirty ? <span className={cx("sub2")} role="status">Saved</span> : null}
          {pod.slug ? <Btn txt small onClick={() => { askForPodPagePreview(pod.slug); props.onClose(); goToPodsPath(pod.slug); }}>See it as members do</Btn> : null}
        </div>
      </div>
      {/* What members outside the pod see, as it reads now. */}
      <aside className={cx("podset-preview")} aria-label="What members see">
        <span className={cx("lab")}>What members see</span>
        <div className={cx("land")}>
          {coverUrl ? <img className={cx("podset-cover")} src={coverUrl} alt="" /> : null}
          <header>
            <h2>{pod.name}</h2>
            {purpose.trim() ? <p className={cx("land-p")}>{purpose.trim()}</p> : <p className={cx("land-p dim")}>Add what it's for.</p>}
            {lines.length ? <ul className={cx("podget")}>{lines.map((line) => <li key={line}>{line}</li>)}</ul> : null}
          </header>
          {about.trim() ? <div className="pod-about">{about.trim().split(/\n{2,}/).map((part, index) => <p key={index}>{part}</p>)}</div> : null}
        </div>
      </aside>
    </div>
  );
}

// People: who's asking, who's in and how, adding someone.
function PeopleTab(props: Props) {
  const { pod } = props;
  const builder = pod.can_edit;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [directory, setDirectory] = useState<CloudMemberDirectoryRow[] | null>(null);
  const [query, setQuery] = useState("");
  const run = async (key: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(key); setError(null);
    try { await work(); props.onChanged(); } catch (failure) { setError(errorText(failure)); } finally { setBusy(null); }
  };
  // The directory names people by their public id; members carry both.
  const inPod = useMemo(() => new Set(pod.members.flatMap((member) => [member.user_id, member.public_id].filter(Boolean) as string[])), [pod.members]);
  const loadDirectory = () => {
    if (directory) return;
    void listCloudCommunityMemberDirectory({ session: props.session, communityId: props.communityId }).then(setDirectory).catch(() => setDirectory([]));
  };
  const matches = (directory ?? []).filter((row) => !inPod.has(row.user_id) && (!query.trim() || row.name.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 8);
  const tag = (member: CloudPodDetail["members"][number]) => member.from_plan ? "From their plan"
    : member.payment?.state === "paying" ? "Paying" : member.payment?.state === "leaving" ? "Leaving"
      : member.payment?.state === "payment_problem" ? "Payment problem" : "Added";
  const avatar = (name: string, url?: string | null) => (
    <span className={cx("av s")} title={name}>
      <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={name} imageUrl={url ?? null} alt=""
        fallback={<span>{name.trim().charAt(0).toUpperCase() || "?"}</span>} />
    </span>
  );
  return (
    <div className={cx("podset-people")}>
      {pod.requests.length ? (
        <section>
          <span className={cx("lab")}>Asking to join<em>{pod.requests.length}</em></span>
          {pod.requests.map((request) => (
            <div key={request.user_id} className={cx("podset-row")}>
              <span className={cx("t")}><b>{request.name}</b> {request.status === "waitlist" ? "is on the waitlist" : "asked to join"}</span>
              <Btn small go disabled={Boolean(busy)} onClick={() => void run(`yes:${request.user_id}`, () => decideCloudPodRequest({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: request.user_id, approve: true }))}>Add</Btn>
              <Btn small txt disabled={Boolean(busy)} onClick={() => void run(`no:${request.user_id}`, () => decideCloudPodRequest({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: request.user_id, approve: false }))}>Decline</Btn>
            </div>
          ))}
        </section>
      ) : null}
      <section>
        <span className={cx("lab")}>In this pod<em>{pod.members.length}{pod.seats ? ` of ${pod.seats}` : ""}</em></span>
        {pod.members.length ? pod.members.map((member) => (
          <div key={member.user_id} className={cx("podset-row")}>
            {avatar(member.name, member.avatar_url)}
            <span className={cx("t")}>{member.name}{member.is_host ? <span className={cx("podset-host")}>Host</span> : null}</span>
            <em>{tag(member)}</em>
            {builder ? (
              <button type="button" className={cx("la")} disabled={Boolean(busy)}
                onClick={() => void run(`host:${member.user_id}`, () => setCloudPodHost({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: member.user_id, host: !member.is_host }))}>
                {member.is_host ? "Not host" : "Make host"}
              </button>
            ) : null}
            {builder && !member.from_plan ? (
              <button type="button" className={cx("la")} disabled={Boolean(busy)} onClick={() => void (async () => {
                const paying = member.payment?.state === "paying" || member.payment?.state === "payment_problem";
                if (!(await askInApp({ message: `Take ${member.name} off ${pod.name}?${paying ? " Their payments for it stop." : ""}`, yes: "Remove", no: "Keep", danger: true }))) return;
                await run(`off:${member.user_id}`, () => removeCloudPodMember({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: member.user_id }));
              })()}>Remove</button>
            ) : null}
          </div>
        )) : <p className={cx("sub")}>No one yet.</p>}
      </section>
      <section>
        <span className={cx("lab")}>Add someone</span>
        <input className={cx("podset-search")} value={query} onFocus={loadDirectory} onChange={(event) => { loadDirectory(); setQuery(event.target.value); }}
          placeholder="Search the community's members" aria-label="Search the community's members" />
        {directory === null ? null : matches.length ? matches.map((row) => (
          <div key={row.user_id} className={cx("podset-row")}>
            {avatar(row.name, row.avatar_url)}
            <span className={cx("t")}>{row.name}</span>
            <button type="button" className={cx("la")} disabled={Boolean(busy)}
              onClick={() => void run(`add:${row.user_id}`, () => addCloudPodMember({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, userId: row.user_id }))}>
              Add
            </button>
          </div>
        )) : <p className={cx("sub2")}>{query.trim() ? "No one by that name who isn't already in." : "Everyone's already in."}</p>}
      </section>
      {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
    </div>
  );
}

// Access: who can see it and get in, and what it costs (the builder's).
function AccessTab(props: Props) {
  const { pod } = props;
  const [listed, setListed] = useState(pod.visibility === "listed");
  const [seats, setSeats] = useState(pod.seats ? String(pod.seats) : "");
  const [price, setPrice] = useState(pod.price ? String(Math.round(pod.price.amount_base_units / 100)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const plans = pod.included_with ?? [];
  const save = async () => {
    if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      await saveCloudPodDetails({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, visibility: listed ? "listed" : "hidden", seats: Number(seats) || 0 });
      const cents = (Number(price) || 0) * 100;
      if (cents !== (pod.price?.amount_base_units ?? 0)) await saveCloudPodPrice({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, amountBaseUnits: cents });
      setSaved(true);
      props.onChanged();
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  return (
    <div className={cx("podset-form")}>
      <label className={cx("podform-check")}>
        <input type="checkbox" checked={listed} onChange={(event) => setListed(event.target.checked)} />
        Listed: members can see it and join or ask to
      </label>
      <p className={cx("sub2")}>{listed ? "It shows on the Pods page, locked." : "Hidden: only the people in it know it's here."}</p>
      <Field label="Seats" help="Leave empty for no limit. When it's full, new people join a waitlist.">
        <input value={seats} onChange={(event) => setSeats(event.target.value.replace(/[^0-9]/g, ""))} placeholder="No limit" inputMode="numeric" />
      </Field>
      <Field label="Price, per month" help="On top of membership. Empty means free; members ask to join and you say yes.">
        <span className={cx("podset-price")}>$<input value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ""))} placeholder="Free" inputMode="numeric" /></span>
      </Field>
      {plans.length ? <p className={cx("sub2")}>Included with {plans.map((plan) => plan.name).join(" and ")}: members on {plans.length === 1 ? "that plan" : "those plans"} get in without paying for it separately.</p> : null}
      {pod.price ? <p className={cx("sub2")}>Now: {formatPodPrice(pod.price)}. A new price applies to people who join from now; members who pay keep theirs.</p> : null}
      {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
      <div className={cx("acts")}>
        <Btn go small disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Btn>
        {saved ? <span className={cx("sub2")} role="status">Saved</span> : null}
      </div>
    </div>
  );
}

// Pod: its name, its link, and deleting it (the builder's).
function PodTab(props: Props) {
  const { pod } = props;
  const [name, setName] = useState(pod.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rename = async () => {
    if (busy || !name.trim() || name.trim() === pod.name) return;
    setBusy(true); setError(null);
    try { await renameCloudCommunityChannel({ session: props.session, communityId: props.communityId, channelId: pod.channel_id, name: name.trim() }); props.onChanged(); }
    catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy) return;
    if (!(await askInApp({ message: `Delete ${pod.name}? Its room and what was said in it close for everyone.`, yes: "Delete pod", no: "Keep it", danger: true }))) return;
    setBusy(true); setError(null);
    try {
      await deleteCloudCommunityChannel({ session: props.session, communityId: props.communityId, channelId: pod.channel_id });
      props.onClose();
      goToPodsPath();
    } catch (failure) { setError(errorText(failure)); setBusy(false); }
  };
  return (
    <div className={cx("podset-form")}>
      <Field label="Name">
        <span className={cx("podset-inline")}>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
          <Btn small disabled={busy || !name.trim() || name.trim() === pod.name} onClick={() => void rename()}>Rename</Btn>
        </span>
      </Field>
      {pod.slug ? (
        <Field label="Link" help="Share it so members can find the pod.">
          <span className={cx("podset-inline")}>
            <input value={podLink(pod.slug)} readOnly onFocus={(event) => event.currentTarget.select()} />
            <Btn small onClick={() => { void navigator.clipboard?.writeText(podLink(pod.slug)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined); }}>{copied ? "Copied" : "Copy"}</Btn>
          </span>
        </Field>
      ) : null}
      <div className={cx("podset-danger")}>
        <span className={cx("lab")}>Delete this pod</span>
        <p className={cx("sub2")}>The room closes for everyone. If people still pay for it, remove them first in People: that stops their billing.</p>
        <Btn small disabled={busy} onClick={() => void remove()}>Delete pod</Btn>
      </div>
      {error ? <p className={cx("bad")} role="alert">{error}</p> : null}
    </div>
  );
}
