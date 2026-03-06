import {
  beginCloudOAuthSignInUrl,
  decodeJwtPayload,
  ensureCloudSessionForAuthenticatedSend,
  ensureCloudSessionForRequest,
  exchangeCloudPkceCodeForSession,
  fetchCloudUser,
  fetchWithCloudAuthShared,
  fetchWithCloudPublicShared,
  getCloudAnonKey,
  getCloudAuthUid,
  getCloudUrl,
  getOAuthRedirectUrl,
  isCloudJwtExpired,
  isLikelyJwt,
  logoutCloudSessionRemote,
  readCloudError,
  refreshCloudSession,
  refreshCloudSessionWithLock,
  sendCloudMagicLinkOtp,
  transcribeCloudVoice,
  type CloudSession,
  type CloudSessionRef,
  type CloudSessionRefreshInFlightRef,
  type CloudUser,
} from "./cloudAuthCore";

export type AuthUser = CloudUser;
export type AuthSession = CloudSession;
export type AuthSessionRef = CloudSessionRef;
export type AuthSessionRefreshInFlightRef = CloudSessionRefreshInFlightRef;

export {
  beginCloudOAuthSignInUrl as beginOAuthSignInUrl,
  decodeJwtPayload as decodeAuthJwtPayload,
  ensureCloudSessionForAuthenticatedSend as ensureAuthSessionForAuthenticatedSend,
  ensureCloudSessionForRequest as ensureAuthSessionForRequest,
  exchangeCloudPkceCodeForSession as exchangeOAuthPkceCodeForSession,
  fetchCloudUser as fetchAuthUser,
  fetchWithCloudAuthShared as fetchWithAuthShared,
  fetchWithCloudPublicShared as fetchWithPublicShared,
  getCloudAnonKey as getAuthPublicKey,
  getCloudAuthUid as getAuthUid,
  getCloudUrl as getAuthUrl,
  getOAuthRedirectUrl as getAuthRedirectUrl,
  isCloudJwtExpired as isAuthJwtExpired,
  isLikelyJwt as isLikelyAuthJwt,
  logoutCloudSessionRemote as logoutAuthSessionRemote,
  readCloudError as readAuthError,
  refreshCloudSession as refreshAuthSession,
  refreshCloudSessionWithLock as refreshAuthSessionWithLock,
  sendCloudMagicLinkOtp as sendAuthMagicLinkOtp,
  transcribeCloudVoice as transcribeVoice,
};
