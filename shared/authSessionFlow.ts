import {
  beginGoogleCloudSignIn,
  CLOUD_SESSION_EXPIRED_MESSAGE,
  expireCloudSessionFailClosed,
  revokeCloudSessionRemote,
  type BeginGoogleCloudSignInResult,
} from "./cloudAuthFlow";

export type BeginGoogleSignInResult = BeginGoogleCloudSignInResult;

export const AUTH_SESSION_EXPIRED_MESSAGE = CLOUD_SESSION_EXPIRED_MESSAGE;

export {
  beginGoogleCloudSignIn as beginGoogleSignIn,
  expireCloudSessionFailClosed as expireAuthSessionFailClosed,
  revokeCloudSessionRemote as revokeAuthSessionRemote,
};
