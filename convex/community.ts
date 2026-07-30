import {
  saveCommunityLaunchProfile as saveCommunityLaunchProfileImpl,
} from "./communityLifecycle";
import {
  getCommunityLaunchSetupStatus as getCommunityLaunchSetupStatusImpl,
} from "./communityLaunchSetup";

// Rolling-deployment aliases for the production web build at dbec82f.
// Canonical ownership remains in the domain modules imported above.
export const saveCommunityLaunchProfile = saveCommunityLaunchProfileImpl;
export const getCommunityLaunchSetupStatus = getCommunityLaunchSetupStatusImpl;
