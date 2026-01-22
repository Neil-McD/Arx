export function getEnv(key: string): string {
  return (Deno.env.get(key) ?? Deno.env.get(key.toLowerCase()) ?? "").trim();
}

export function requireEnv(key: string): string {
  const value = getEnv(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

