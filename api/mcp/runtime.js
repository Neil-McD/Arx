import { proxyConvexRuntimeRequest } from "./_proxy.js";

export default async function handler(req, res) {
  await proxyConvexRuntimeRequest(req, res, "/runtime/mcp");
}
