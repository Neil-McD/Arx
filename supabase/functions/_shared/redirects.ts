import { getEnv } from "./env.ts";

function parseAllowedOrigins(): string[] {
  const raw = getEnv("ARX_ALLOWED_APP_ORIGINS");
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const out: string[] = [];
  for (const part of parts) {
    let url: URL;
    try {
      url = new URL(part);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    out.push(url.origin);
  }
  return Array.from(new Set(out));
}

export function requireAllowedRedirectUrl(raw: string, field: string): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error(`${field} is required`);

  const allowed = parseAllowedOrigins();
  if (allowed.length === 0) throw new Error("ARX_ALLOWED_APP_ORIGINS is not configured");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${field} must be http(s)`);
  if (parsed.username || parsed.password) throw new Error(`${field} must not include credentials`);
  if (!allowed.includes(parsed.origin)) throw new Error(`${field} origin is not allowed`);

  return parsed.toString();
}

