import type {
  CommunityLaunchSetupStatus,
  CommunityLaunchSetupStep,
} from "../../../../shared/communityLaunchSetup";

export type CommunityLaunchKnowledgeProvider = "google_drive" | "github";

export type WebCommunityLaunchSetupLifecycleModel = {
  isOpen: boolean;
  mode: "setup" | "create";
  status: CommunityLaunchSetupStatus | null;
  initialStep: CommunityLaunchSetupStep | null;
  knowledgeIntegrationReloadKey: number;
  knowledgeAutoOpenProvider: CommunityLaunchKnowledgeProvider | null;
};
