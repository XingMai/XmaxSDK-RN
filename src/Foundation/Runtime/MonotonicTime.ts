/** RN exposes the monotonic Performance API at runtime; its legacy type condition omits it. */
export function monotonicTime(): number {
  const runtime = globalThis as unknown as { performance: { now(): number } };

  return runtime.performance.now() / 1000;
}
