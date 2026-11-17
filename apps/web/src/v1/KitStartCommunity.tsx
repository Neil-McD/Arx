// Start a community (design v1), three steps in one window:
//   1. Set up: name, address, picture, banner.
//   2. The offer: who it's for, what members get, price, listed or not.
//   3. Launch: the invite link, and into the community.
// Beside every step is the card Discover will show, filling in as you go.
// The community is created on step 2's Next; step 3 is shown for it after.
import { useState, type ReactNode } from "react";
import { communityPageAddress, isValidCommunitySlug } from "../../../../shared/communitySlug";
import { discoverListingGap } from "../../../../shared/communityDiscoverListing";
import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { Btn, cx, KitApp } from "./kit";
import { DiscoverCard } from "./KitDiscover";
import { monthlyCentsFromText, stashStartExtras } from "./startCommunityExtras";

export type KitStartCommunityProps = {
  titleId: string;
  hostName: string | null;
  hostAvatarUrl: string | null;
  isPaidSetup: boolean;
  hasSession: boolean;
  isDismissible: boolean;
  name: string;
  oneLiner: string;
  slug: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  error: string | null;
  isCreating: boolean;
  isProcessingAvatar: boolean;
  isProcessingBanner: boolean;
  onClose: () => void;
  onCreate: () => Promise<void> | void;
  onUploadAvatar: (file: File | null) => Promise<void> | void;
  onUploadBanner: (file: File | null) => Promise<void> | void;
  onRemoveAvatar: () => void;
  onRemoveBanner: () => void;
  onChangeName: (value: string) => void;
  onChangeOneLiner: (value: string) => void;
  onChangeSlug: (value: string) => void;
  onChangeSlugEdited: (value: boolean) => void;
};

// What the preview says under the card. Unlisted: only people with the link.
// Listed: ready, or what Discover still needs.
export function startCommunityListingLine(input: { listed: boolean; hasBanner: boolean; oneLiner: string }): string {
  if (!input.listed) return "Unlisted: only people with your link can find it.";
  const gap = discoverListingGap({ listed: true, hasBanner: input.hasBanner, oneLiner: input.oneLiner });
  return gap ? `${gap.replace(/\.$/, "")}. Until then it stays out of Discover.` : "It will show in Discover like this.";
}

export type StartCardFacts = {
  slug: string; name: string; oneLiner: string; avatarUrl: string | null; bannerUrl: string | null;
  monthlyCents: number | null; hostName: string | null; hostAvatarUrl: string | null;
};

// The card Discover shows, from what has been typed so far.
export function startCardCommunity(facts: StartCardFacts): DiscoverCommunitySnapshot {
  return {
    slug: facts.slug || "your-community",
    name: facts.name.trim() || "Your community",
    one_liner: facts.oneLiner.trim() || "Who it's for, in one line.",
    avatar_url: facts.avatarUrl,
    banner_url: facts.bannerUrl,
    visibility: "published",
    created_at: "",
    updated_at: "",
    active_plan: facts.monthlyCents
      ? { name: "Membership", description: null, amount_base_units: String(facts.monthlyCents), currency: "usd", currency_decimals: 2, billing_period: "monthly" }
      : null,
    host: facts.hostName ? { name: facts.hostName, avatar_url: facts.hostAvatarUrl } : null,
    member_count: 1,
  };
}

// One step's frame: the form on the left with the step dots under it, the
// card on the right. A picture of the card, not a link: out of the tab order.
export function StartStepFrame(props: { step: 1 | 2 | 3; card: StartCardFacts; cardLine: string; children: ReactNode }) {
  return (
    <KitApp view="home" part="flow">
      <div className={cx("startc")}>
        <div className={cx("startc-form")}>
          {props.children}
          <div className={cx("startc-dots")} role="img" aria-label={`Step ${props.step} of 3`}>
            {[1, 2, 3].map((dot) => <i key={dot} className={cx(dot === props.step && "on")} />)}
          </div>
        </div>
        <div className={cx("startc-side")} aria-hidden="true" {...({ inert: "" } as Record<string, string>)}>
          <span className={cx("lab")}>How it looks in Discover</span>
          <DiscoverCard now={Date.now()} community={startCardCommunity(props.card)} />
          <p>{props.cardLine}</p>
        </div>
      </div>
    </KitApp>
  );
}

