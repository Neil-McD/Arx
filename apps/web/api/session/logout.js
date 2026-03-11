import { handleSessionLogout } from "../_lib/bridge.js";

export default async function handler(req, res) {
  return await handleSessionLogout(req, res);
}
