import type { Group, Member } from "./money";

const SPLITWISE_API = "https://secure.splitwise.com/api/v3.0";
const HTTP_TIMEOUT_MS = 20_000;

export interface SplitwiseClient {
  getGroup(): Promise<Group>;
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
  if (mode === "fake") return { client: { getGroup: async () => structuredClone(FAKE_GROUP) }, demoUserId: FAKE_DEMO_USER_ID };
  if (mode !== "http") throw new SplitwiseError('SPLITWISE_CLIENT must be "http" or "fake".');

  const names = ["SPLITWISE_API_KEY", "SPLITWISE_GROUP_ID", "DEMO_USER_SPLITWISE_ID"] as const;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length > 0) throw new SplitwiseError(`Missing configuration: ${missing.join(", ")}.`);
  const notNumeric = names.slice(1).filter((name) => !/^\d+$/.test(env[name]!.trim()));
  if (notNumeric.length > 0) throw new SplitwiseError(`Not numeric: ${notNumeric.join(", ")}.`);

  const client = httpSplitwise(env.SPLITWISE_API_KEY!.trim(), Number(env.SPLITWISE_GROUP_ID));
  return { client, demoUserId: Number(env.DEMO_USER_SPLITWISE_ID) };
}

function httpSplitwise(apiKey: string, groupId: number): SplitwiseClient {
  return {
    async getGroup() {
      const response = await fetch(`${SPLITWISE_API}/get_group/${groupId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
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
  };
}

function hasErrors(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return true;
}
