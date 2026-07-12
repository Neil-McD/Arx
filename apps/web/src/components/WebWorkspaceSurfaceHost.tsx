import {
  WebWorkspaceHost,
  type WebWorkspaceHostProps,
} from "./WebWorkspaceHost";

type WebWorkspaceSurfaceHostProps = {
  workspaceHostProps: WebWorkspaceHostProps;
};

export function WebWorkspaceSurfaceHost(props: WebWorkspaceSurfaceHostProps) {
  return <WebWorkspaceHost {...props.workspaceHostProps} />;
}
