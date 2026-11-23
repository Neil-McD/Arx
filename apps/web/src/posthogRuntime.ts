// Slim bundle omits autocapture, session recording, surveys, and external script
// loaders that posthogAnalytics.ts explicitly disables.
export { default as posthog } from "posthog-js/dist/module.slim";
