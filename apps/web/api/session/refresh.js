import { handleSessionRefresh } from "../_lib/bridge.js";

export default async function handler(req, res) {
  return await handleSessionRefresh(req, res);
}
