import { satisfies } from "eve/evals/expect";

export const PIZZA = "I paid $30 for pizza with Alex and Maya, split equally.";

export const PIZZA_SHARES = [
  { user_id: 100, paid_share: "30.00", owed_share: "10.00" },
  { user_id: 101, paid_share: "0.00", owed_share: "10.00" },
  { user_id: 102, paid_share: "0.00", owed_share: "10.00" },
];

export const noReply = satisfies((message: string | undefined) => !message?.trim(), "no reply");

export const asksAQuestion = satisfies((message: string | undefined) => Boolean(message?.includes("?")), "asks a question");
