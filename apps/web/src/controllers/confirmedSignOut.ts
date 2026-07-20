import type { AuthSessionLogoutResult } from "../auth";

export async function completeConfirmedSignOut(params: {
  confirmRemoteLogout: () => Promise<AuthSessionLogoutResult>;
  beforeLocalClear?: () => void | Promise<void>;
  clearLocalSession: () => void | Promise<void>;
  afterLocalClear?: () => void | Promise<void>;
}): Promise<AuthSessionLogoutResult> {
  let result: AuthSessionLogoutResult;
  try {
    result = await params.confirmRemoteLogout();
  } catch {
    return { status: "transient_failure", reason: "auth_logout_unavailable" };
  }
  if (result.status !== "signed_out") return result;

  await params.beforeLocalClear?.();
  await params.clearLocalSession();
  await params.afterLocalClear?.();
  return result;
}
