export function formatUsdCents(value: number | string | null | undefined): string {
  const cents = Number(value ?? 0);
  const safeCents = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    safeCents / 100,
  );
}

export function toEpochSeconds(input: string): number {
  const ms = Date.parse(input);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}
