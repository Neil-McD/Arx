import {
  formatCloudFunctionErrorMessageCore,
  readCloudFunctionErrorCore,
  shouldFallbackFromPlatformErrorToPublicCore,
} from "./cloudFunctionErrorCore";

export const formatCloudFunctionErrorMessage = formatCloudFunctionErrorMessageCore;
export const readCloudFunctionError = readCloudFunctionErrorCore;
export {
  shouldFallbackFromPlatformErrorToPublicCore as shouldFallbackFromPlatformErrorToPublic,
};
