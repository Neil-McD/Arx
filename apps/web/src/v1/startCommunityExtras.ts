// Start a community, step 2: what is typed there besides the one-liner (the
// about text, whether to list it, a price) is saved right after the community
// is created. It waits here, in this tab, between the two.

export type StartCommunityExtras = { about: string; listed: boolean; monthlyCents: number | null };

const key = (slug: string) => `polynet_start_extras:${slug.trim().toLowerCase()}`;

export function stashStartExtras(slug: string, extras: StartCommunityExtras): void {
  try { window.sessionStorage.setItem(key(slug), JSON.stringify(extras)); } catch { /* saved as typed in Settings instead */ }
}

// Read once: taking it clears it, so a refresh never saves it twice.
export function takeStartExtras(slug: string): StartCommunityExtras | null {
  try {
    const stored = window.sessionStorage.getItem(key(slug));
    if (!stored) return null;
    window.sessionStorage.removeItem(key(slug));
    const parsed = JSON.parse(stored) as Partial<StartCommunityExtras> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const cents = Number(parsed.monthlyCents);
    return {
      about: String(parsed.about ?? "").trim(),
      listed: parsed.listed === true,
      monthlyCents: Number.isSafeInteger(cents) && cents > 0 ? cents : null,
    };
  } catch { return null; }
}

// "29" or "29.50" a month, in cents; null when it is not a price.
export function monthlyCentsFromText(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, "");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 ? cents : null;
}

export function startExtrasNeedSaving(extras: StartCommunityExtras | null): extras is StartCommunityExtras {
  return Boolean(extras && (extras.about || extras.listed || extras.monthlyCents));
}
