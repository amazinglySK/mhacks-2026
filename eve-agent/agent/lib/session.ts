import { defineState } from "eve/context";
import type { Draft } from "./money";

export const session = defineState("shared-money.session", () => ({
  drafts: [] as Draft[],
}));
