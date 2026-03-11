import { handleAuthStart } from "../_lib/bridge.js";

export default async function handler(req, res) {
  return await handleAuthStart(req, res);
}
