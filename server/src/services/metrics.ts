export function elapsedSeconds(startMs: number, endMs: number): number {
  return Math.max((endMs - startMs) / 1000, 0.000001);
}

export function throughputMbps(sizeBytes: number, elapsedSec: number): number {
  if (elapsedSec <= 0) {
    return 0;
  }
  return (sizeBytes * 8) / 1_000_000 / elapsedSec;
}

export async function withTiming<T>(fn: () => Promise<T>) {
  const startedAtMs = Date.now();
  const result = await fn();
  const finishedAtMs = Date.now();
  const elapsedSec = elapsedSeconds(startedAtMs, finishedAtMs);
  return { result, startedAtMs, finishedAtMs, elapsedSec };
}
