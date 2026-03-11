import {
  parseCloudOAuthCallbackFromLocation,
  type CloudOAuthParseResult,
} from "./cloudOAuthCallback";

export type AuthOAuthParseResult = CloudOAuthParseResult;

export {
  parseCloudOAuthCallbackFromLocation as parseOAuthCallbackFromLocation,
};
