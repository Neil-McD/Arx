// Server-sent events for HTTP actions: a fixed list of events, or a writer
// that streams until its source finishes. Shared by Studio's runtime routes
// and the community front-end agent route.

export type SseEntry = { event: string; data: Record<string, unknown> };
export type SseSource =
  | SseEntry[]
  | ((writer: { send: (entry: SseEntry) => void; close: () => void }) => Promise<void> | void);

function encodeSse(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseResponseWithHeaders(headers: Headers, source: SseSource): Response {
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("Connection", "keep-alive");
  if (Array.isArray(source)) {
    const body = source.map((entry) => encodeSse(entry.event, entry.data)).join("");
    return new Response(body, { status: 200, headers });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const writer = {
        send(entry: SseEntry) {
          if (closed) return;
          controller.enqueue(encoder.encode(encodeSse(entry.event, entry.data)));
        },
        close() {
          if (closed) return;
          closed = true;
          controller.close();
        },
      };
      Promise.resolve(source(writer))
        .then(() => {
          writer.close();
        })
        .catch((error) => {
          const message =
            typeof error === "string"
              ? error
              : error instanceof Error
                ? error.message
                : "Stream failed.";
          writer.send({
            event: "error",
            data: {
              error: message || "Stream failed.",
            },
          });
          writer.close();
        });
    },
  });
  return new Response(body, { status: 200, headers });
}
