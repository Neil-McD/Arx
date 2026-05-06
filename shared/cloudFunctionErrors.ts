import {
  classifyCloudFunctionErrorCategoryCore,
  formatCloudFunctionErrorMessageCore,
  readCloudFunctionErrorCore,
  shouldFallbackFromPlatformErrorToPublicCore,
} from "./cloudFunctionErrorCore";

export const classifyCloudFunctionErrorCategory = classifyCloudFunctionErrorCategoryCore;
export const formatCloudFunctionErrorMessage = formatCloudFunctionErrorMessageCore;
export const readCloudFunctionError = readCloudFunctionErrorCore;
export {
  shouldFallbackFromPlatformErrorToPublicCore as shouldFallbackFromPlatformErrorToPublic,
};
