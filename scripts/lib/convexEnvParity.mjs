// Settings parity for a production release: every backend setting the code
// reads that staging has must also exist in production, unless it is named
// below as staging-only with its reason. Names only: a value is never kept,
// compared or printed. Settings no code reads are reported, not failed: the
// release says which to remove (production deletions need the owner's OK).

export const STAGING_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";

export const STAGING_ONLY_SETTINGS = Object.freeze({
  POLYNET_ALLOW_SEED: "seeds staging fixtures; must never be set in production",
  POLYNET_SITES_HOST_SUFFIX: "staging site addresses (<slug>-staging); production has none",
  POLYNET_SITES_DOMAIN: "dark launch: production sets it at the sites switch (POL-50); delete this entry then",
  ARX_AUTH_MIGRATION_AUDIT_SECRET: "operator audit route, run on staging only",
  VITE_PUBLIC_APP_URL: "older alias of ARX_PUBLIC_APP_URL, which production sets",
});

// Settings production must never have.
export const FORBIDDEN_IN_PRODUCTION = Object.freeze(["POLYNET_ALLOW_SEED"]);

// `npx convex env list` prints NAME=value lines; keep the names, drop the rest.
export function settingNames(listOutput) {
  return new Set(
    String(listOutput ?? "")
      .split("\n")
      .map((line) => line.split("=")[0].trim())
      .filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name)),
  );
}

// Every ALL_CAPS name with an underscore the code mentions: what it may read.
export function codeSettingNames(sources) {
  const names = new Set();
  for (const text of sources) {
    for (const match of String(text).matchAll(/\b([A-Z][A-Z0-9]*_[A-Z0-9_]+)\b/g)) names.add(match[1]);
  }
  return names;
}

export function compareSettings({ staging, production, codeNames, stagingOnly = STAGING_ONLY_SETTINGS }) {
  const missing = [...staging]
    .filter((name) => codeNames.has(name) && !production.has(name) && !Object.hasOwn(stagingOnly, name))
    .sort();
  const forbidden = FORBIDDEN_IN_PRODUCTION.filter((name) => production.has(name));
  const unused = [...new Set([...staging, ...production])].filter((name) => !codeNames.has(name)).sort();
  return { missing, forbidden, unused };
}
