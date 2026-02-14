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

    const candidates: Array<{ width: number; height: number; quality: number }> = [
      { width: 960, height: 320, quality: 0.86 },
      { width: 768, height: 256, quality: 0.82 },
      { width: 576, height: 192, quality: 0.78 },
      { width: 480, height: 160, quality: 0.74 },
    ];

    const targetAspect = candidates[0].width / candidates[0].height;
    const sourceAspect = sourceWidth / sourceHeight;
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (sourceAspect > targetAspect) {
      // Source is wider: crop left/right.
      sh = sourceHeight;
      sw = Math.max(1, Math.floor(sourceHeight * targetAspect));
      sx = Math.max(0, Math.floor((sourceWidth - sw) / 2));
      sy = 0;
    } else if (sourceAspect < targetAspect) {
      // Source is taller: crop top/bottom.
      sw = sourceWidth;
      sh = Math.max(1, Math.floor(sourceWidth / targetAspect));
      sx = 0;
      sy = Math.max(0, Math.floor((sourceHeight - sh) / 2));
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");

    let lastDataUrl = "";
    for (const { width, height, quality } of candidates) {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
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
