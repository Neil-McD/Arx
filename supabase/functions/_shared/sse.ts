export function encodeSse(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export async function consumeSseEvents(params: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  onData: (data: string) => boolean | void;
}): Promise<void> {
  const decoder = new TextDecoder();
  let lineBuffer = "";
  let dataBuffer = "";

  const flush = (): boolean => {
    const raw = dataBuffer.trim();
    dataBuffer = "";
    if (!raw) return false;
    return Boolean(params.onData(raw));
  };

  while (true) {
    const { value, done } = await params.reader.read();
    if (done) break;
    lineBuffer += decoder.decode(value, { stream: true });
    while (true) {
      const idx = lineBuffer.indexOf("\n");
      if (idx < 0) break;
      let line = lineBuffer.slice(0, idx);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      lineBuffer = lineBuffer.slice(idx + 1);
      if (line === "") {
        if (flush()) return;
        continue;
      }
      if (line.startsWith("data:")) {
        dataBuffer += line.slice(5).trim();
      }
    }
  }
  flush();
}
