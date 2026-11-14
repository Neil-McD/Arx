// A community's landing page (/c/<slug>) with its own link preview (Nov 13):
// the app's index.html, its title, description and preview image swapped for
// the community's name, one-liner and banner, so a link shared on YouTube,
// X, Slack or iMessage shows the community, not Polynet's generic card. The
// page itself is the same single-page app. Anything that fails serves the
// plain index.html: a preview is never worth a broken page.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

function readEnv(name) {
  return String(process.env?.[name] ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function readCommunity(slug) {
  const convexUrl = readEnv("VITE_CONVEX_URL") || readEnv("VITE_PUBLIC_CONVEX_URL") || readEnv("PUBLIC_CONVEX_URL");
  if (!convexUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${convexUrl.replace(/\/+$/, "")}/api/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "communityLanding:getCommunityLandingPage", args: { communitySlug: slug }, format: "json" }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.status === "success" && payload.value?.ok ? payload.value : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The community's own words and picture in place of Polynet's defaults.
export function withCommunityPreview(html, page, pageUrl) {
  const name = String(page.community?.name ?? "").trim().slice(0, 120);
  if (!name) return html;
  const description = String(page.community?.one_liner ?? page.community?.about ?? "").trim().slice(0, 300)
    || `Join ${name} on Polynet.`;
  const image = httpsUrl(page.community?.banner_url) || httpsUrl(page.community?.avatar_url);
  const title = `${name} · Polynet`;
  const set = (pattern, replacement) => { html = html.replace(pattern, replacement); };
  set(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  set(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapeHtml(description)}" />`);
  set(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escapeHtml(name)}" />`);
  set(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${escapeHtml(description)}" />`);
  set(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`);
  set(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${escapeHtml(name)}" />`);
  set(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`);
  if (image) {
    set(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${escapeHtml(image)}" />`);
    set(/<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${escapeHtml(image)}" />`);
    // The banner's own size is unknown: drop the default image's.
    set(/\s*<meta property="og:image:width" content="[^"]*"\s*\/?>/, "");
    set(/\s*<meta property="og:image:height" content="[^"]*"\s*\/?>/, "");
  }
  // Unlisted means link-only: search engines are asked not to index it.
  if (!page.listed) set(/<\/head>/, `    <meta name="robots" content="noindex" />\n  </head>`);
  return html;
}

// Only Polynet's own hosts: the page is fetched from the host that was asked.
export function isPolynetHost(host) {
  return /^(?:[a-z0-9-]+\.)*polynet\.ai$/.test(host) || /^[a-z0-9-]+\.vercel\.app$/.test(host);
}

export default async function handler(req, res) {
  const host = String(req.headers?.host ?? "").trim().toLowerCase();
  if (!isPolynetHost(host)) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const slug = String(req.query?.slug ?? "").trim().toLowerCase();
  let html = "";
  try {
    const index = await fetch(`https://${host}/index.html`);
    html = index.ok ? await index.text() : "";
  } catch {
    html = "";
  }
  if (!html) {
    res.statusCode = 503;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Polynet is busy. Try again in a moment.");
    return;
  }
  if (SLUG_PATTERN.test(slug)) {
    const page = await readCommunity(slug);
    if (page) html = withCommunityPreview(html, page, `https://${host}/c/${slug}`);
  }
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=0, s-maxage=60, stale-while-revalidate=600");
  res.end(html);
}
