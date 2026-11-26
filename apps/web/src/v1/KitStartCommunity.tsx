// Start a community (design v1), three steps in one window:
//   1. Set up: name, address, picture, banner.
//   2. The offer: who it's for, what members get, price, listed or not.
//   3. Launch: the invite link, and into the community.
// Beside every step is the card Discover will show, filling in as you go.
// The community is created on step 2's Next; step 3 is shown for it after.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { communityPageAddress, isValidCommunitySlug } from "../../../../shared/communitySlug";
import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { Btn, cx, Icon, KitApp } from "./kit";
import { KitAiHarnessLogos } from "./KitAiHarnessLogos";
import { DiscoverCard } from "./KitDiscover";
import { monthlyCentsFromText, stashStartExtras } from "./startCommunityExtras";

export type KitStartCommunityProps = {
  titleId: string;
  hostName: string | null;
  hostAvatarUrl: string | null;
  hostAvatarFocusX?: number | null;
  hostAvatarFocusY?: number | null;
  hostAvatarZoom?: number | null;
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
// Listed: ready, or what listing still needs (a picture, a banner and a
// one-liner: the server's rule, shared/communityPublishReadiness.ts).
export function startCommunityListingLine(input: { listed: boolean; hasPicture: boolean; hasBanner: boolean; oneLiner: string }): string {
  if (!input.listed) return "Unlisted: only people with your link can find it.";
  const needs = [!input.hasPicture && "a picture", !input.hasBanner && "a banner", !input.oneLiner.trim() && "a one-liner"].filter(Boolean) as string[];
  if (!needs.length) return "It will show in Discover like this.";
  const list = needs.length === 1 ? needs[0] : `${needs.slice(0, -1).join(", ")} and ${needs[needs.length - 1]}`;
  return `Add ${list} to be listed. Until then it stays unlisted.`;
}

export type StartCardFacts = {
  slug: string; name: string; oneLiner: string; avatarUrl: string | null; bannerUrl: string | null;
  avatarFocusX?: number | null; avatarFocusY?: number | null; avatarZoom?: number | null;
  bannerFocusX?: number | null; bannerFocusY?: number | null; bannerZoom?: number | null;
  monthlyCents: number | null; hostName: string | null; hostAvatarUrl: string | null;
  hostAvatarFocusX?: number | null; hostAvatarFocusY?: number | null; hostAvatarZoom?: number | null;
};

// The card Discover shows, from what has been typed so far.
export function startCardCommunity(facts: StartCardFacts): DiscoverCommunitySnapshot {
  return {
    slug: facts.slug || "your-community",
    name: facts.name.trim() || "Your community",
    one_liner: facts.oneLiner.trim() || "Who it's for, in one line.",
    avatar_url: facts.avatarUrl,
    avatar_focus_x: facts.avatarFocusX ?? null,
    avatar_focus_y: facts.avatarFocusY ?? null,
    avatar_zoom: facts.avatarZoom ?? null,
    banner_url: facts.bannerUrl,
    banner_focus_x: facts.bannerFocusX ?? null,
    banner_focus_y: facts.bannerFocusY ?? null,
    banner_zoom: facts.bannerZoom ?? null,
    visibility: "published",
    created_at: "",
    updated_at: "",
    active_plan: facts.monthlyCents
      ? { name: "Membership", description: null, amount_base_units: String(facts.monthlyCents), currency: "usd", currency_decimals: 2, billing_period: "monthly" }
      : null,
    host: facts.hostName
      ? {
          name: facts.hostName,
          avatar_url: facts.hostAvatarUrl,
          avatar_focus_x: facts.hostAvatarFocusX ?? null,
          avatar_focus_y: facts.hostAvatarFocusY ?? null,
          avatar_zoom: facts.hostAvatarZoom ?? null,
        }
      : null,
    member_count: 1,
  };
}

// One step's frame: the form on the left, the card on the right (a picture
// of the card, not a link: out of the tab order). Under the form, one bar that
// is the same on every step: the way back on the left, the step dots in the
// middle, the way forward on the right.
export function StartStepFrame(props: { step: 1 | 2 | 3; card: StartCardFacts; cardLine: string; back?: ReactNode; forward: ReactNode; children: ReactNode }) {
  return (
    <KitApp view="home" part="flow">
      <div className={cx("startc")}>
        <div className={cx("startc-form")}>
          {props.children}
          <div className={cx("startc-foot")}>
            <div className={cx("startc-foot-back")}>{props.back}</div>
            <div className={cx("startc-dots")} role="img" aria-label={`Step ${props.step} of 3`}>
              {[1, 2, 3].map((dot) => <i key={dot} className={cx(dot === props.step && "on")} />)}
            </div>
            <div className={cx("startc-foot-go")}>{props.forward}</div>
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
    hostAvatarFocusX: props.hostAvatarFocusX ?? null, hostAvatarFocusY: props.hostAvatarFocusY ?? null, hostAvatarZoom: props.hostAvatarZoom ?? null,
  };
  const cardLine = step === 1
    ? "This is the card people see. It fills in as you go."
    : startCommunityListingLine({ listed, hasPicture: Boolean(props.avatarUrl), hasBanner: Boolean(props.bannerUrl), oneLiner: props.oneLiner });

  return (
    <StartStepFrame step={step} card={card} cardLine={cardLine}
      back={step === 1
        ? (props.isDismissible ? <Btn onClick={props.onClose}>Cancel</Btn> : null)
        : <Btn disabled={props.isCreating} onClick={() => setStep(1)}><Icon name="back" /> Back</Btn>}
      forward={step === 1
        ? <Btn go disabled={!canGoOn} onClick={() => setStep(2)}>Next <Icon name="arrow" /></Btn>
        : (
          <Btn go disabled={!canGoOn || !priceOk} onClick={create}>
            {props.isCreating ? "Creating community…" : props.hasSession ? <>Create community <Icon name="arrow" /></> : "Sign in to continue"}
          </Btn>
        )}>
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
        </>
      ) : (
        <>
          <div>
            <h2 id={props.titleId}>What you're offering</h2>
            <p className={cx("startc-sub")}>What someone reads before they join. You can change all of this later.</p>
          </div>
          {/* Its own key: a new field, so it takes focus when the step opens. */}
          <label key="one-liner" className={cx("startc-field")}>
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
        </>
      )}
    </StartStepFrame>
  );
}

