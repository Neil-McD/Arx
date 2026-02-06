export type FunnelTemplate = "vsl" | "lead_capture" | "book_call";
export type FunnelStyle = "clean" | "bold" | "minimal";

export type FunnelSectionKind = "hero" | "video" | "proof" | "form" | "cta" | "booking";

export type FunnelSection = {
  id: string;
  kind: FunnelSectionKind;
  title: string;
  body: string;
};

export type CommunityFunnelSchema = {
  v: 1;
  template: FunnelTemplate;
  style: FunnelStyle;
  headline: string;
  subheadline: string;
  primary_cta_label: string;
  video_url: string | null;
  booking_url: string | null;
  lead_capture_enabled: boolean;
  proof_points: string[];
  sections: FunnelSection[];
};

const DEFAULT_SCHEMA: CommunityFunnelSchema = {
  v: 1,
  template: "vsl",
  style: "clean",
  headline: "Join this community",
  subheadline: "Learn with focused members and ship faster.",
  primary_cta_label: "Join now",
  video_url: null,
  booking_url: null,
  lead_capture_enabled: true,
  proof_points: [],
  sections: [
    { id: "hero", kind: "hero", title: "Outcome", body: "What members get inside this community." },
    { id: "proof", kind: "proof", title: "Proof", body: "Add testimonials, screenshots, and outcomes." },
    { id: "cta", kind: "cta", title: "Call to action", body: "Tell visitors exactly what to do next." },
  ],
};

function asNonEmptyString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeTemplate(value: unknown): FunnelTemplate {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (text === "vsl" || text === "lead_capture" || text === "book_call") return text;
  return "vsl";
}

function normalizeStyle(value: unknown): FunnelStyle {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (text === "clean" || text === "bold" || text === "minimal") return text;
  return "clean";
}

function normalizeSectionKind(value: unknown): FunnelSectionKind {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (text === "hero" || text === "video" || text === "proof" || text === "form" || text === "cta" || text === "booking") {
    return text;
  }
  return "cta";
}

function normalizeSections(raw: unknown): FunnelSection[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SCHEMA.sections];
  const out: FunnelSection[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (out.length >= 12) break;
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = asNonEmptyString(row.title) ?? "";
    const body = asNonEmptyString(row.body) ?? "";
    if (!title && !body) continue;
    const id = asNonEmptyString(row.id) ?? `section-${i + 1}`;
    out.push({
      id,
      kind: normalizeSectionKind(row.kind),
      title: title || "Section",
      body: body || "",
    });
  }
  return out.length > 0 ? out : [...DEFAULT_SCHEMA.sections];
}

function normalizeProofPoints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const value = asNonEmptyString(item);
    if (!value) continue;
    out.push(value);
    if (out.length >= 10) break;
  }
  return out;
}

export function normalizeCommunityFunnelSchema(raw: unknown): CommunityFunnelSchema {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_SCHEMA };
  const value = raw as Record<string, unknown>;
  const template = normalizeTemplate(value.template);
  const style = normalizeStyle(value.style);
  const headline = asNonEmptyString(value.headline) ?? DEFAULT_SCHEMA.headline;
  const subheadline = asNonEmptyString(value.subheadline) ?? DEFAULT_SCHEMA.subheadline;
  const primaryCta = asNonEmptyString(value.primary_cta_label) ?? DEFAULT_SCHEMA.primary_cta_label;
  const videoUrl = asNonEmptyString(value.video_url);
  const bookingUrl = asNonEmptyString(value.booking_url);
  const proofPoints = normalizeProofPoints(value.proof_points);
  const sections = normalizeSections(value.sections);
  return {
    v: 1,
    template,
    style,
    headline,
    subheadline,
    primary_cta_label: primaryCta,
    video_url: videoUrl,
    booking_url: bookingUrl,
    lead_capture_enabled: value.lead_capture_enabled !== false,
    proof_points: proofPoints,
    sections,
  };
}

function splitPromptToSentences(prompt: string): string[] {
  return prompt
    .split(/[\n.]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function defaultCtaForTemplate(template: FunnelTemplate): string {
  if (template === "lead_capture") return "Get access";
  if (template === "book_call") return "Book a call";
  return "Join now";
}

export function buildCommunityFunnelDraft(params: {
  template: FunnelTemplate;
  style: FunnelStyle;
  prompt: string;
  communityName: string;
  priceLabel: string | null;
}): CommunityFunnelSchema {
  const template = normalizeTemplate(params.template);
  const style = normalizeStyle(params.style);
  const communityName = asNonEmptyString(params.communityName) ?? "this community";
  const priceLabel = asNonEmptyString(params.priceLabel);
  const prompt = asNonEmptyString(params.prompt) ?? "";
  const bullets = splitPromptToSentences(prompt);

  const headline =
    bullets[0] ??
    (priceLabel ? `Join ${communityName} for ${priceLabel}` : `Join ${communityName}`);
  const subheadline =
    bullets[1] ??
    "Learn from proven operators, ask direct questions, and apply the playbook with support.";

  const proofPoints = bullets.slice(2, 5);
  const primaryCta = defaultCtaForTemplate(template);

  const sections: FunnelSection[] = [
    {
      id: "hero",
      kind: "hero",
      title: "Why this community",
      body: subheadline,
    },
  ];

  if (template === "vsl") {
    sections.push({
      id: "video",
      kind: "video",
      title: "Watch first",
      body: "Add a short video sales letter that explains the outcome and who this is for.",
    });
  }

  if (proofPoints.length > 0) {
    sections.push({
      id: "proof",
      kind: "proof",
      title: "Proof",
      body: proofPoints.join("\n"),
    });
  }

  if (template === "lead_capture") {
    sections.push({
      id: "form",
      kind: "form",
      title: "Get updates",
      body: "Capture email before checkout or access request.",
    });
  }

  if (template === "book_call") {
    sections.push({
      id: "booking",
      kind: "booking",
      title: "Book a call",
      body: "Use this for application-based communities before approval.",
    });
  }

  sections.push({
    id: "cta",
    kind: "cta",
    title: "Join",
    body: priceLabel ? `Current offer: ${priceLabel}` : "Join through the community link.",
  });

  return {
    v: 1,
    template,
    style,
    headline,
    subheadline,
    primary_cta_label: primaryCta,
    video_url: null,
    booking_url: null,
    lead_capture_enabled: true,
    proof_points: proofPoints,
    sections,
  };
}

export function stringifyCommunityFunnelSchema(schema: CommunityFunnelSchema): string {
  return JSON.stringify(schema, null, 2);
}
