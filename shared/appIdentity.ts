export function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}
