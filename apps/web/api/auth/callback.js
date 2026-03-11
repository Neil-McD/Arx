import { handleAuthCallback } from "../_lib/bridge.js";

export default async function handler(req, res) {
  return await handleAuthCallback(req, res);
}