export type LaunchConnectedAppResult = {
  appId: string;
  name: string;
  appUrl: string | null;
  secret: string;
  webhookSigningSecret?: string | null;
};

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
  aiCopied?: boolean;
  onCopyAiSetup?: () => void;
  connectedApp?: LaunchConnectedAppResult | null;
  connectingApp?: boolean;
  connectAppError?: string | null;
  appSecretCopied?: boolean;
  webhookSecretCopied?: boolean;
  appPromptCopied?: boolean;
  onConnectApp?: (input: { name: string; appUrl: string }) => Promise<void> | void;
  onCopyAppSecret?: () => void;
  onCopyWebhookSecret?: () => void;
  onCopyAppPrompt?: () => void;
  onOpen: () => void;
}) {
  const link = `https://${communityPageAddress(props.card.slug)}`;
  const [showAppConnect, setShowAppConnect] = useState(Boolean(props.connectedApp));
  const [appName, setAppName] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const hadConnectedAppRef = useRef(Boolean(props.connectedApp));
  useEffect(() => {
    if (props.connectedApp && !hadConnectedAppRef.current) {
      setShowAppConnect(true);
    }
    hadConnectedAppRef.current = Boolean(props.connectedApp);
  }, [props.connectedApp]);
  const appExpanded = showAppConnect;
  return (
    <StartStepFrame step={3} card={props.card}
      forward={<Btn go disabled={props.saving || props.opening} onClick={props.onOpen}>{props.opening ? "Opening…" : <>Open community <Icon name="arrow" /></>}</Btn>}
      cardLine={startCommunityListingLine({ listed: props.listed, hasPicture: Boolean(props.card.avatarUrl), hasBanner: Boolean(props.card.bannerUrl), oneLiner: props.card.oneLiner })}>
      <div>
        <h2 id={props.titleId}>{props.card.name.trim() || "Your community"} is ready</h2>
        <p className={cx("startc-sub")}>{props.saving ? "Saving what you wrote…" : "Share your link, or connect your AI to set everything up in minutes."}</p>
      </div>
      <div className={cx("startc-field")}>
        <span>Your invite link</span>
        <div className={cx("startc-link")}>
          <input type="text" readOnly value={link} aria-label="Your invite link" onFocus={(event) => event.target.select()} />
          <Btn small onClick={props.onCopy}>{props.copied ? "Copied" : "Copy"}</Btn>
        </div>
      </div>
      {props.onCopyAiSetup ? (
        <div className={cx("startc-ai")}>
          <div className={cx("startc-ai-head")}>
            <div>
              <strong>Connect your AI</strong>
              <p>Paste one prompt into your favorite AI tool to link Polynet and have it help set up channels, courses, and your Member Board.</p>
            </div>
            <Btn small onClick={props.onCopyAiSetup}>{props.aiCopied ? "Copied" : "Copy setup prompt"}</Btn>
          </div>
          <KitAiHarnessLogos compact />
        </div>
      ) : null}
      {props.onConnectApp ? (
        <div className={cx("startc-app-wrap")}>
          <button
            type="button"
            className={cx("startc-app-toggle")}
            aria-expanded={appExpanded}
            onClick={() => setShowAppConnect((open) => !open)}
          >
            {appExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            <span>{props.connectedApp ? `Connected app: ${props.connectedApp.name}` : "Have a software product? Connect your app"}</span>
            <em>Optional</em>
          </button>
          {appExpanded ? (
            <div className={cx("startc-app-box")}>
              {props.connectedApp ? (
                <>
                  <p className={cx("startc-app-copy")}>
                    {props.connectedApp.appUrl
                      ? `Members will see a Launch ${props.connectedApp.name} button in your sidebar.`
                      : `${props.connectedApp.name} is connected. You can add its link anytime in Settings.`}
                  </p>
                  <div className={cx("startc-field")}>
                    <span>App secret <em>· shown once</em></span>
                    <div className={cx("startc-link")}>
                      <input type="text" readOnly value={props.connectedApp.secret} aria-label="App secret" onFocus={(event) => event.target.select()} />
                      <Btn small onClick={props.onCopyAppSecret}>{props.appSecretCopied ? "Copied" : "Copy"}</Btn>
                    </div>
                  </div>
                  {props.connectedApp.webhookSigningSecret ? (
                    <div className={cx("startc-field")}>
                      <span>Webhook signing secret <em>· shown once</em></span>
                      <div className={cx("startc-link")}>
                        <input
                          type="text"
                          readOnly
                          value={props.connectedApp.webhookSigningSecret}
                          aria-label="Webhook signing secret"
                          onFocus={(event) => event.target.select()}
                        />
                        <Btn small onClick={props.onCopyWebhookSecret}>{props.webhookSecretCopied ? "Copied" : "Copy"}</Btn>
                      </div>
                    </div>
                  ) : null}
                  {props.onCopyAppPrompt ? (
                    <div className={cx("startc-app-acts")}>
                      <Btn small onClick={props.onCopyAppPrompt}>{props.appPromptCopied ? "Copied" : "Copy app prompt"}</Btn>
                      <span>Paste in your app&apos;s coding AI to wire up access.</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className={cx("startc-app-fields")}>
                    <label className={cx("startc-field")}>
                      <span>App name</span>
                      <input
                        type="text"
                        maxLength={60}
                        value={appName}
                        placeholder="e.g. Acme Studio"
                        onChange={(event) => setAppName(event.target.value)}
                      />
                    </label>
                    <label className={cx("startc-field")}>
                      <span>App address <em>· optional</em></span>
                      <input
                        type="text"
                        inputMode="url"
                        value={appUrl}
                        placeholder="https://your-app.com"
                        onChange={(event) => setAppUrl(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className={cx("startc-app-acts")}>
                    <Btn
                      small
                      disabled={props.connectingApp || !appName.trim()}
                      onClick={() => void props.onConnectApp?.({ name: appName.trim(), appUrl: appUrl.trim() })}
                    >
                      {props.connectingApp ? "Connecting…" : "Connect app"}
                    </Btn>
                    <span>Adds a Launch button in your sidebar and gives you a setup prompt.</span>
                  </div>
                  {props.connectAppError ? <p className={cx("startc-err")} role="alert">{props.connectAppError}</p> : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {props.note ? <p className={cx("startc-sub")} role="status">{props.note}</p> : null}
      {props.error ? <p className={cx("startc-err")} role="alert">{props.error}</p> : null}
    </StartStepFrame>
  );
}
