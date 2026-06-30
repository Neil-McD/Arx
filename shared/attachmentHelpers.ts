export type ImageFileDetectionOptions = {
  allowSvg?: boolean;
  allowAvif?: boolean;
};

const BASE_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"] as const;
const MAX_DIRECT_DATA_URL_FILE_BYTES = 2 * 1024 * 1024;

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

export function isLikelyTextFile(file: File): boolean {
  const mime = (file.type ?? "").toLowerCase();
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json") return true;
  if (mime === "application/xml") return true;
  if (mime === "application/x-yaml") return true;
  const name = (file.name ?? "").toLowerCase();
  return (
    name.endsWith(".md") ||
    name.endsWith(".txt") ||
    name.endsWith(".csv") ||
    name.endsWith(".ts") ||
    name.endsWith(".tsx") ||
    name.endsWith(".js") ||
    name.endsWith(".jsx") ||
    name.endsWith(".json") ||
    name.endsWith(".py") ||
    name.endsWith(".rs") ||
    name.endsWith(".go") ||
    name.endsWith(".html") ||
    name.endsWith(".css") ||
    name.endsWith(".yml") ||
    name.endsWith(".yaml")
  );
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".ogv"] as const;
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".oga", ".aac", ".flac"] as const;

/** Classify an attachment as inline-playable media from its mime/name. Returns null for non-media. */
export function classifyMediaKind(
  mime: string | null | undefined,
  name: string | null | undefined,
): "video" | "audio" | null {
  const normalizedMime = (mime ?? "").toLowerCase();
  const normalizedName = (name ?? "").toLowerCase();
  if (normalizedMime.startsWith("video/") || VIDEO_EXTENSIONS.some((ext) => normalizedName.endsWith(ext))) {
    return "video";
  }
  if (normalizedMime.startsWith("audio/") || AUDIO_EXTENSIONS.some((ext) => normalizedName.endsWith(ext))) {
    return "audio";
  }
  return null;
}

export function isLikelyMediaFile(file: File): boolean {
  return classifyMediaKind(file.type, file.name) !== null;
}

export function isLikelyImageFile(file: File, options: ImageFileDetectionOptions = {}): boolean {
  const mime = (file.type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = (file.name ?? "").toLowerCase();
  if (BASE_IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension))) return true;
  if (options.allowAvif ?? true) {
    if (name.endsWith(".avif")) return true;
  }
  if (options.allowSvg ?? false) {
    if (name.endsWith(".svg")) return true;
  }
  return false;
}

export function isSupportedChatRasterImage(
  file: File,
  options: ImageFileDetectionOptions = {},
): boolean {
  const mime = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  const isSvg = mime.includes("svg") || name.endsWith(".svg");
  const isHeic = mime.includes("heic") || mime.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
  return !isSvg && !isHeic && isLikelyImageFile(file, options);
}

export async function readTextAttachmentPreview(
  file: File,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const truncated = file.size > maxBytes;
  const slice = truncated ? file.slice(0, maxBytes) : file;
  const text = await slice.text();
  return { text, truncated };
}

export async function readChatImageAsDataUrl(
  file: File,
  maxDataUrlChars: number,
): Promise<string> {
  const tryDirectDataUrl = async (): Promise<string | null> => {
    if (file.size > MAX_DIRECT_DATA_URL_FILE_BYTES) return null;
    const raw = await fileToDataUrl(file);
    if (!raw.startsWith("data:image/")) return null;
    return raw.length <= maxDataUrlChars ? raw : null;
  };

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image."));
    });
    img.src = url;
    await loaded;

    const candidates: Array<{ maxDim: number; quality: number }> = [
      { maxDim: 1280, quality: 0.85 },
      { maxDim: 1024, quality: 0.82 },
      { maxDim: 768, quality: 0.78 },
      { maxDim: 512, quality: 0.74 },
      { maxDim: 384, quality: 0.70 },
      { maxDim: 320, quality: 0.66 },
    ];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Invalid image dimensions.");

    let lastDataUrl = "";
    for (const { maxDim, quality } of candidates) {
      const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      try {
        lastDataUrl = canvas.toDataURL("image/jpeg", quality);
      } catch {
        const direct = await tryDirectDataUrl();
        if (direct) return direct;
        throw new Error("Could not process image. Try exporting as PNG or JPG.");
      }
      if (lastDataUrl.length <= maxDataUrlChars) return lastDataUrl;
    }

    if (lastDataUrl && lastDataUrl.length <= maxDataUrlChars) return lastDataUrl;
    const direct = await tryDirectDataUrl();
    if (direct) return direct;
    throw new Error("Image is too large to attach. Try a smaller one.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
