import { Suspense, lazy } from "react";
import type { WebStandalonePublicRouteViewProps } from "./WebStandalonePublicRouteView";

const WebStandalonePublicRouteView = lazy(() =>
  import("./WebStandalonePublicRouteView").then((module) => ({
    default: module.WebStandalonePublicRouteView,
  })),
);

export function WebStandalonePublicRouteShell(props: WebStandalonePublicRouteViewProps) {
  return (
    <Suspense fallback={null}>
      <WebStandalonePublicRouteView {...props} />
    </Suspense>
  );
}
