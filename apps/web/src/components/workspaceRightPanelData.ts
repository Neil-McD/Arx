import type { AuthSessionLike } from "../../../../shared/authSession";
import type { WorkspaceComputerStartResult } from "../../../../shared/workspaceTerminalsGateway";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";
import type { WorkspaceUserDataPanelDataProps } from "./WebWorkspaceUserDataPanel";

export function buildWorkspaceRightPanelUserData(params: {
  workspaceCreditBalance: WorkspaceCreditBalance | null;
  isLoadingWorkspaceCreditBalance: boolean;
  workspaceCreditBalanceError: string | null;
  hasWorkspaceCardOnFile?: boolean | null;
  isStartingWorkspaceComputer: boolean;
  isStoppingWorkspaceComputer: boolean;
  workspaceComputerStartError: string | null;
  session: AuthSessionLike | null;
  activeProjectId: string | null;
  activeProjectName: string | null;
  activeThreadTitle: string | null;
  activeModelLabel: string | null;
  onOpenWorkspaceBilling: () => void;
  onTurnOnComputer: () => Promise<WorkspaceComputerStartResult>;
  onTurnOffComputer: () => Promise<boolean>;
}): WorkspaceUserDataPanelDataProps {
  return params;
}
