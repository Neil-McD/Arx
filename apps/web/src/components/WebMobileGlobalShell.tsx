import type { ReactNode } from "react";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileGlobalShellProps = {
  communityShell: WebCommunityShellProps;
  children: ReactNode;
  isCommunityHome?: boolean;
  hideRail?: boolean;
  label: string;
};

export function WebMobileGlobalShell({
  children,
  isCommunityHome = false,
  label,
}: WebMobileGlobalShellProps) {
  return (
    <div
      className={`mobile-global-shell${
        isCommunityHome ? " mobile-community-home is-community-home" : ""
      }`}
    >
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
