// The Listening Session lifecycle: none -> active -> stopped. Pure over the session value, so
// tools only persist what these functions return. Splitwise is read when a batch is shown, and
// written only by commitBatch.

import { batchFingerprint, commitDrafts, describeDraft, DraftError } from "./money.ts";
import type { CommitDraftsResult, Draft, ExpensePayload, Group } from "./money.ts";
import type { SplitwiseClient } from "./splitwise.ts";

export type ListeningSession = {
  status: "none" | "active" | "stopped";
  drafts: Draft[];
  /** Drafts already written to Splitwise, kept across reset so a retry never repeats a real write. */
  committed: Draft[];
  /** The batch fingerprint last shown to the user after stopping; Commit must match it. */
  shown_fingerprint: string | null;
  /** Confirmation message IDs already acted on, so a redelivered webhook never writes twice. */
  handled_confirmation_ids: string[];
};

/** A new session value and the exact text the agent quotes. */
export type Outcome = { session: ListeningSession; summary: string; created?: ExpensePayload[] };

export const NO_SESSION: ListeningSession = {
  status: "none",
  drafts: [],
  committed: [],
  shown_fingerprint: null,
  handled_confirmation_ids: [],
};

const HANDLED_CONFIRMATIONS_LIMIT = 50;

const NOTHING_WRITTEN = "Nothing has been written to Splitwise.";

/** Fields that survive a new or cleared Listening Session. */
function durable(session: ListeningSession): Pick<ListeningSession, "committed" | "handled_confirmation_ids"> {
  return {
    committed: session.committed ?? [],
    handled_confirmation_ids: session.handled_confirmation_ids,
  };
}

/** Clears the session and uncommitted Drafts. Keeps committed mappings and handled confirmation IDs. */
export function resetListening(session: ListeningSession): Outcome {
  const committed = [
    ...(session.committed ?? []),
    ...session.drafts.filter((draft) => draft.status === "committed"),
  ];
  return {
    session: {
      ...NO_SESSION,
      ...durable(session),
      committed,
    },
    summary:
      committed.length === 0
        ? "Demo reset. Cleared the Listening Session and uncommitted Drafts."
        : `Demo reset. Cleared the Listening Session and uncommitted Drafts. Kept ${committed.length} committed mapping${committed.length === 1 ? "" : "s"}.`,
  };
}

export function startListening(session: ListeningSession): Outcome {
  if (session.status === "active") {
    return { session, summary: `A Listening Session is already active, with ${count(session.drafts)}.` };
  }
  if (session.status === "stopped") {
    return { session, summary: `This Listening Session is stopped and can't be resumed. Its ${count(session.drafts)} wait for review.` };
  }
  return {
    session: { ...NO_SESSION, ...durable(session), status: "active" },
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
    return {
      session: { ...NO_SESSION, ...durable(session) },
      summary: "Stopped listening. There were no Drafts, so there is nothing to record in Splitwise.",
    };
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

/** Writes the reviewed batch to Splitwise. Refuses unless stopped, shown, and this confirmation is new. */
export async function commitBatch(
  session: ListeningSession,
  messageId: string,
  client: SplitwiseClient,
  now: string,
): Promise<Outcome> {
  if (messageId && session.handled_confirmation_ids.includes(messageId)) {
    return { session, summary: "This confirmation was already handled. Nothing was written to Splitwise.", created: [] };
  }
  if (session.status !== "stopped") {
    return {
      session,
      summary: "The Listening Session isn't stopped, so nothing was written to Splitwise. Stop listening first so the batch can be reviewed.",
      created: [],
    };
  }
  const uncommitted = session.drafts.filter((draft) => draft.status !== "committed");
  if (uncommitted.length === 0) {
    return { session, summary: "Those Drafts are already in Splitwise. Nothing was written.", created: [] };
  }
  if (session.shown_fingerprint !== batchFingerprint(session.drafts)) {
    return {
      session,
      summary: "The batch has changed since it was shown, so nothing was written to Splitwise. Ask to review it again.",
      created: [],
    };
  }

  const group = await client.getGroup();
  const handled = messageId
    ? [...session.handled_confirmation_ids, messageId].slice(-HANDLED_CONFIRMATIONS_LIMIT)
    : session.handled_confirmation_ids;
  const result = await commitDrafts(session.drafts, client, group.id, now);
  return {
    session: {
      ...session,
      drafts: result.drafts,
      handled_confirmation_ids: handled,
      shown_fingerprint: batchFingerprint(result.drafts),
    },
    summary: commitSummary(result, group.name),
    created: result.created,
  };
}

function commitSummary(result: CommitDraftsResult, groupName: string): string {
  const lines: string[] = [];
  if (result.committed.length > 0) {
    const names = result.committed.map((draft) => `${draft.description} $${draft.amount}`).join(", ");
    lines.push(`Committed to Splitwise in ${groupName}: ${names}. Open Splitwise to see it.`);
  }
  for (const { draft, reason } of result.failed) {
    lines.push(`Couldn't record ${draft.description} $${draft.amount}: ${reason}.`);
  }
  if (result.failed.length > 0) {
    lines.push("Those Drafts are still uncommitted. Reply commit to retry.");
  }
  return lines.join("\n");
}

function batch(drafts: Draft[], group: Group): string {
  if (drafts.length === 0) return `No Drafts yet for ${group.name}.`;
  const lines = drafts.map((d, i) => `${i + 1}. ${describeDraft(d, group)}`);
  return [`${count(drafts)} for ${group.name}:`, ...lines].join("\n");
}

function count(drafts: Draft[]): string {
  return `${drafts.length} Draft${drafts.length === 1 ? "" : "s"}`;
}
