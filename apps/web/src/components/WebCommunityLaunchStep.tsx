import { useEffect, useRef, useState } from "react";

import { fetchCloudCommunitySettings, saveCloudCommunitySettings } from "../../../../shared/cloudCommunityAdminGateway";
import { communityPageAddress } from "../../../../shared/communitySlug";
import { KitStartLaunch } from "../v1/KitStartCommunity";
import { startExtrasNeedSaving, takeStartExtras } from "../v1/startCommunityExtras";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";

type LaunchCommunity = {
  id: string;
  slug: string;
  name: string;
  one_liner?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
};

export type WebCommunityLaunchStepProps = {
  community: LaunchCommunity;
  hostName: string | null;
  hostAvatarUrl: string | null;
  ensureSession: () => Promise<unknown | null>;
  // Marks setup finished and opens the community.
  onComplete: () => Promise<boolean>;
};

// A price can't be charged until the host's payouts are connected.
const isPayoutsError = (message: string) => /community_payout_access_required|community_stripe_connect/.test(message);

// The last step of starting a community, shown for one that was just created
// (and again after a refresh, until it is opened): it saves what step 2 asked
// for, then gives the invite link and the way in.
export function WebCommunityLaunchStep(props: WebCommunityLaunchStepProps) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listed, setListed] = useState(false);
  const [monthlyCents, setMonthlyCents] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  const [copied, setCopied] = useState(false);
  const ensureSessionRef = useRef(props.ensureSession);
  ensureSessionRef.current = props.ensureSession;
  const communityId = props.community.id;
  const slug = props.community.slug;

  useEffect(() => {
    const extras = takeStartExtras(slug);
    if (!startExtrasNeedSaving(extras)) return;
    let cancelled = false;
    setSaving(true);
    void (async () => {
      try {
        const session = await ensureSessionRef.current();
        if (!session) throw new Error("session");
        const now = await fetchCloudCommunitySettings({ session, communityId });
        if (!now) throw new Error("settings");
        const save = (cents: number | null) => saveCloudCommunitySettings({
          session,
          communityId,
          expectedSettingsRevision: now.settings_revision,
          name: now.name,
          slug: now.slug,
          oneLiner: now.one_liner,
          about: extras.about || now.about,
          avatarStorageId: now.avatar_storage_id,
          avatarUrl: now.avatar_url,
          avatarFocusX: now.avatar_focus_x,
          avatarFocusY: now.avatar_focus_y,
          avatarZoom: now.avatar_zoom,
          bannerStorageId: now.banner_storage_id,
          bannerUrl: now.banner_url,
          bannerFocusX: now.banner_focus_x,
          bannerFocusY: now.banner_focus_y,
          bannerZoom: now.banner_zoom,
          visibility: extras.listed ? "published" : now.visibility,
          monthlyAmountBaseUnits: cents,
          annualAmountBaseUnits: null,
        });
        let saved;
        let payoutsMissing = false;
        try {
          saved = await save(extras.monthlyCents);
        } catch (failure) {
          if (!extras.monthlyCents || !isPayoutsError(failure instanceof Error ? failure.message : String(failure ?? ""))) throw failure;
          // Everything else is still saved; the price waits for payouts.
          payoutsMissing = true;
          saved = await save(null);
        }
        if (cancelled) return;
        if (!saved) throw new Error("save");
        setListed(saved.visibility === "published");
        setMonthlyCents(saved.pricing.monthly_amount_base_units);
        if (payoutsMissing) setNote("It's free to join for now. Connect payouts in Settings to set your price.");
      } catch {
        if (!cancelled) setError("What you wrote on the last step couldn't be saved. You can add it in Settings.");
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [communityId, slug]);

  const copy = () => {
    void navigator.clipboard?.writeText(`https://${communityPageAddress(slug)}`).then(() => setCopied(true), () => setCopied(false));
  };
  const open = async () => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      if (!(await props.onComplete())) setError("The community couldn't be opened. Try again.");
    } catch {
      setError("The community couldn't be opened. Try again.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <WebBlockingSetupModal titleId="community-launch-title" busy={saving || opening} size="wide" className="create-community-modal builder-create-modal is-kit-start">
      <KitStartLaunch
        titleId="community-launch-title"
        card={{
          slug,
          name: props.community.name,
          oneLiner: String(props.community.one_liner ?? ""),
          avatarUrl: props.community.avatar_url ?? null,
          bannerUrl: props.community.banner_url ?? null,
          monthlyCents,
          hostName: props.hostName,
          hostAvatarUrl: props.hostAvatarUrl,
        }}
        listed={listed}
        saving={saving}
        note={note}
        error={error}
        opening={opening}
        copied={copied}
        onCopy={copy}
        onOpen={() => void open()}
      />
    </WebBlockingSetupModal>
  );
}
