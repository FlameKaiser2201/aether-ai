export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Parse a text/event-stream body incrementally. Handles CRLF, comments and
 * multi-line data fields without buffering the whole response.
 */
export async function readSSE(
  response: Response,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) throw new Error("Streaming is not available in this browser.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseEvent(raw);
        if (parsed) onEvent(parsed);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) {
      const parsed = parseEvent(buffer);
      if (parsed) onEvent(parsed);
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(raw: string): SSEEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  const text = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { event, data: { text } };
  }
}
