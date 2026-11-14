import { describe, expect, it } from "vitest";
import { eventLinePlaceIsOnline, eventLineTimes, readEventLine } from "../shared/communityEventLine";

// Saturday, Nov 14 2026, 10:00.
const today = { year: 2026, month: 11, day: 14, hour: 10, minute: 0 };

describe("reading one line into an event", () => {
  it("reads a weekly event", () => {
    const read = readEventLine("Office hours every Tuesday 3pm", today);
    expect(read).toMatchObject({ title: "Office hours", repeats: "weekly", time: { hour: 15, minute: 0 }, date: { year: 2026, month: 11, day: 17 }, place: null });
    expect(eventLineTimes(read, today)).toEqual({ starts_at: "2026-11-17T15:00", ends_at: "" });
  });
  it("reads a date, a time and a place", () => {
    const read = readEventLine("Workshop Dec 12 11am at The Foundry", today);
    expect(read).toMatchObject({ title: "Workshop", repeats: "none", date: { year: 2026, month: 12, day: 12 }, time: { hour: 11, minute: 0 }, place: "The Foundry" });
    expect(eventLinePlaceIsOnline(read.place)).toBe(false);
  });
  it("reads a length as the end time", () => {
    const read = readEventLine("Demo day Friday 2pm, 90 minutes", today);
    expect(read.title).toBe("Demo day");
    expect(eventLineTimes(read, today)).toEqual({ starts_at: "2026-11-20T14:00", ends_at: "2026-11-20T15:30" });
  });
  it("reads a range", () => {
    expect(eventLineTimes(readEventLine("Weekly call every Thursday 4-5pm", today), today)).toEqual({ starts_at: "2026-11-19T16:00", ends_at: "2026-11-19T17:00" });
    expect(eventLineTimes(readEventLine("Breakfast tomorrow 11am to 1pm", today), today)).toEqual({ starts_at: "2026-11-15T11:00", ends_at: "2026-11-15T13:00" });
  });
  it("takes today for a weekday only when the hour is still ahead", () => {
    expect(readEventLine("Open gym Saturday 6pm", today).date).toEqual({ year: 2026, month: 11, day: 14 });
    expect(readEventLine("Open gym Saturday 9am", today).date).toEqual({ year: 2026, month: 11, day: 21 });
  });
  it("moves a date that has gone by to next year", () => {
    expect(readEventLine("Kickoff Jan 5 9am", today).date).toEqual({ year: 2027, month: 1, day: 5 });
  });
  it("keeps what it can't read in the title, and guesses the rest", () => {
    const read = readEventLine("Founders dinner", today);
    expect(read).toMatchObject({ title: "Founders dinner", date: null, time: null, repeats: "none" });
    expect(eventLineTimes(read, today)).toEqual({ starts_at: "2026-11-15T12:00", ends_at: "" });
  });
  it("with a time and no day, it is the next time that hour comes round", () => {
    expect(eventLineTimes(readEventLine("Standup 9am", today), today).starts_at).toBe("2026-11-15T09:00");
    expect(eventLineTimes(readEventLine("Standup 5pm", today), today).starts_at).toBe("2026-11-14T17:00");
  });
  it("reads monthly, daily and 24-hour times", () => {
    expect(readEventLine("AMA monthly 18:30", today)).toMatchObject({ title: "AMA", repeats: "monthly", time: { hour: 18, minute: 30 } });
    expect(readEventLine("Daily standup at 9:15am on Zoom", today)).toMatchObject({ title: "Standup", repeats: "daily", time: { hour: 9, minute: 15 }, place: "Zoom" });
  });
  it("knows a call from an address", () => {
    expect(eventLinePlaceIsOnline("Zoom")).toBe(true);
    expect(eventLinePlaceIsOnline(null)).toBe(true);
    expect(eventLinePlaceIsOnline("12 Main St")).toBe(false);
  });
});
