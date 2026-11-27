// Owner-only Settings -> Guide controls for AI credits & Chief of Staff
// automation (docs/specs/proactive-community-agent-v0.md). Loaded on demand for
// community owners only so members never download it.
import { useEffect, useState } from "react";
import { formatAllowanceResetDate } from "../../../../shared/allowanceGuardrails";
import { formatAiCredits } from "../../../../shared/agentRoiSummary";
import { formatCompactMrr } from "../../../../shared/memberRevenueLedger";
import {
  MEMBER_COACH_REASONS,
  type MemberCoachReason,
  type MemberCoachSettingsView,
} from "../../../../shared/communityMemberCoachTypes";
import {
  getCloudMemberCoachSettings,
  setCloudMemberCoachSettings,
  startFounderUsageBoostCheckout,
} from "../../../../shared/cloudCommunityMemberCoachGateway";
import {
  FOUNDER_USAGE_BOOST_CAP_PRESETS_CENTS,
  FOUNDER_USAGE_BOOST_FIRST_CYCLE_MAX_CENTS,
  FOUNDER_USAGE_BOOST_PRICE_CENTS,
  buildBoostCheckoutReturnUrls,
  consumeBoostCheckoutReturnStatus,
  formatBoostCheckoutErrorMessage,
} from "../../../../shared/founderUsageBoosts";
import type { FounderPlanTier } from "../../../../shared/founderPlan";
import { SettingsButton, SettingsGroup, SettingsRow, SettingsSelect, SettingsSwitch } from "./SettingsRows";

// Routine check-in reasons sent automatically when the founder picks
// "Send routine check-ins automatically". Under "Review on Home first",
// routine check-ins wait on Home while private member commitment follow-ups
// stay private and automatic so members' private goals are never exposed.
const ROUTINE_AUTO_REASONS: MemberCoachReason[] = [...MEMBER_COACH_REASONS];
const REVIEW_FIRST_AUTO_REASONS: MemberCoachReason[] = ["commitment_followup"];

export type MemberCheckInPosture = "review" | "auto";

export function deriveMemberCheckInPosture(
  autoReasons: readonly MemberCoachReason[],
): MemberCheckInPosture {
  const nonPrivateAuto = autoReasons.filter((reason) => reason !== "commitment_followup");
  return nonPrivateAuto.length > 0 ? "auto" : "review";
}

