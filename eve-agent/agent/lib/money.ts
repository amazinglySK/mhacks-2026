// Money logic, ported from reasoning-agent/shared_money.py. Amounts are integer cents
// internally and two-decimal strings at the edges, so no float rounding reaches Splitwise.
// Share math is pure; Commit is the one function that calls Splitwise.

import { createHash } from "node:crypto";

export const CURRENCY_CODE = "USD";
const SELF_REFERENCES = new Set(["me", "i", "myself"]);

export type Member = { id: number; first_name: string | null; last_name: string | null };
export type Group = { id: number; name: string; members: Member[] };

export type Share = { user_id: number; paid_share: string; owed_share: string };

export type Draft = {
  id: string;
  status: "draft" | "committed";
  amount: string;
  description: string;
  currency_code: string;
  shares: Share[];
  source_messages: { id: string; sender: string }[];
  created_at: string;
  updated_at: string;
  splitwise_expense_id?: number;
  committed_at?: string;
  first_attempted_at?: string;
};

export type ExpenseInput = {
  description: string;
  amount?: string;
  payer?: string;
  participants: string[];
};

/** Fields a Modification may change; omitted fields keep the Draft's current values. */
export type DraftChanges = {
  description?: string;
  amount?: string;
  payer?: string;
  participants?: string[];
};

/** A reason a Draft can't be recorded, phrased for the model to relay or act on. */
export class DraftError extends Error {}

/** Cents for a positive amount such as "30", "$12.50", or "1,200"; null when missing or invalid. */
export function parseAmount(value: string | undefined): number | null {
  const cents = toCents((value ?? "").replace(/[$,\s]/g, ""));
  return cents !== null && cents > 0 ? cents : null;
}

/** Splits `cents` equally to the cent; the payer's owed share absorbs the rounding remainder. */
export function equalShares(cents: number, payerId: number, userIds: number[]): Share[] {
  const n = userIds.length;
  const base = Math.floor((2 * cents + n) / (2 * n));
  const payerOwed = cents - base * (n - 1);
  return userIds.map((userId) => ({
    user_id: userId,
    paid_share: formatCents(userId === payerId ? cents : 0),
    owed_share: formatCents(userId === payerId ? payerOwed : base),
  }));
}

/** Problems that would stop a Draft from becoming a balanced Splitwise Expense; empty when valid. */
export function validateDraft(draft: Pick<Draft, "amount" | "shares">): string[] {
  const cost = toCents(draft.amount);
  const paid = draft.shares.map((s) => toCents(s.paid_share));
  const owed = draft.shares.map((s) => toCents(s.owed_share));
  const problems: string[] = [];
  if (cost === null || [...paid, ...owed].some((c) => c === null)) return ["an amount is not a decimal"];
  if (sum(paid as number[]) !== cost) problems.push("paid shares don't add up to the cost");
  if (sum(owed as number[]) !== cost) problems.push("owed shares don't add up to the cost");
  if ([...paid, ...owed].some((c) => (c as number) < 0)) problems.push("a share is negative");
  return problems;
}

/** Members whose normalized first or full name equals `name`; "me"/"I" is the demo user. */
export function resolveName(name: string, group: Group, demoUserId: number): Member[] {
  const key = normalize(name);
  if (SELF_REFERENCES.has(key)) return group.members.filter((m) => m.id === demoUserId);
  return group.members.filter((m) => key === normalize(m.first_name ?? "") || key === normalize(fullName(m)));
}

/** Builds a Draft with equal shares, or throws a DraftError naming what the model must ask or fix. */
export function buildDraft(
  input: ExpenseInput,
  group: Group,
  demoUserId: number,
  meta: { id: string; now: string; source: { id: string; sender: string } },
): Draft {
  const description = input.description.split(/\s+/).filter(Boolean).join(" ").slice(0, 60) || "Expense";
  const cents = parseAmount(input.amount);
  if (cents === null) {
    throw new DraftError(`No amount was stated for ${description}. Ask how much it was; never guess an amount.`);
  }

  const payerName = input.payer?.trim() || "me";
  const names = input.participants.map((n) => n.trim()).filter(Boolean);
  const unknown: string[] = [];
  const ambiguous: string[] = [];
  const ids = new Map<string, number>();
  for (const name of [payerName, ...names]) {
    const matches = resolveName(name, group, demoUserId);
    if (matches.length === 0) unknown.push(name);
    else if (matches.length > 1) ambiguous.push(`${name}: ${matches.map(fullName).join(" or ")}`);
    else ids.set(name, matches[0].id);
  }
  const members = group.members.map(fullName).join(", ");
  if (unknown.length > 0) {
    throw new DraftError(
      `${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not in ${group.name}, so no Draft was recorded. ` +
        `Members: ${members}. Use one of these names, or ask the user who they meant.`,
    );
  }
  if (ambiguous.length > 0) {
    throw new DraftError(`More than one member matches, so no Draft was recorded. ${ambiguous.join("; ")}. Ask which one they meant.`);
  }

  const payerId = ids.get(payerName)!;
  const userIds = [...new Set([payerId, ...names.map((n) => ids.get(n)!)])];
  if (userIds.length < 2) throw new DraftError(`Nobody shares ${description} with the payer. Ask who split it.`);

  const draft: Draft = {
    id: meta.id,
    status: "draft",
    amount: formatCents(cents),
    description,
    currency_code: CURRENCY_CODE,
    shares: equalShares(cents, payerId, userIds),
    source_messages: [meta.source],
    created_at: meta.now,
    updated_at: meta.now,
  };
  const problems = validateDraft(draft);
  if (problems.length > 0) {
    throw new DraftError(`${description} $${draft.amount} can't be split that way: ${problems.join("; ")}.`);
  }
  return draft;
}

