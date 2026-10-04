import type { ExpensePayload, Group, Member } from "./money";

const SPLITWISE_API = "https://secure.splitwise.com/api/v3.0";
const HTTP_TIMEOUT_MS = 20_000;

export interface SplitwiseClient {
  getGroup(): Promise<Group>;
  /** Creates one Expense; succeeds only with no errors object and a returned Expense ID. */
  createExpense(payload: ExpensePayload): Promise<number>;
}

export type Splitwise = { client: SplitwiseClient; demoUserId: number };

export class SplitwiseError extends Error {}

/** The demo group the in-memory fake serves; evals use it so they never touch the real group. */
export const FAKE_DEMO_USER_ID = 100;
export const FAKE_GROUP: Group = {
  id: 4242,
  name: "MHacks Weekend",
  members: [
    { id: 100, first_name: "Demo", last_name: "User" },
    { id: 101, first_name: "Alex", last_name: null },
    { id: 102, first_name: "Maya", last_name: "Lee" },
    { id: 103, first_name: "Ishan", last_name: null },
    { id: 104, first_name: "Yash", last_name: null },
  ],
};

/**
 * The Splitwise client chosen by SPLITWISE_CLIENT: "http" for the real mapped group, "fake" for
 * the seeded in-memory group. Errors name missing settings, never their values.
 */
export function splitwiseFromEnv(env: NodeJS.ProcessEnv = process.env): Splitwise {
  const mode = env.SPLITWISE_CLIENT?.trim();
  if (mode === "fake") {
    let nextId = 9001;
    return {
      client: {
        getGroup: async () => structuredClone(FAKE_GROUP),
        async createExpense() {
          return nextId++;
        },
      },
      demoUserId: FAKE_DEMO_USER_ID,
    };
  }
  if (mode !== "http") throw new SplitwiseError('SPLITWISE_CLIENT must be "http" or "fake".');

  const names = ["SPLITWISE_API_KEY", "SPLITWISE_GROUP_ID", "DEMO_USER_SPLITWISE_ID"] as const;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length > 0) throw new SplitwiseError(`Missing configuration: ${missing.join(", ")}.`);
  const notNumeric = names.slice(1).filter((name) => !/^\d+$/.test(env[name]!.trim()));
  if (notNumeric.length > 0) throw new SplitwiseError(`Not numeric: ${notNumeric.join(", ")}.`);

  const client = httpSplitwise(env.SPLITWISE_API_KEY!.trim(), Number(env.SPLITWISE_GROUP_ID));
  return { client, demoUserId: Number(env.DEMO_USER_SPLITWISE_ID) };
}

/** Real Splitwise HTTP client. `fetchImpl` is for tests; production uses global fetch. */
export function httpSplitwise(apiKey: string, groupId: number, fetchImpl: typeof fetch = fetch): SplitwiseClient {
  const headers = { Authorization: `Bearer ${apiKey}` };
  return {
    async getGroup() {
      const response = await fetchImpl(`${SPLITWISE_API}/get_group/${groupId}`, {
        headers,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, any>;
      // Splitwise can report application errors with HTTP 200.
      if (!response.ok || hasErrors(body.errors) || body.error) {
        throw new SplitwiseError(`get_group failed (HTTP ${response.status})`);
      }
      const group = body.group;
      if (!group || !Array.isArray(group.members)) throw new SplitwiseError("get_group returned no group");
      return {
        id: group.id,
        name: String(group.name ?? ""),
        members: group.members.map(
          (m: Record<string, unknown>): Member => ({
            id: Number(m.id),
            first_name: typeof m.first_name === "string" ? m.first_name : null,
            last_name: typeof m.last_name === "string" ? m.last_name : null,
          }),
        ),
      };
    },
    async createExpense(payload) {
      const response = await fetchImpl(`${SPLITWISE_API}/create_expense`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, any>;
      // Splitwise can report application errors with HTTP 200.
      if (hasErrors(body.errors) || body.error) {
        throw new SplitwiseError(`create_expense rejected: ${errorText(body.errors || body.error)}`);
      }
      const expenses = body.expenses;
      const expenseId = Array.isArray(expenses) && expenses[0] ? expenses[0].id : null;
      if (!response.ok || typeof expenseId !== "number") {
        throw new SplitwiseError(`create_expense returned no Expense ID (HTTP ${response.status})`);
      }
      return expenseId;
    },
  };
}

function errorText(errors: unknown): string {
  if (typeof errors === "string") return errors;
  if (Array.isArray(errors)) return errors.map(String).join("; ");
  if (errors && typeof errors === "object") {
    return Object.values(errors as Record<string, unknown>)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map(String)
      .join("; ");
  }
  return "unknown error";
}

function hasErrors(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return true;
}
