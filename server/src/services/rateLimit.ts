export async function throttleByMbps(sizeBytes: number, mbps: number, startedAtMs: number) {
  if (mbps <= 0) {
    return;
  }
  const minDurationMs = (sizeBytes * 8 * 1000) / (mbps * 1_000_000);
  const elapsedMs = Date.now() - startedAtMs;
  const remainingMs = minDurationMs - elapsedMs;
  if (remainingMs > 1) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }
}
