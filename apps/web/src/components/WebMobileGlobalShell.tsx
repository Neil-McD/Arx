import type { ReactNode } from "react";
import { WebCommunityRail } from "./WebCommunityRail";
import { isDesignV1Active } from "../../../../shared/designSystem";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileGlobalShellProps = {
  communityShell: WebCommunityShellProps;
  children: ReactNode;
  isCommunityHome?: boolean;
  // Design v1: no strip of communities on the community home or Settings.
  hideRail?: boolean;
  label: string;
};

export function WebMobileGlobalShell({
  communityShell,
  children,
  isCommunityHome = false,
  hideRail = false,
  label,
}: WebMobileGlobalShellProps) {
  // Design v1: the community home switches community from its banner, like
  // the desktop column, so the old strip of communities goes there.
  const showRail = !(hideRail || (isDesignV1Active() && isCommunityHome));
  return (
    <div
      className={`mobile-global-shell${showRail ? " has-community-rail" : ""}${
        isCommunityHome ? " mobile-community-home is-community-home" : ""
      }`}
    >
      {showRail ? (
        <WebCommunityRail
          communityShell={communityShell}
          presentation="mobile-shell"
        />
      ) : null}
      <section
        className="mobile-global-shell-surface"
        aria-label={label}
        aria-hidden={children === null ? true : undefined}
      >
        {children}
      </section>
    </div>
  );
}