/** Updates a Draft in place: same id, recomputed shares, source message appended. */
export function applyDraftChanges(
  draft: Draft,
  changes: DraftChanges,
  group: Group,
  demoUserId: number,
  meta: { now: string; source: { id: string; sender: string } },
): Draft {
  const names = new Map(group.members.map((m) => [m.id, fullName(m)]));
  const nameOf = (id: number) => names.get(id) ?? `user ${id}`;
  const payer = draft.shares.find((s) => (parseAmount(s.paid_share) ?? 0) > 0);
  const rebuilt = buildDraft(
    {
      description: changes.description ?? draft.description,
      amount: changes.amount ?? draft.amount,
      payer: changes.payer ?? (payer ? nameOf(payer.user_id) : "me"),
      participants: changes.participants ?? draft.shares.filter((s) => s.user_id !== payer?.user_id).map((s) => nameOf(s.user_id)),
    },
    group,
    demoUserId,
    { id: draft.id, now: meta.now, source: meta.source },
  );
  return {
    ...rebuilt,
    created_at: draft.created_at,
    source_messages: [...draft.source_messages, meta.source],
  };
}

/** Splitwise by-shares create body: group, cost, description, currency, and flattened users__N__* shares. */
export type ExpensePayload = {
  group_id: number;
  cost: string;
  description: string;
  currency_code: string;
  [field: string]: string | number;
};

/** Share fields Commit uses to match a Draft against a listed Expense. */
type ListedShare = { user_id?: number; paid_share?: string | null; owed_share?: string | null };

/** A group Expense as Commit reads it when checking for an earlier uncertain create. */
export type ListedExpense = {
  id: number;
  description?: string | null;
  cost?: string | null;
  deleted_at?: string | null;
  users?: ListedShare[];
};

/** Best-effort Commit of these Drafts: skip committed, validate, create, mark each success immediately. */
export type CommitDraftsResult = {
  drafts: Draft[];
  committed: Draft[];
  failed: { draft: Draft; reason: string }[];
  created: ExpensePayload[];
};

