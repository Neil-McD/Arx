import { performance } from "node:perf_hooks";

export type TimingMark = {
  name: string;
  t_ms: number;
  data?: Record<string, unknown>;
};

export type TimingSummary = {
  started_at_ms: number;
  total_ms: number;
  marks: TimingMark[];
  buckets: Record<string, number>;
};

export function nowMs(): number {
  return Math.round(performance.now());
}

export function elapsedMs(startedAtMs: number): number {
  return Math.max(0, nowMs() - startedAtMs);
}

export class TimingCollector {
  readonly startedAtMs = nowMs();
  private readonly marks: TimingMark[] = [];
  private readonly bucketStarts = new Map<string, number>();
  private readonly buckets: Record<string, number> = {};

  mark(name: string, data?: Record<string, unknown>): TimingMark {
    const mark: TimingMark = {
      name,
      t_ms: elapsedMs(this.startedAtMs),
      ...(data ? { data } : null),
    };
    this.marks.push(mark);
    return mark;
  }

  startBucket(name: string): void {
    this.bucketStarts.set(name, nowMs());
  }

  endBucket(name: string): number {
    const startedAtMs = this.bucketStarts.get(name) ?? nowMs();
    this.bucketStarts.delete(name);
    const durationMs = elapsedMs(startedAtMs);
    this.buckets[name] = durationMs;
    return durationMs;
  }

  setBucket(name: string, valueMs: number): void {
    this.buckets[name] = Math.max(0, Math.round(valueMs));
  }

  summary(): TimingSummary {
    return {
      started_at_ms: this.startedAtMs,
      total_ms: elapsedMs(this.startedAtMs),
      marks: [...this.marks],
      buckets: { ...this.buckets },
    };
  }
}
