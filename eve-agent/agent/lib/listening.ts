// The Listening Session lifecycle: none -> active -> stopped. Pure over the session value, so
// tools only persist what these functions return, and Splitwise is read only when a batch is shown.

import { batchFingerprint, describeDraft, DraftError } from "./money.ts";
import type { Draft, Group } from "./money.ts";
import type { SplitwiseClient } from "./splitwise.ts";

export type ListeningSession = {
  status: "none" | "active" | "stopped";
  drafts: Draft[];
  /** The batch fingerprint last shown to the user after stopping; Commit must match it. */
  shown_fingerprint: string | null;
};

/** A new session value and the exact text the agent quotes. */
export type Outcome = { session: ListeningSession; summary: string };

export const NO_SESSION: ListeningSession = { status: "none", drafts: [], shown_fingerprint: null };

const NOTHING_WRITTEN = "Nothing has been written to Splitwise.";

export function startListening(session: ListeningSession): Outcome {
  if (session.status === "active") {
    return { session, summary: `A Listening Session is already active, with ${count(session.drafts)}.` };
  }
  if (session.status === "stopped") {
    return { session, summary: `This Listening Session is stopped and can't be resumed. Its ${count(session.drafts)} wait for review.` };
  }
  return {
    session: { ...NO_SESSION, status: "active" },
    summary: "Listening Session started. Tell me about shared Expenses, then say @agent stop listening.",
  };
}

/** Adds a Draft, or throws a DraftError when no active session can take it. */
export function addDraft(session: ListeningSession, draft: Draft): ListeningSession {
  assertActive(session);
  return { ...session, drafts: [...session.drafts, draft] };
}

/** Replaces a Draft in place by id, or throws a DraftError when the session isn't active or the id is unknown. */
export function modifyDraft(session: ListeningSession, draft: Draft): ListeningSession {
  assertActive(session);
  const index = session.drafts.findIndex((current) => current.id === draft.id);
  if (index === -1) {
    const known = session.drafts.map((current) => `${current.id} (${current.description})`).join(", ");
    throw new DraftError(
      `No Draft ${draft.id} in this session, so nothing was changed. Current Drafts: ${known || "none"}. Ask which Draft they meant.`,
    );
  }
  const drafts = session.drafts.slice();
  drafts[index] = draft;
  return { ...session, drafts };
}

/** Throws a DraftError unless the session is active, before anything is read or built. */
export function assertActive(session: ListeningSession): void {
  if (session.status === "stopped") {
    throw new DraftError("The Listening Session is stopped, so its batch can't change and no Draft was recorded.");
  }
  if (session.status !== "active") {
    throw new DraftError("No Listening Session is active, so no Draft was recorded.");
  }
}

/** Stops the session and shows its final batch. Never writes to Splitwise; an empty session just ends. */
export async function stopListening(session: ListeningSession, client: SplitwiseClient): Promise<Outcome> {
  if (session.status === "none") return { session, summary: "No Listening Session is active." };
  if (session.status === "stopped") return summarizeSession(session, client);
  if (session.drafts.length === 0) {
    return { session: NO_SESSION, summary: "Stopped listening. There were no Drafts, so there is nothing to record in Splitwise." };
  }
  // Read the group before changing state, so a failed read leaves the session active for a retry.
  const group = await client.getGroup();
  const stopped: ListeningSession = { ...session, status: "stopped", shown_fingerprint: batchFingerprint(session.drafts) };
  return { session: stopped, summary: `Stopped listening. ${batch(stopped.drafts, group)}\n${NOTHING_WRITTEN}` };
}

/** Lists every Draft and the mapped group; once stopped, records that this batch was shown. */
export async function summarizeSession(session: ListeningSession, client: SplitwiseClient): Promise<Outcome> {
  if (session.status === "none") return { session, summary: "No Listening Session is active." };
  const group = await client.getGroup();
  if (session.status === "active") {
    return { session, summary: `Listening. ${batch(session.drafts, group)}` };
  }
  return {
    session: { ...session, shown_fingerprint: batchFingerprint(session.drafts) },
    summary: `Stopped. ${batch(session.drafts, group)}\n${NOTHING_WRITTEN}`,
  };
}

function batch(drafts: Draft[], group: Group): string {
  if (drafts.length === 0) return `No Drafts yet for ${group.name}.`;
  const lines = drafts.map((d, i) => `${i + 1}. ${describeDraft(d, group)}`);
  return [`${count(drafts)} for ${group.name}:`, ...lines].join("\n");
}

function count(drafts: Draft[]): string {
  return `${drafts.length} Draft${drafts.length === 1 ? "" : "s"}`;
}
