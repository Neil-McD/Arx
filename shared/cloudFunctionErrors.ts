import {
  formatCloudFunctionErrorMessageCore,
  readCloudFunctionErrorCore,
  shouldFallbackFromChatgptErrorToPlatformCore,
  shouldFallbackFromPlatformErrorToPublicCore,
} from "./cloudFunctionErrorCore";

export const formatCloudFunctionErrorMessage = formatCloudFunctionErrorMessageCore;
export const readCloudFunctionError = readCloudFunctionErrorCore;
export {
  shouldFallbackFromChatgptErrorToPlatformCore as shouldFallbackFromChatgptErrorToPlatform,
  shouldFallbackFromPlatformErrorToPublicCore as shouldFallbackFromPlatformErrorToPublic,
};