const ATTEMPT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Writes uncommitted valid Drafts through `createExpense`; a retry adopts a matching earlier create instead of sending again. */
export async function commitDrafts(
  drafts: Draft[],
  client: {
    createExpense(payload: ExpensePayload): Promise<number>;
    listExpenses(groupId: number, updatedAfter: string): Promise<ListedExpense[]>;
  },
  groupId: number,
  now: string,
): Promise<CommitDraftsResult> {
  const next = drafts.map((draft) => ({ ...draft, shares: draft.shares.map((share) => ({ ...share })) }));
  const committed: Draft[] = [];
  const failed: { draft: Draft; reason: string }[] = [];
  const created: ExpensePayload[] = [];
  const claimedExpenseIds = new Set(
    next.flatMap((draft) => (typeof draft.splitwise_expense_id === "number" ? [draft.splitwise_expense_id] : [])),
  );
  for (const draft of next) {
    if (draft.status === "committed") continue;
    const problems = validateDraft(draft);
    if (problems.length > 0) {
      failed.push({ draft, reason: problems.join("; ") });
      continue;
    }
    try {
      const adopted = await findSavedAttempt(draft, client, groupId, claimedExpenseIds);
      if (adopted !== null) {
        markCommitted(draft, adopted, now);
        claimedExpenseIds.add(adopted);
        committed.push(draft);
        continue;
      }
    } catch (error) {
      failed.push({
        draft,
        reason: `I couldn't check whether an earlier try reached Splitwise (${error instanceof Error ? error.message : String(error)}), so I didn't resend it`,
      });
      continue;
    }
    draft.first_attempted_at ??= now;
    try {
      const payload = draftToCreateExpensePayload(draft, groupId);
      const expenseId = await client.createExpense(payload);
      markCommitted(draft, expenseId, now);
      claimedExpenseIds.add(expenseId);
      committed.push(draft);
      created.push(payload);
    } catch (error) {
      failed.push({ draft, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { drafts: next, committed, failed, created };
}

function markCommitted(draft: Draft, expenseId: number, now: string): void {
  draft.status = "committed";
  draft.splitwise_expense_id = expenseId;
  draft.committed_at = now;
  draft.updated_at = now;
}

/** The Expense an earlier uncertain create may have saved anyway; null when there is no prior attempt or no match. */
async function findSavedAttempt(
  draft: Draft,
  client: { listExpenses(groupId: number, updatedAfter: string): Promise<ListedExpense[]> },
  groupId: number,
  claimedExpenseIds: Set<number>,
): Promise<number | null> {
  if (!draft.first_attempted_at) return null;
  const since = new Date(Date.parse(draft.first_attempted_at) - ATTEMPT_CLOCK_SKEW_MS).toISOString();
  const wanted = expenseKey(draft.description, draft.amount, draft.shares);
  for (const expense of await client.listExpenses(groupId, since)) {
    if (typeof expense.id !== "number" || claimedExpenseIds.has(expense.id) || expense.deleted_at) continue;
    const found = expenseKey(expense.description ?? "", expense.cost ?? "", expense.users ?? []);
    if (found === wanted) return expense.id;
  }
  return null;
}

function expenseKey(description: string, cost: string, shares: ListedShare[]): string {
  const shareKey = shares
    .map((share) => `${share.user_id}:${toCents(String(share.paid_share ?? ""))}:${toCents(String(share.owed_share ?? ""))}`)
    .sort()
    .join("|");
  return `${description.trim()}|${toCents(cost)}|${shareKey}`;
}

/** Flattened create_expense body for one Draft; this is the only shape Commit sends. */
export function draftToCreateExpensePayload(draft: Draft, groupId: number): ExpensePayload {
  const payload: ExpensePayload = {
    group_id: groupId,
    cost: draft.amount,
    description: draft.description,
    currency_code: draft.currency_code,
  };
  draft.shares.forEach((share, index) => {
    payload[`users__${index}__user_id`] = share.user_id;
    payload[`users__${index}__paid_share`] = share.paid_share;
    payload[`users__${index}__owed_share`] = share.owed_share;
  });
  return payload;
}

/** Identifies exactly what Commit would send for these Drafts, so a confirmed batch can be matched to the one shown. */
export function batchFingerprint(drafts: Draft[]): string {
  const batch = drafts
    .filter((d) => d.status !== "committed")
    .map((d) => [d.id, d.description, d.amount, d.currency_code, d.shares.map((s) => [s.user_id, s.paid_share, s.owed_share])]);
  return createHash("sha256").update(JSON.stringify(batch)).digest("hex");
}

/** The exact text the agent quotes: Expense, amount, payer, and every owed share. */
export function describeDraft(draft: Draft, group: Group): string {
  const names = new Map(group.members.map((m) => [m.id, fullName(m)]));
  const nameOf = (id: number) => names.get(id) ?? "unknown member";
  const payer = draft.shares.find((s) => (toCents(s.paid_share) ?? 0) > 0);
  const owed = draft.shares.map((s) => toCents(s.owed_share) ?? 0);
  const split = Math.max(...owed) - Math.min(...owed) < owed.length ? "split equally" : "split by shares";
  const owedText = draft.shares.map((s) => `${nameOf(s.user_id)} $${s.owed_share}`).join(", ");
  return `${draft.description} $${draft.amount}, paid by ${payer ? nameOf(payer.user_id) : "someone"}, ${split}: ${owedText}`;
}

export function fullName(member: Member): string {
  return [member.first_name, member.last_name].filter(Boolean).join(" ");
}

function normalize(name: string): string {
  return name.toLocaleLowerCase().replace(/^@/, "").split(/\s+/).filter(Boolean).join(" ");
}

/** Cents for a decimal string, rounding half up past two places; null when not a decimal. */
function toCents(value: string): number | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const digits = fraction.padEnd(3, "0");
  const cents = Number(whole) * 100 + Number(digits.slice(0, 2)) + (Number(digits[2]) >= 5 ? 1 : 0);
  return sign ? -cents : cents;
}

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
