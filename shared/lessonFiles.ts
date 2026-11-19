// Files under a lesson ("Resources for this lesson"), beside its links.
// Uploaded by a host the way post attachments are (streamed through the
// signed-in HTTP route into storage, the type read from the bytes), and
// streamed back only to someone who may read the lesson, on every request.
export const LESSON_FILE_UPLOAD_PATH = "/runtime/lesson_file_upload";
export const LESSON_FILE_DOWNLOAD_PATH = "/runtime/lesson_file_download";

// Lesson files only; posts and direct messages keep their own limits. 100 MB
// (about 95 MiB) stays under Convex's 100 MiB cap on an HTTP action's
// response, which every download streams through. The upload streams too, so
// no runtime memory limit applies; storage's two-minute upload window is the
// remaining bound (about 7 Mbit/s up for the largest file).
export const LESSON_FILE_MAX_BYTES = 100 * 1000 * 1000;

// Links and files together, as many as a lesson ever had links.
export const LESSON_RESOURCES_MAX = 12;

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
  "image/avif": "AVIF",
  "audio/mpeg": "MP3",
  "audio/mp4": "M4A",
  "audio/wav": "WAV",
  "audio/ogg": "OGG",
  "audio/flac": "FLAC",
  "audio/aac": "AAC",
  "audio/webm": "WEBM",
  "video/mp4": "MP4",
  "video/webm": "WEBM",
  "video/ogg": "OGV",
};

// What kind of file, in a word: from the bytes when they say (PDF, PNG,
// MP4…), otherwise from the name's ending (ZIP, DOCX…), otherwise "File".
export function lessonFileTypeLabel(name: string, mime: string): string {
  const fromBytes = MIME_LABELS[String(mime ?? "").toLowerCase()];
  if (fromBytes) return fromBytes;
  const ending = /\.([a-z0-9]{1,5})$/i.exec(String(name ?? "").trim())?.[1];
  return ending ? ending.toUpperCase() : "File";
}

// A size as people read it: 820 KB, 4.2 MB, 96 MB.
export function formatLessonFileSize(bytes: number): string {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (size < 1000) return `${size} B`;
  if (size < 1000 * 1000) return `${Math.round(size / 1000)} KB`;
  const mb = size / (1000 * 1000);
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, "") : Math.round(mb)} MB`;
}
