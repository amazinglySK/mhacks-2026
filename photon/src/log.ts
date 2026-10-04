/** Structured log lines. Callers pass event names and counts only: never DM IDs, handles, message text, or secrets. */
export function log(event: string, fields: Record<string, string | number | boolean> = {}): void {
  console.log(line(event, fields));
}

export function logError(event: string, error: unknown): void {
  console.error(line(event, { error: error instanceof Error ? error.message : String(error) }));
}

let redactions: string[] = [];

/** Values masked from every log line, for identifiers that third-party error messages may echo. */
export function redact(values: string[]): void {
  redactions = values.filter(Boolean).sort((a, b) => b.length - a.length);
}

function line(event: string, fields: Record<string, string | number | boolean>): string {
  let text = JSON.stringify({ at: new Date().toISOString(), event, ...fields });
  for (const value of redactions) text = text.replaceAll(value, "[redacted]");
  return text;
}
