import type { ReactNode } from "react";

import "./WebCommunityWorkspaceFrame.css";

type WebCommunityWorkspaceFrameProps = {
  ariaLabel: string;
  children: ReactNode;
};

export function WebCommunityWorkspaceFrame(
  props: WebCommunityWorkspaceFrameProps,
) {
  return (
    <section className="community-workspace-frame" aria-label={props.ariaLabel}>
      <div className="community-workspace-frame-scroll">{props.children}</div>
    </section>
  );
}
