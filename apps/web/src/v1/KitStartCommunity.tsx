// Start a community (design v1; mock: /design-lab?page=start). Two things to
// type: the name and who it's for. The address is made from the name and can
// be changed. A banner and an avatar are optional. Beside the form is the
// card Discover will show, filling in as you type, with what is still missing
// to be listed.
import { useState } from "react";
import { communityPageAddress, isValidCommunitySlug } from "../../../../shared/communitySlug";
import { discoverListingGap } from "../../../../shared/communityDiscoverListing";
import { Btn, cx, KitApp } from "./kit";
import { DiscoverCard } from "./KitDiscover";

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

// What the preview says under the card: ready, or what Discover still needs.
export function startCommunityListingLine(input: { hasBanner: boolean; oneLiner: string }): string {
  const gap = discoverListingGap({ listed: true, hasBanner: input.hasBanner, oneLiner: input.oneLiner });
  return gap ? `${gap.replace(/\.$/, "")}. You can do that later.` : "Ready to be listed in Discover once you publish it.";
}

export function KitStartCommunity(props: KitStartCommunityProps) {
  const [editingAddress, setEditingAddress] = useState(false);
  const slugOk = isValidCommunitySlug(props.slug);
  const busy = props.isCreating || props.isProcessingAvatar || props.isProcessingBanner;
  const canCreate = !busy && props.name.trim().length > 0 && slugOk;
  const [host, ...path] = communityPageAddress(props.slug).split("/c/");
  const file = (label: string, onFile: (next: File | null) => Promise<void> | void, disabled: boolean) => (
    <label className={cx("btn sm")} aria-disabled={disabled || undefined}>
      {label}
      <input type="file" accept="image/*" disabled={disabled}
        onChange={(event) => { const next = event.target.files?.[0] ?? null; event.target.value = ""; void onFile(next); }} />
    </label>
  );
  return (
    <KitApp view="home" part="flow">
      <div className={cx("startc")}>
        <div className={cx("startc-form")}>
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
          <label className={cx("startc-field")}>
            <span>Who it's for, in one line</span>
            <input type="text" maxLength={180} value={props.oneLiner} placeholder="Early-morning climbers who train together." onChange={(event) => props.onChangeOneLiner(event.target.value)} />
          </label>
          <div className={cx("startc-field")}>
            <span>Banner and avatar <em>· optional</em></span>
            <div className={cx("startc-files")}>
              {file(props.isProcessingBanner ? "Processing banner…" : props.bannerUrl ? "Change banner" : "Add a banner", props.onUploadBanner, props.isProcessingBanner || props.isCreating)}
              {props.bannerUrl ? <Btn small txt onClick={props.onRemoveBanner}>Remove banner</Btn> : null}
              {file(props.isProcessingAvatar ? "Processing avatar…" : props.avatarUrl ? "Change avatar" : "Add an avatar", props.onUploadAvatar, props.isProcessingAvatar || props.isCreating)}
              {props.avatarUrl ? <Btn small txt onClick={props.onRemoveAvatar}>Remove avatar</Btn> : null}
            </div>
          </div>
          {props.error ? <p className={cx("startc-err")} role="alert">{props.error}</p> : null}
          <div className={cx("startc-acts")}>
            <Btn go disabled={!canCreate} onClick={() => void props.onCreate()}>
              {props.isCreating ? "Creating community…" : props.hasSession ? "Create community" : "Sign in to continue"}
            </Btn>
            {props.isDismissible ? <Btn txt disabled={props.isCreating} onClick={props.onClose}>Cancel</Btn> : null}
          </div>
        </div>
        {/* What you are making: the card Discover shows, as you type. */}
        <div className={cx("startc-side")} aria-hidden="true">
          <span className={cx("lab")}>How it looks in Discover</span>
          <DiscoverCard now={Date.now()} community={{
            slug: props.slug || "your-community",
            name: props.name.trim() || "Your community",
            one_liner: props.oneLiner.trim() || "Who it's for, in one line.",
            avatar_url: props.avatarUrl,
            banner_url: props.bannerUrl,
            visibility: "published",
            created_at: "",
            updated_at: "",
            host: props.hostName ? { name: props.hostName, avatar_url: props.hostAvatarUrl } : null,
            member_count: 1,
          }} />
          <p>{startCommunityListingLine({ hasBanner: Boolean(props.bannerUrl), oneLiner: props.oneLiner })}</p>
        </div>
      </div>
    </KitApp>
  );
}