export function KitStartCommunity(props: KitStartCommunityProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [editingAddress, setEditingAddress] = useState(false);
  const [about, setAbout] = useState("");
  const [listed, setListed] = useState(false);
  const [paid, setPaid] = useState(false);
  const [priceText, setPriceText] = useState("");
  const slugOk = isValidCommunitySlug(props.slug);
  const busy = props.isCreating || props.isProcessingAvatar || props.isProcessingBanner;
  const canGoOn = !busy && props.name.trim().length > 0 && slugOk;
  const monthlyCents = paid ? monthlyCentsFromText(priceText) : null;
  const priceOk = !paid || monthlyCents !== null;
  const [host, ...path] = communityPageAddress(props.slug).split("/c/");
  const file = (label: string, onFile: (next: File | null) => Promise<void> | void, disabled: boolean) => (
    <label className={cx("btn sm")} aria-disabled={disabled || undefined}>
      {label}
      <input type="file" accept="image/*" disabled={disabled}
        onChange={(event) => { const next = event.target.files?.[0] ?? null; event.target.value = ""; void onFile(next); }} />
    </label>
  );
  const create = () => {
    // Saved right after the community exists (WebCommunityLaunchStep).
    stashStartExtras(props.slug, { about: about.trim(), listed, monthlyCents });
    void props.onCreate();
  };
  const card: StartCardFacts = {
    slug: props.slug, name: props.name, oneLiner: props.oneLiner, avatarUrl: props.avatarUrl, bannerUrl: props.bannerUrl,
    monthlyCents, hostName: props.hostName, hostAvatarUrl: props.hostAvatarUrl,
  };
  const cardLine = step === 1
    ? "This is the card people see. It fills in as you go."
    : startCommunityListingLine({ listed, hasBanner: Boolean(props.bannerUrl), oneLiner: props.oneLiner });

  return (
    <StartStepFrame step={step} card={card} cardLine={cardLine}>
      {step === 1 ? (
        <>
          <div>
            <h2 id={props.titleId}>Start a community</h2>
            <p className={cx("startc-sub")}>{props.isPaidSetup ? "Your Agent plan is ready. You can change all of this later." : "Free to build. You can change all of this later."}</p>
          </div>
          <label className={cx("startc-field")}>
            <span>Name</span>
            <input type="text" autoFocus value={props.name} placeholder="Sunrise Climbing Club" onChange={(event) => props.onChangeName(event.target.value)} />
            {editingAddress || (props.slug.length > 0 && !slugOk) ? null : (
              <span className={cx("startc-addr")}>{host}/c/<b>{path.join("/c/")}</b> · <button type="button" onClick={() => setEditingAddress(true)}>Change</button></span>
            )}
          </label>
          {editingAddress || (props.slug.length > 0 && !slugOk) ? (
            <label className={cx("startc-field")}>
              <span>Address</span>
              <input type="text" required maxLength={32} value={props.slug} placeholder="your-community" aria-invalid={props.slug.length > 0 && !slugOk}
                onChange={(event) => { props.onChangeSlug(event.target.value); props.onChangeSlugEdited(true); }} />
              <span className={cx("startc-addr")}>{communityPageAddress(props.slug)} · 3 to 32 lowercase letters, numbers and dashes.</span>
            </label>
          ) : null}
          <div className={cx("startc-field")}>
            <span>Picture and banner <em>· optional</em></span>
            <div className={cx("startc-files")}>
              {file(props.isProcessingAvatar ? "Processing picture…" : props.avatarUrl ? "Change picture" : "Add a picture", props.onUploadAvatar, props.isProcessingAvatar || props.isCreating)}
              {props.avatarUrl ? <Btn small txt onClick={props.onRemoveAvatar}>Remove picture</Btn> : null}
              {file(props.isProcessingBanner ? "Processing banner…" : props.bannerUrl ? "Change banner" : "Add a banner", props.onUploadBanner, props.isProcessingBanner || props.isCreating)}
              {props.bannerUrl ? <Btn small txt onClick={props.onRemoveBanner}>Remove banner</Btn> : null}
            </div>
          </div>
          {props.error ? <p className={cx("startc-err")} role="alert">{props.error}</p> : null}
          <div className={cx("startc-acts")}>
            <Btn go disabled={!canGoOn} onClick={() => setStep(2)}>Next</Btn>
            {props.isDismissible ? <Btn txt onClick={props.onClose}>Cancel</Btn> : null}
          </div>
        </>
      ) : (
        <>
          <div>
            <h2 id={props.titleId}>What you're offering</h2>
            <p className={cx("startc-sub")}>What someone reads before they join. You can change all of this later.</p>
          </div>
          <label className={cx("startc-field")}>
            <span>Who it's for, in one line</span>
            <input type="text" autoFocus maxLength={180} value={props.oneLiner} placeholder="Early-morning climbers who train together." onChange={(event) => props.onChangeOneLiner(event.target.value)} />
          </label>
          <label className={cx("startc-field")}>
            <span>What members get <em>· optional</em></span>
            <textarea rows={4} maxLength={4000} value={about} placeholder="What happens here, how often, and what someone walks away with." onChange={(event) => setAbout(event.target.value)} />
          </label>
          <div className={cx("startc-field")}>
            <span>Price</span>
            <div className={cx("startc-pick")} role="radiogroup" aria-label="Price">
              <button type="button" role="radio" aria-checked={!paid} className={cx(!paid && "on")} onClick={() => setPaid(false)}>Free</button>
              <button type="button" role="radio" aria-checked={paid} className={cx(paid && "on")} onClick={() => setPaid(true)}>Paid</button>
              {paid ? (
                <label className={cx("startc-price")}>
                  <span>$</span>
                  <input type="text" inputMode="decimal" autoFocus value={priceText} placeholder="29" aria-label="Price a month, in dollars" aria-invalid={priceText.length > 0 && !priceOk}
                    onChange={(event) => setPriceText(event.target.value)} />
                  <span>a month</span>
                </label>
              ) : null}
            </div>
            {paid ? <span className={cx("startc-addr")}>Charging starts once payouts are connected in Settings. Until then it is free to join.</span> : null}
          </div>
          <label className={cx("startc-check")}>
            <input type="checkbox" checked={listed} onChange={(event) => setListed(event.target.checked)} />
            <span>List it in Discover</span>
          </label>
          {props.error ? <p className={cx("startc-err")} role="alert">{props.error}</p> : null}
          <div className={cx("startc-acts")}>
            <Btn go disabled={!canGoOn || !priceOk} onClick={create}>
              {props.isCreating ? "Creating community…" : props.hasSession ? "Create community" : "Sign in to continue"}
            </Btn>
            <Btn txt disabled={props.isCreating} onClick={() => setStep(1)}>Back</Btn>
          </div>
        </>
      )}
    </StartStepFrame>
  );
}

