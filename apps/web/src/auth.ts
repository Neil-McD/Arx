export {
  decodeAuthJwtPayload,
  ensureAuthSessionForAuthenticatedSendResult,
  ensureAuthSessionForRequest,
  ensureAuthSessionForRequestResult,
  fetchWithAuthShared,
  fetchWithPublicShared,
  getAuthPublicKey,
  getAuthUid,
  getAuthUrl,
  isAuthJwtExpired,
  isLikelyAuthJwt,
  readAuthError,
  refreshAuthSessionWithLockResult,
  sendAuthMagicLinkOtp,
} from "../../../shared/authCore";
export type {
  AuthSession,
  AuthSessionEnsureResult,
  AuthSessionRefreshResult,
  AuthSessionRefreshResultInFlightRef,
  AuthUser,
} from "../../../shared/authCore";
export {
  beginBrowserSignedOutState,
  clearAuthFlowPending,
  clearAuthSignedOutIntentMarker,
  hasRecentAuthFlowPending,
  markAuthFlowPending,
  AUTH_SIGNED_OUT_INTENT_KEY,
  AUTH_SIGNED_OUT_TAB_INTENT_KEY,
} from "./authBrowserMarkers";
