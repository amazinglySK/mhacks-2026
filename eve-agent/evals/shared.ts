import type { EveEvalContext, EveEvalToolCall } from "eve/evals";
import { satisfies } from "eve/evals/expect";

export const START = "@agent start listening";
export const STOP = "@agent stop listening";
export const REVIEW = "what do you got @agent?";
export const PIZZA = "I paid $30 for pizza with Alex and Maya, split equally.";

export const PIZZA_SHARES = [
  { user_id: 100, paid_share: "30.00", owed_share: "10.00" },
  { user_id: 101, paid_share: "0.00", owed_share: "10.00" },
  { user_id: 102, paid_share: "0.00", owed_share: "10.00" },
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
