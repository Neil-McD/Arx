const BUSINESS_VISITOR_HASH_PREFIX = "polynet_business_visitor_v1:";

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashBusinessVisitorKey(visitorKey: string): Promise<string> {
  const input = `${BUSINESS_VISITOR_HASH_PREFIX}${visitorKey}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}
