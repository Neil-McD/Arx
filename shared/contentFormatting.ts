

export function formatRelativeTimeFromIso(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (deltaSeconds < 45) return "just now";
  if (deltaSeconds < 90) return "1m ago";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function formatChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (messageDate.getTime() === today.getTime()) return timeStr;
  if (messageDate.getTime() === yesterday.getTime()) return `Yesterday ${timeStr}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${timeStr}`;
}

export function formatCount(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMoneyBaseUnits(
  value: number | null,
  currency: string | null,
  currencyDecimals: number | null,
): string {
  if (value == null || currency == null || currencyDecimals == null) return "—";
  const major = value / Math.pow(10, currencyDecimals);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: currencyDecimals,
    }).format(major);
  } catch {
    return major.toFixed(Math.min(Math.max(currencyDecimals, 0), 6));
  }
}
