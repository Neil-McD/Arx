import { captureIntegrationCallback } from "../../../shared/integrationCallback";
if (typeof window !== "undefined") {
  try { captureIntegrationCallback(window.location, window.history, window.sessionStorage); }
  catch { /* Storage unavailable: fail closed; no callback can activate. */ }
}
