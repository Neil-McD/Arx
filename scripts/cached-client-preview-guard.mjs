// Temporary acceptance branch only. Never merge this configuration.
const expected = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "codex/cached-client-acceptance-20260916",
  VITE_CONVEX_URL: "https://quick-porcupine-949.convex.cloud",
  VITE_CONVEX_SITE_URL: "https://quick-porcupine-949.convex.site",
};
for (const [key, value] of Object.entries(expected)) {
  if (process.env[key] !== value) throw new Error(`Acceptance preview misconfigured: ${key}`);
}
if (!String(process.env.VERCEL_URL ?? "").startsWith("polynet-staging-")) throw new Error("Wrong preview project");
if (!process.env.ARX_AUTH_BRIDGE_SECRET) throw new Error("Missing staging auth bridge");
console.log("Production-source preview pinned to staging backend; auth bridge present.");