export function CommunityWeeklyDigestGroup(props: {
  communityId: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}) {
  const [settings, setSettings] = useState<MemberCoachSettingsView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSettings(null);
    setError(null);
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        const loaded = session
          ? await getCloudMemberCoachSettings({ session, communityId: props.communityId })
          : null;
        if (!cancelled) setSettings(loaded);
      } catch {
        if (!cancelled) setError("Couldn't load weekly digest setting.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communityId]);

  const weeklyDigestEnabled = settings ? settings.weekly_digest_enabled : true;

  const toggleDigest = async (checked: boolean) => {
    if (saving || !settings) return;
    setSaving(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      setSettings(
        await setCloudMemberCoachSettings({
          session,
          communityId: props.communityId,
          enabled: settings.enabled,
          autoReasons: settings.auto_reasons,
          autoReplyEnabled: Boolean(settings.auto_reply_enabled),
          threadFollowupEnabled: settings.thread_followup_enabled,
          weeklyDigestEnabled: checked,
        }),
      );
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsGroup label="Community emails">
      <SettingsRow
        label="Weekly community digest"
        help={
          error ? (
            <span className="settings-v1-error" role="alert">{error}</span>
          ) : weeklyDigestEnabled ? (
            "Sends a weekly highlights email (new posts, lessons, and activity) so quiet members stay in the loop and return. Quiet weeks are skipped automatically. Free — uses 0 AI credits."
          ) : (
            "Weekly community digest emails are paused for this community."
          )
        }
      >
        <SettingsSwitch
          label="Weekly community digest"
          checked={weeklyDigestEnabled}
          disabled={!settings || saving}
          onChange={(checked) => void toggleDigest(checked)}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}

export function CommunityMemberCoachSettingsSection(props: {
  communityId: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  planTier?: FounderPlanTier | null;
  isUpgradingPlan?: boolean;
  onUpgradeToChiefOfStaff?: () => void;
}) {
  const [settings, setSettings] = useState<MemberCoachSettingsView | null>(null);
  const [saving, setSaving] = useState(false);
  const [buyingBoost, setBuyingBoost] = useState(false);
  const [boostNotice, setBoostNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    setSettings(null);
    setError(null);
    const returnState = consumeBoostCheckoutReturnStatus(window.location.href);
    if (returnState.cleanedRelativeUrl) {
      try {
        window.history.replaceState(window.history.state, "", returnState.cleanedRelativeUrl);
      } catch {
        // Ignore history restrictions.
      }
    }
    if (returnState.status === "success") {
      setBoostNotice("Boost payment received — updating your credits as soon as Stripe confirms it.");
    } else {
      setBoostNotice(null);
    }

    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        const loaded = session ? await getCloudMemberCoachSettings({ session, communityId: props.communityId }) : null;
        if (cancelled) return;
        setSettings(loaded);

        if (returnState.status === "success" && session) {
          const loadedBoostMicros = loaded?.impact?.paid_boost_micros ?? 0;
          if (
            returnState.previousPaidBoostMicros !== null &&
            loadedBoostMicros > returnState.previousPaidBoostMicros
          ) {
            setBoostNotice("Boost applied — your extra +20,000 AI credits are live for this billing cycle.");
            return;
          }
          const baselineBoostMicros = returnState.previousPaidBoostMicros ?? loadedBoostMicros;
          let applied = false;
          const scheduleRefresh = (delayMs: number) => {
            const id = window.setTimeout(() => {
              if (cancelled || applied) return;
              void getCloudMemberCoachSettings({ session, communityId: props.communityId })
                .then((refreshed) => {
                  if (cancelled) return;
                  setSettings(refreshed);
                  if ((refreshed?.impact?.paid_boost_micros ?? 0) > baselineBoostMicros) {
                    applied = true;
                    setBoostNotice("Boost applied — your extra +20,000 AI credits are live for this billing cycle.");
                  }
                })
                .catch(() => {});
            }, delayMs);
            timers.push(id);
          };
          scheduleRefresh(2_500);
          scheduleRefresh(6_000);
        }
      } catch {
        if (!cancelled) setError("Couldn't load guide credit & automation settings.");
      }
    })();
    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
    };
  }, [props.communityId, props.planTier]);

  const save = async (next: {
    autoReasons: MemberCoachReason[];
    autoReplyEnabled: boolean;
    usageBoostCapCents?: number;
  }) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      setSettings(
        await setCloudMemberCoachSettings({
          session,
          communityId: props.communityId,
          // Always on for Chief of Staff; active-thread follow-ups always on.
          enabled: true,
          autoReasons: next.autoReasons,
          autoReplyEnabled: next.autoReplyEnabled,
          threadFollowupEnabled: true,
          weeklyDigestEnabled: settings ? settings.weekly_digest_enabled : true,
          ...(next.usageBoostCapCents !== undefined
            ? { usageBoostCapCents: next.usageBoostCapCents }
            : {}),
        }),
      );
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleBuyBoost = async () => {
    if (buyingBoost || saving) return;
    setBuyingBoost(true);
    setError(null);
    try {
      const session = await props.ensureSession(props.session);
      if (!session) throw new Error("not_signed_in");
      const { successUrl, cancelUrl } = buildBoostCheckoutReturnUrls(
        window.location.href,
        settings?.impact?.paid_boost_micros ?? 0,
      );
      const result = await startFounderUsageBoostCheckout({
        session,
        communityId: props.communityId,
        successUrl,
        cancelUrl,
      });
      if (result?.checkout_url) {
        window.location.assign(result.checkout_url);
      }
    } catch (err) {
      setError(formatBoostCheckoutErrorMessage(err));
      setBuyingBoost(false);
    }
  };

  const autoReasons = settings?.auto_reasons ?? REVIEW_FIRST_AUTO_REASONS;
  const checkInPosture: MemberCheckInPosture = deriveMemberCheckInPosture(autoReasons);
  const autoReplyEnabled = Boolean(settings?.auto_reply_enabled);
  const statusNote = settings && settings.sent_this_week > 0
    ? ` ${settings.sent_this_week} sent this week.`
    : "";
  const impact = settings?.impact;
  const effectivePlanTier: FounderPlanTier | null =
    props.planTier ?? impact?.plan_tier ?? null;
  const isGuideTier = effectivePlanTier === "guide";
  const includedLabel = formatAiCredits(impact?.included_allowance_micros ?? impact?.allowance_micros ?? 20_000_000);
  const resetLabel = formatAllowanceResetDate(impact?.cycle_end_at);
  const paidBoostMicros = impact?.paid_boost_micros ?? 0;
  const includedMicros = impact?.included_allowance_micros ?? impact?.allowance_micros ?? 0;
  const usageBoostCapCents = impact?.usage_boost_cap_cents ?? 0;
  const firstCycleCapActive = Boolean(impact?.first_cycle_cap_active);
  const allowanceBreakdown =
    paidBoostMicros > 0
      ? ` (${formatAiCredits(includedMicros, { unit: false })} included + ${formatAiCredits(paidBoostMicros, { unit: false })} boosts)`
      : "";
  const spendSummary = impact
    ? isGuideTier
      ? `${formatAiCredits(impact.total_micros, { unit: false })}${impact.spend_truncated ? "+" : ""} of ${formatAiCredits(impact.allowance_micros)} used (${impact.percent_used}%)${resetLabel ? ` · Resets ${resetLabel}` : ""}.`
      : `${formatAiCredits(impact.total_micros, { unit: false })}${impact.spend_truncated ? "+" : ""} of ${formatAiCredits(impact.allowance_micros)}${allowanceBreakdown} used (${impact.percent_used}%)${resetLabel ? ` · Resets ${resetLabel}` : ""} · Live chats ${formatAiCredits(impact.live_chat_micros, { unit: false })} · Check-ins ${formatAiCredits(impact.proactive_micros, { unit: false })} · Briefs ${formatAiCredits(impact.brief_micros, { unit: false })}.`
    : null;
  const reserveNote = !isGuideTier && impact?.background_ai_paused
    ? "Background check-ins and reply drafts are paused at 90% to reserve remaining credits for live chats, @mentions, and your Morning Brief."
    : null;
  const savedMembers90d = !isGuideTier && impact ? Number(impact.verified_saved_members_90d ?? 0) : 0;
  const savedMrrLabel =
    savedMembers90d > 0 && impact && !impact.verified_saved_mixed_currency
      ? formatCompactMrr(
          Number(impact.verified_saved_mrr_base_units_90d ?? 0),
          impact.verified_saved_currency,
          impact.verified_saved_currency_decimals ?? 2,
        )
      : null;
  const savedRevenueSummary =
    savedMembers90d > 0
      ? `${savedMembers90d} paying ${savedMembers90d === 1 ? "member" : "members"} rescued and renewed${savedMrrLabel ? ` (${savedMrrLabel} verified saved in the last 90 days)` : " in the last 90 days"}.`
      : null;
  const winBackSummary = !isGuideTier && impact
    ? [
        impact.contacted_30d > 0
          ? impact.reengagement_truncated
            ? `${impact.reengaged_30d} of ${impact.contacted_30d} sampled members checked in came back in the last 30 days.`
            : `${impact.reengaged_30d} of ${impact.contacted_30d} members checked in came back in the last 30 days.`
          : null,
        savedRevenueSummary,
      ]
        .filter(Boolean)
        .join(" ")
    : null;
  const fillTone =
    (impact?.percent_used ?? 0) >= 100
      ? " is-full"
      : (impact?.percent_used ?? 0) >= 80
        ? " is-warn"
        : "";

  // On Guide tier, show only the monthly credits meter (no duplicate upgrade prompt).
  if (isGuideTier && (!impact || !spendSummary)) {
    return null;
  }

  return (
    <SettingsGroup label={isGuideTier ? "Monthly AI credits" : "Chief of Staff & credits"}>
      {impact && spendSummary ? (
        <SettingsRow
          label={isGuideTier ? "Credits used this cycle" : "Monthly AI credits & impact"}
          help={
            <div className="guide-allowance-meter">
              <div
                className="guide-allowance-track"
                role="progressbar"
                aria-label="Monthly AI credits used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={impact.percent_used}
              >
                <div
                  className={`guide-allowance-fill${fillTone}`}
                  style={{ width: `${Math.min(100, Math.max(0, impact.percent_used))}%` }}
                />
              </div>
              <div className="guide-allowance-meta">
                {boostNotice ? <strong>{boostNotice} </strong> : null}
                {spendSummary} {reserveNote ? `${reserveNote} ` : ""}{winBackSummary ?? ""}
              </div>
            </div>
          }
        >
          <span className="settings-v1-value">{impact.percent_used}%</span>
        </SettingsRow>
      ) : null}
      {!isGuideTier && impact ? (
        <SettingsRow
          label="Extra credit safety cap"
          htmlFor="usage-boost-cap"
          help={
            usageBoostCapCents <= 0
              ? `Paused at your ${includedLabel}/month included limit — zero extra charges.`
              : firstCycleCapActive && usageBoostCapCents > FOUNDER_USAGE_BOOST_FIRST_CYCLE_MAX_CENTS
                ? `Allows prepaid boosts ($30 for +20,000 AI credits) up to $${usageBoostCapCents / 100}/month after your first renewal (capped at $${FOUNDER_USAGE_BOOST_FIRST_CYCLE_MAX_CENTS / 100} during your first billing cycle).`
                : `Allows prepaid boosts ($30 for +20,000 AI credits) up to $${usageBoostCapCents / 100}/month. Extra boosts expire at billing cycle reset; nothing is charged automatically without your payment.`
          }
        >
          <SettingsSelect
            id="usage-boost-cap"
            value={usageBoostCapCents}
            disabled={!settings || saving}
            onChange={(event) =>
              void save({
                autoReasons,
                autoReplyEnabled,
                usageBoostCapCents: Number(event.target.value),
              })
            }
          >
            {FOUNDER_USAGE_BOOST_CAP_PRESETS_CENTS.map((capCents) => {
              const boosts = Math.floor(capCents / FOUNDER_USAGE_BOOST_PRICE_CENTS);
              const label =
                capCents === 0
                  ? `Paused at ${includedLabel} (default)`
                  : `$${capCents / 100}/mo (${boosts} ${boosts === 1 ? "boost" : "boosts"})`;
              return (
                <option key={capCents} value={capCents}>
                  {label}
                </option>
              );
            })}
          </SettingsSelect>
        </SettingsRow>
      ) : null}
      {!isGuideTier && impact && usageBoostCapCents > 0 && impact.can_buy_usage_boost ? (
        <SettingsRow
          label="Add extra AI credits"
          help={`Prepaid $30 boost adds +20,000 AI credits for this billing cycle (${impact.usage_boost_remaining_this_cycle ?? 0} remaining under your safety cap).`}
        >
          <SettingsButton
            variant="primary"
            disabled={buyingBoost || saving}
            onClick={() => void handleBuyBoost()}
          >
            {buyingBoost ? "Opening checkout…" : "Add 20,000 credits ($30)"}
          </SettingsButton>
        </SettingsRow>
      ) : null}
      {!isGuideTier ? (
        <>
          <SettingsRow
            label="Member check-ins"
            htmlFor="member-checkin-posture"
            help={
              error ? (
                <span className="settings-v1-error" role="alert">{error}</span>
              ) : checkInPosture === "auto" ? (
                `Always on — sends Day-0 welcomes, quiet newcomer check-ins, course nudges, Board coaching, and event nudges automatically during daytime hours (max 2 per member per week, never during active chats).${statusNote}`
              ) : (
                `Always on — prepares drafts on Home for your one-click OK before messaging members. Private member goal follow-ups stay private and automatic.${statusNote}`
              )
            }
          >
            <SettingsSelect
              id="member-checkin-posture"
              value={checkInPosture}
              disabled={!settings || saving}
              onChange={(event) => {
                const nextPosture = event.target.value as MemberCheckInPosture;
                void save({
                  autoReasons: nextPosture === "auto" ? ROUTINE_AUTO_REASONS : REVIEW_FIRST_AUTO_REASONS,
                  autoReplyEnabled,
                });
              }}
            >
              <option value="review">Review on Home first</option>
              <option value="auto">Send routine check-ins automatically</option>
            </SettingsSelect>
          </SettingsRow>
          <SettingsRow
            label="Auto-reply to unanswered questions"
            help={
              autoReplyEnabled
                ? "Cited replies from lessons and community or pod notes post automatically during daytime hours (up to 3 per day community-wide, 1 per pod)."
                : "Drafts wait on Home until you post them. Turn on to post cited replies automatically during daytime hours."
            }
          >
            <SettingsSwitch
              label="Auto-reply to unanswered questions"
              checked={autoReplyEnabled}
              disabled={!settings || saving}
              onChange={(checked) =>
                void save({ autoReasons, autoReplyEnabled: checked })
              }
            />
          </SettingsRow>
        </>
      ) : null}
    </SettingsGroup>
  );
}
