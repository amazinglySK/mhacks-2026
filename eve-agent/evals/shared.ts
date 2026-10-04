import type { EveEvalContext, EveEvalToolCall } from "eve/evals";
import { satisfies } from "eve/evals/expect";

export const START = "@agent start listening";
export const STOP = "@agent stop listening";
export const REVIEW = "what do you got @agent?";
export const PIZZA = "I paid $30 for pizza with Alex and Maya, split equally.";
export const CHANGE_PIZZA = "Actually make the pizza $36.";
export const GAS = "I paid $20 for gas with Alex, split equally.";
export const COMMIT = "commit";

/** True when commit_batch sent at least one Splitwise create. */
export function sentACreate(output: unknown): boolean {
  const created = (output as { created?: unknown } | undefined)?.created;
  return Array.isArray(created) && created.length > 0;
}

/** The judging-script create: one $36 Pizza, demo user paid, three $12 owed shares. */
export function isPizza36Create(payload: unknown): boolean {
  const created = payload as {
    description?: string;
    cost?: string;
    users__0__user_id?: number;
    users__0__paid_share?: string;
    users__0__owed_share?: string;
    users__1__owed_share?: string;
    users__2__owed_share?: string;
  };
  return (
    created.description === "Pizza" &&
    created.cost === "36.00" &&
    created.users__0__user_id === 100 &&
    created.users__0__paid_share === "36.00" &&
    created.users__0__owed_share === "12.00" &&
    created.users__1__owed_share === "12.00" &&
    created.users__2__owed_share === "12.00"
  );
}

export const PIZZA_SHARES = [
  { user_id: 100, paid_share: "30.00", owed_share: "10.00" },
  { user_id: 101, paid_share: "0.00", owed_share: "10.00" },
  { user_id: 102, paid_share: "0.00", owed_share: "10.00" },
];

export const PIZZA_36_SHARES = [
  { user_id: 100, paid_share: "36.00", owed_share: "12.00" },
  { user_id: 101, paid_share: "0.00", owed_share: "12.00" },
  { user_id: 102, paid_share: "0.00", owed_share: "12.00" },
];

/** A new conversation with an active Listening Session. */
export async function listening(t: EveEvalContext) {
  return (await t.send(START)).session;
}

/** The turn's only tool call was stop_session, so nothing could reach Splitwise beyond its group read. */
export const onlyStopped = satisfies(
  (calls: readonly EveEvalToolCall[]) => calls.length > 0 && calls.every((c) => c.name === "stop_session"),
  "only stop_session ran",
);

export const noReply = satisfies((message: string | undefined) => !message?.trim(), "no reply");

export const asksAQuestion = satisfies((message: string | undefined) => Boolean(message?.includes("?")), "asks a question");
