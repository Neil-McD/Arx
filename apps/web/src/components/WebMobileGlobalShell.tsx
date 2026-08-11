import type { ReactNode } from "react";
import { WebCommunityRail } from "./WebCommunityRail";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileGlobalShellProps = {
  communityShell: WebCommunityShellProps;
  children: ReactNode;
  isCommunityHome?: boolean;
  label: string;
};

export function WebMobileGlobalShell({
  communityShell,
  children,
  isCommunityHome = false,
  label,
}: WebMobileGlobalShellProps) {
  return (
    <div
      className={`mobile-global-shell has-community-rail${
        isCommunityHome ? " mobile-community-home is-community-home" : ""
      }`}
    >
      <WebCommunityRail
        communityShell={communityShell}
        presentation="mobile-shell"
      />
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
