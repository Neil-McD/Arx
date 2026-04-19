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
  clearAuthFlowReturned,
  clearAuthSignedOutIntentMarker,
  hasRecentAuthFlowReturned,
  hasRecentAuthFlowPending,
  markAuthFlowPending,
  markAuthFlowReturned,
  AUTH_SIGNED_OUT_INTENT_KEY,
  AUTH_SIGNED_OUT_TAB_INTENT_KEY,
} from "./authBrowserMarkers";
