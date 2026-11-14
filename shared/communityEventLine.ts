// Events, Nov 14: a host adds an event by typing one line, "Office hours every
// Tuesday 3pm". This reads the line into the event form's fields. It is plain
// rules, no AI: what it can't read stays in the title and the host fixes the
// parts by hand. Wall-clock only; the form applies the timezone.

export type EventLineToday = { year: number; month: number; day: number; hour: number; minute: number };

export type EventLineRead = {
  title: string;
  date: { year: number; month: number; day: number } | null;
  time: { hour: number; minute: number } | null;
  endTime: { hour: number; minute: number } | null;
  repeats: "none" | "daily" | "weekly" | "monthly";
  place: string | null;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAY_PATTERN = "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
const MONTH_PATTERN = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const weekdayIndex = (word: string) => WEEKDAYS.findIndex((day) => day.startsWith(word.toLowerCase().slice(0, 3)));
const monthIndex = (word: string) => MONTHS.findIndex((month) => month.startsWith(word.toLowerCase().slice(0, 3)));

function addDays(from: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(from.year, from.month - 1, from.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function clock(hourText: string, minuteText: string | undefined, meridiem: string | undefined): { hour: number; minute: number } | null {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? "0");
  const half = meridiem?.toLowerCase();
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === "pm" ? 12 : 0);
  }
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { hour, minute } : null;
}

export function readEventLine(text: string, today: EventLineToday): EventLineRead {
  let rest = ` ${text.replace(/\s+/g, " ").trim()} `;
  const take = (pattern: RegExp): RegExpExecArray | null => {
    const match = pattern.exec(rest);
    if (match) rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`;
    return match;
  };

  // How often.
  let repeats: EventLineRead["repeats"] = "none";
  let weekday: number | null = null;
  const everyWeekday = take(new RegExp(`\\b(?:every|each)\\s+${WEEKDAY_PATTERN}s?\\b`, "i"));
  if (everyWeekday) { repeats = "weekly"; weekday = weekdayIndex(everyWeekday[1]); }
  else if (take(/\b(?:every\s+day|daily)\b/i)) repeats = "daily";
  else if (take(/\b(?:every\s+week|weekly)\b/i)) repeats = "weekly";
  else if (take(/\b(?:every\s+month|monthly)\b/i)) repeats = "monthly";

  // How long, when said as a length ("90 minutes", "for 2 hours").
  let lengthMinutes: number | null = null;
  const length = take(/\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/i);
  if (length) lengthMinutes = Math.round(Number(length[1]) * (/^h/i.test(length[2]) ? 60 : 1));

  // What time: "3-4pm", "3pm to 4:30pm", "3pm", "15:00", "noon".
  let time: EventLineRead["time"] = null;
  let endTime: EventLineRead["endTime"] = null;
  const range = take(/\b(?:at\s+|from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (range) {
    endTime = clock(range[4], range[5], range[6]);
    // "3-4pm": the start takes the end's half of the day unless that puts it later.
    time = clock(range[1], range[2], range[3] ?? range[6]);
    if (!range[3] && time && endTime && time.hour * 60 + time.minute >= endTime.hour * 60 + endTime.minute) time = clock(range[1], range[2], "am");
  } else {
    const single = take(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? take(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
    if (single) time = clock(single[1], single[2], single[3]);
    else if (take(/\b(?:at\s+)?noon\b/i)) time = { hour: 12, minute: 0 };
  }
  if (time && !endTime && lengthMinutes) {
    const end = time.hour * 60 + time.minute + lengthMinutes;
    if (end < 24 * 60) endTime = { hour: Math.floor(end / 60), minute: end % 60 };
  }

  // Which day.
  const base = { year: today.year, month: today.month, day: today.day };
  const startsLaterToday = time ? time.hour * 60 + time.minute > today.hour * 60 + today.minute : false;
  let date: EventLineRead["date"] = null;
  if (take(/\b(?:today|tonight)\b/i)) date = base;
  else if (take(/\btomorrow\b/i)) date = addDays(base, 1);
  else {
    const monthDay = take(new RegExp(`\\b(?:on\\s+)?${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"));
    const dayMonth = monthDay ? null : take(new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}\\b`, "i"));
    const numeric = monthDay || dayMonth ? null : take(/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})\b/);
    const month = monthDay ? monthIndex(monthDay[1]) + 1 : dayMonth ? monthIndex(dayMonth[2]) + 1 : numeric ? Number(numeric[1]) : 0;
    const day = monthDay ? Number(monthDay[2]) : dayMonth ? Number(dayMonth[1]) : numeric ? Number(numeric[2]) : 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // This year, or next year once the date has gone by.
      const gone = month < today.month || (month === today.month && day < today.day);
      date = { year: today.year + (gone ? 1 : 0), month, day };
    } else {
      const named = weekday === null ? take(new RegExp(`\\b(?:on\\s+)?(?:next\\s+|this\\s+)?${WEEKDAY_PATTERN}\\b`, "i")) : null;
      const target = weekday ?? (named ? weekdayIndex(named[1]) : null);
      if (target !== null && target >= 0) {
        const todayWeekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
        let ahead = (target - todayWeekday + 7) % 7;
        if (ahead === 0 && !startsLaterToday) ahead = 7;
        date = addDays(base, ahead);
      }
    }
  }

  // Where: "on Zoom", or what follows a last "at" or "in".
  let place: string | null = null;
  const where = take(/\s(?:on|via|over)\s+(zoom|discord|google meet|meet|teams|slack|youtube|twitch)\s*$/i) ?? take(/\s(?:at|in|@)\s+([^,]+?)\s*$/i);
  if (where) place = where[1].trim() || null;

  const title = rest.replace(/\s+/g, " ").replace(/^[\s,;:-]+|[\s,;:-]+$/g, "").replace(/\s+(?:on|at|from|in)$/i, "").trim();
  return { title: title.charAt(0).toUpperCase() + title.slice(1), date, time, endTime, repeats, place };
}

const pad = (value: number) => String(value).padStart(2, "0");

// The form's two time fields ("2026-12-01T15:00"). With no day said it is the
// next time that hour comes round; with no time said it is noon.
export function eventLineTimes(read: EventLineRead, today: EventLineToday): { starts_at: string; ends_at: string } {
  const time = read.time ?? { hour: 12, minute: 0 };
  const laterToday = Boolean(read.time) && time.hour * 60 + time.minute > today.hour * 60 + today.minute;
  const date = read.date ?? addDays({ year: today.year, month: today.month, day: today.day }, laterToday ? 0 : 1);
  const stamp = (clockTime: { hour: number; minute: number }) => `${String(date.year).padStart(4, "0")}-${pad(date.month)}-${pad(date.day)}T${pad(clockTime.hour)}:${pad(clockTime.minute)}`;
  const endsAfterStart = read.endTime && read.endTime.hour * 60 + read.endTime.minute > time.hour * 60 + time.minute;
  return { starts_at: stamp(time), ends_at: read.endTime && endsAfterStart ? stamp(read.endTime) : "" };
}

// A place that is a call, not an address.
export function eventLinePlaceIsOnline(place: string | null): boolean {
  return !place || /\b(zoom|discord|meet|teams|online|call|stream|youtube|twitch|slack)\b/i.test(place);
}
