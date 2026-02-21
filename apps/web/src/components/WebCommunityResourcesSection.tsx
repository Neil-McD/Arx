import {
  type CommunityResourcesActions,
  type CommunityResourcesCapabilities,
  type CommunityResourcesState,
} from "../../../../src/components/communityResourcesContracts";
import { CommunityResourcesPanel } from "../../../../src/components/CommunityResourcesPanel";

type WebCommunityResourcesSectionProps = {
  capabilities: CommunityResourcesCapabilities;
  state: CommunityResourcesState;
  actions: CommunityResourcesActions;
};

export function WebCommunityResourcesSection(props: WebCommunityResourcesSectionProps) {
  const { capabilities, state, actions } = props;
  return (
    <CommunityResourcesPanel
      capabilities={capabilities}
      state={state}
      actions={actions}
    />
  );
}
