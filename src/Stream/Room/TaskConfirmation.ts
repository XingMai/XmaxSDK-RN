/**
 * Matches task identity before query metadata, as on iOS. Also accepts the
 * legacy suffix-free confirmation with a numeric frame index.
 */
export function matchesTaskSEI(taskID: string, message: string): boolean {
  const currentID = taskID.split('?')[0]!;
  const receivedID = message.trim().split('?')[0]!;

  if (!currentID) return false;
  if (receivedID === currentID) return true;

  const prefix = `${currentID}&index=`;

  return (
    receivedID.startsWith(prefix) &&
    /^\d+$/.test(receivedID.slice(prefix.length))
  );
}
