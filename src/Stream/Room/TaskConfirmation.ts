/**
 * Accepts an exact task confirmation, optionally followed by a numeric frame
 * index.
 */
export function matchesTaskSEI(taskID: string, message: string): boolean {
  const normalized = message.trim();

  if (normalized === taskID) return true;

  const prefix = `${taskID}&index=`;

  return (
    normalized.startsWith(prefix) &&
    /^\d+$/.test(normalized.slice(prefix.length))
  );
}
