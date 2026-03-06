import {
  consumeCloudOAuthCallback,
  parseCloudOAuthCallbackFromLocation,
  type CloudOAuthConsumeResult,
  type CloudOAuthParseResult,
} from "./cloudOAuthCallback";

export type AuthOAuthParseResult = CloudOAuthParseResult;
export type AuthOAuthConsumeResult = CloudOAuthConsumeResult;

export {
  consumeCloudOAuthCallback as consumeOAuthCallback,
  parseCloudOAuthCallbackFromLocation as parseOAuthCallbackFromLocation,
};
