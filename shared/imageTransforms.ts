import { bytesToBase64 } from "./voiceCapture";

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

export async function readAvatarFileAsSquareDataUrl(
  file: File,
  size = 128,
): Promise<string> {
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

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");

    const side = Math.min(img.width, img.height);
    const sx = Math.floor((img.width - side) / 2);
    const sy = Math.floor((img.height - side) / 2);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readCommunityAvatarFileAsDataUrlWithinLimit(
  file: File,
  maxChars: number,
): Promise<string> {
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

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Invalid image dimensions.");

    const candidates: Array<{ maxEdge: number; quality: number }> = [
      { maxEdge: 1024, quality: 0.92 },
      { maxEdge: 768, quality: 0.9 },
      { maxEdge: 640, quality: 0.88 },
      { maxEdge: 512, quality: 0.86 },
    ];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");

    let lastDataUrl = "";
    for (const { maxEdge, quality } of candidates) {
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/webp", quality);
      lastDataUrl = dataUrl;
      if (dataUrl.length <= maxChars) return dataUrl;
    }

    if (lastDataUrl && lastDataUrl.length <= maxChars) return lastDataUrl;
    throw new Error("Avatar image is too large. Try a smaller image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readBannerFileAsWideDataUrlWithinLimit(
  file: File,
  maxChars: number,
): Promise<string> {
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

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Invalid image dimensions.");

    const candidates: Array<{ maxEdge: number; quality: number }> = [
      { maxEdge: 1600, quality: 0.88 },
      { maxEdge: 1280, quality: 0.84 },
      { maxEdge: 1024, quality: 0.8 },
      { maxEdge: 768, quality: 0.76 },
    ];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");

    let lastDataUrl = "";
    for (const { maxEdge, quality } of candidates) {
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      lastDataUrl = dataUrl;
      if (dataUrl.length <= maxChars) return dataUrl;
    }

    if (lastDataUrl && lastDataUrl.length <= maxChars) return lastDataUrl;
    throw new Error("Banner image is too large. Try a smaller image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
