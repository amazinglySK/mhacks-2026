import { defineState } from "eve/context";

export type Draft = {
  id: number;
  description: string;
  amount: string;
  payer: string;
  participants: string[];
};

export const session = defineState("shared-money.session", () => ({
  drafts: [] as Draft[],
  nextId: 1,
}));