// Step 3, shown for the community once it exists.
export function KitStartLaunch(props: {
  titleId: string;
  card: StartCardFacts;
  listed: boolean;
  // Finishing what step 2 asked for (about, listing, price).
  saving: boolean;
  note: string | null;
  error: string | null;
  opening: boolean;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
}) {
  const link = `https://${communityPageAddress(props.card.slug)}`;
  return (
    <StartStepFrame step={3} card={props.card}
      cardLine={startCommunityListingLine({ listed: props.listed, hasBanner: Boolean(props.card.bannerUrl), oneLiner: props.card.oneLiner })}>
      <div>
        <h2 id={props.titleId}>{props.card.name.trim() || "Your community"} is ready</h2>
        <p className={cx("startc-sub")}>{props.saving ? "Saving what you wrote…" : "Send this link to the first people you want in."}</p>
      </div>
      <div className={cx("startc-field")}>
        <span>Your invite link</span>
        <div className={cx("startc-link")}>
          <input type="text" readOnly value={link} aria-label="Your invite link" onFocus={(event) => event.target.select()} />
          <Btn small onClick={props.onCopy}>{props.copied ? "Copied" : "Copy"}</Btn>
        </div>
      </div>
      {props.note ? <p className={cx("startc-sub")} role="status">{props.note}</p> : null}
      {props.error ? <p className={cx("startc-err")} role="alert">{props.error}</p> : null}
      <div className={cx("startc-acts")}>
        <Btn go disabled={props.saving || props.opening} onClick={props.onOpen}>{props.opening ? "Opening…" : "Open community"}</Btn>
      </div>
    </StartStepFrame>
  );
}
