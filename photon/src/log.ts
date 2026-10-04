/** Structured log lines. Callers pass event names and counts only: never DM IDs, handles, message text, or secrets. */
export function log(event: string, fields: Record<string, string | number | boolean> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

export function logError(event: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ at: new Date().toISOString(), event, error: message }));
}
