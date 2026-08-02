import { useMemo } from "react";

import type { AuthSession } from "../auth";
import { resolveUserAccessPolicy } from "../../../../shared/capabilities";

type UseWebAccountPlanControllerParams = {
  session: AuthSession | null;
};

export function useWebAccountPlanController(
  params: UseWebAccountPlanControllerParams,
) {
  const userAccessPolicy = useMemo(
    () =>
      resolveUserAccessPolicy({
        surface: "web",
        authState: params.session ? "authenticated" : "anonymous",
      }),
    [params.session],
  );

  return {
    userAccessPolicy,
  };
}
