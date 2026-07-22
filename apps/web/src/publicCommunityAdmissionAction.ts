import type {
  PublicCommunityJoinErrorKind,
  PublicCommunityJoinResult,
} from "../../../shared/publicCommunityJoin";

export type ReconciledAdmissionStatus =
  | "entered"
  | "pending"
  | "denied"
  | "blocked"
  | "none"
  | "unavailable"
  | "stale";

export type ReconciledAdmission<CommunityAccessT> = {
  status: ReconciledAdmissionStatus;
  access: CommunityAccessT | null;
};

type AdmissionAccess = {
  community_id: string;
};

export async function executePublicCommunityJoinAction<
  CommunityAccessT extends AdmissionAccess,
>(args: {
  communitySlug: string;
  runJoin: () => Promise<PublicCommunityJoinResult>;
  isCurrent: () => boolean;
  reconcile: () => Promise<ReconciledAdmission<CommunityAccessT>>;
  enterCommunity: (communityId: string) => Promise<void>;
  setEntryPolicy: (entryPolicy: "approval" | "paid_subscription") => void;
  navigateAuthResumeToFunnel: () => void;
  setError: (message: string | null) => void;
  onJoinRequestSent?: (params: {
    communityId: string | null;
    communitySlug: string;
  }) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
  classifyError: (error: unknown) => PublicCommunityJoinErrorKind;
}): Promise<void> {
  try {
    const joinResult = await args.runJoin();
    if (!args.isCurrent()) return;

    if (joinResult.outcome === "joined") {
      await args.enterCommunity(joinResult.community_id);
      return;
    }

    const reconciled = await args.reconcile();
    if (!args.isCurrent() || reconciled.status === "stale") return;
    if (reconciled.status === "entered" && reconciled.access?.community_id) {
      await args.enterCommunity(reconciled.access.community_id);
      return;
    }
    if (reconciled.status === "blocked") {
      args.setError(null);
      return;
    }
    if (joinResult.outcome === "paid_plan_required") {
      args.setEntryPolicy("paid_subscription");
      args.navigateAuthResumeToFunnel();
      if (args.isCurrent()) {
        args.setError("This community now requires a paid plan. Select a plan to continue.");
      }
      return;
    }

    args.setEntryPolicy("approval");
    args.navigateAuthResumeToFunnel();
    if (!args.isCurrent()) return;
    if (joinResult.outcome === "approval_pending" && reconciled.status === "pending") {
      args.onJoinRequestSent?.({
        communityId: joinResult.community_id,
        communitySlug: args.communitySlug,
      });
    }
    args.setError(
      reconciled.status === "unavailable"
        ? "Your request was received, but its current status could not be verified. Reload to try again."
        : null,
    );
  } catch (error) {
    if (!args.isCurrent()) return;
    const message = args.getErrorMessage(error, "Failed to join community.");
    const kind = args.classifyError(error);
    const reconciled = await args.reconcile();
    if (!args.isCurrent() || reconciled.status === "stale") return;
    if (reconciled.status === "entered" && reconciled.access?.community_id) {
      await args.enterCommunity(reconciled.access.community_id);
      return;
    }
    if (reconciled.status === "blocked") {
      args.setError(null);
      return;
    }
    if (reconciled.status === "pending" || reconciled.status === "denied") {
      args.setEntryPolicy("approval");
      args.navigateAuthResumeToFunnel();
      if (args.isCurrent()) args.setError(null);
      return;
    }
    if (kind === "paid_plan_required") {
      args.setEntryPolicy("paid_subscription");
      args.navigateAuthResumeToFunnel();
      if (args.isCurrent()) {
        args.setError("This community now requires a paid plan. Select a plan to continue.");
      }
      return;
    }
    args.navigateAuthResumeToFunnel();
    if (args.isCurrent()) args.setError(message);
  }
}

export async function executePublicCommunityCancelAction<
  CommunityAccessT extends AdmissionAccess,
>(args: {
  runCancel: () => Promise<unknown>;
  isCurrent: () => boolean;
  reconcile: () => Promise<ReconciledAdmission<CommunityAccessT>>;
  setError: (message: string | null) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}): Promise<void> {
  try {
    await args.runCancel();
    if (!args.isCurrent()) return;
    const reconciled = await args.reconcile();
    if (!args.isCurrent() || reconciled.status === "stale") return;
    if (reconciled.status === "unavailable") {
      args.setError(
        "The cancellation completed, but its current status could not be verified. Reload to try again.",
      );
      return;
    }
    args.setError(null);
  } catch (error) {
    if (!args.isCurrent()) return;
    const message = args.getErrorMessage(error, "Failed to cancel join request.");
    const reconciled = await args.reconcile();
    if (!args.isCurrent() || reconciled.status === "stale") return;
    if (
      reconciled.status === "none" ||
      reconciled.status === "denied" ||
      reconciled.status === "entered"
    ) {
      args.setError(null);
      return;
    }
    args.setError(message);
  }
}
