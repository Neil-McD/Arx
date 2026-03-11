import { handleSessionBootstrap } from "../_lib/bridge.js";

export default async function handler(req, res) {
  return await handleSessionBootstrap(req, res);
}
