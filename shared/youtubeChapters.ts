// Chapters of a YouTube video, read the way YouTube reads them: timestamp lines
// in the video's description ("0:00 Intro", "02:15 - Set up the map"). Lessons
// show them beside the video so members can jump.

export type VideoChapter = { seconds: number; time: string; label: string };

const CHAPTER_LINE = /^\s*(?:[-*•]\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|]?\s*(\S.*)$/;
export const VIDEO_CHAPTERS_MAX = 60;

export function parseChapterLine(text: string): VideoChapter | null {
  const match = CHAPTER_LINE.exec(text.trim());
  if (!match) return null;
  const seconds = match[1]!.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  const label = match[2]!.trim().slice(0, 200);
  return Number.isFinite(seconds) && label ? { seconds, time: match[1]!, label } : null;
}

/** YouTube's own rule: chapters start at 0:00, run in order, and there are at least three. */
export function parseYouTubeChapters(description: string): VideoChapter[] {
  const chapters: VideoChapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const chapter = parseChapterLine(line);
    if (!chapter) continue;
    if (chapters.length && chapter.seconds <= chapters[chapters.length - 1]!.seconds) continue;
    chapters.push(chapter);
    if (chapters.length >= VIDEO_CHAPTERS_MAX) break;
  }
  return chapters.length >= 3 && chapters[0]!.seconds === 0 ? chapters : [];
}

/** The description inside a watch page's player data, decoded, or null. */
export function youTubeDescriptionFromWatchPage(html: string): string | null {
  const match = /"shortDescription":("(?:[^"\\]|\\.)*")/.exec(html);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]!);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function isYouTubeVideoId(id: string): boolean {
  return /^[A-Za-z0-9_-]{6,20}$/.test(id);
}
