import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { RuntimeClient } from "../../runtime/arp/client";

type PendingToolApprovalLike = {
  tool_call_id: string;
};

type UseDesktopToolApprovalActionsArgs<PendingApprovalT extends PendingToolApprovalLike> = {
  runtimeClient: RuntimeClient;
  setMemoryToast: Dispatch<SetStateAction<string | null>>;
  pendingToolApproval: PendingApprovalT | null;
  setPendingToolApproval: Dispatch<SetStateAction<PendingApprovalT | null>>;
  setIsToolApprovalSubmitting: Dispatch<SetStateAction<boolean>>;
  onApprovalResolved: () => void;
};

export function useDesktopToolApprovalActions<PendingApprovalT extends PendingToolApprovalLike>(
  args: UseDesktopToolApprovalActionsArgs<PendingApprovalT>,
) {
  const resolvePendingToolApproval = useCallback(
    async (
      approved: boolean,
      opts?: { allow_write_edit_for_session?: boolean },
    ) => {
      const pending = args.pendingToolApproval;
      if (!pending) return;
      args.setIsToolApprovalSubmitting(true);
      try {
        await args.runtimeClient.decideToolCall(pending.tool_call_id, {
          approved,
          allow_write_edit_for_session: opts?.allow_write_edit_for_session ?? false,
        });
        args.setPendingToolApproval(null);
        args.onApprovalResolved();
      } catch (error) {
        console.error("Failed to resolve tool approval:", error);
        args.setMemoryToast("Failed to send tool approval decision.");
      } finally {
        args.setIsToolApprovalSubmitting(false);
      }
    },
    [args],
  );

  return {
    resolvePendingToolApproval,
  };
}
