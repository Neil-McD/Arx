// The CLI speaks to Polynet the way any external agent does: the official
// Polynet MCP and its five tools (polynet_list, polynet_read, polynet_search,
// polynet_write, polynet_call), under the signed-in owner's authority. No
// endpoint here is special to the CLI.

export class PolynetToolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createMcpClient({ url, token, fetchImpl = fetch }) {
  let nextId = 1;
  async function rpc(method, params) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    });
    if (res.status === 401) throw new PolynetToolError("unauthorized", "Your sign-in expired. Run the command again to sign in.");
    const text = await res.text();
    // Streamable HTTP may answer as one server-sent event.
    const json = text.trimStart().startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data:"))?.slice(5);
    let body = null;
    try {
      body = JSON.parse(json ?? "");
    } catch {
      throw new PolynetToolError("bad_response", `Polynet answered ${res.status} without JSON.`);
    }
    if (body.error) throw new PolynetToolError("protocol", body.error.message ?? "Polynet refused the request.");
    return body.result;
  }

  return {
    async call(name, input) {
      const result = await rpc("tools/call", { name, arguments: input });
      if (result?.isError) {
        const text = result.structuredContent?.error ?? result.content?.[0]?.text ?? "Polynet refused the call.";
        const [code, ...rest] = String(text).split(": ");
        throw new PolynetToolError(rest.length ? code : "tool_error", rest.length ? rest.join(": ") : text);
      }
      return result?.structuredContent ?? null;
    },
    initialize: () => rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "polynet-cli", version: "0.2.0" } }),
  };
}
