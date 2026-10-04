import { defineTool } from "eve/tools";
import { z } from "zod";
import { session } from "../lib/session";

export default defineTool({
  description: "Record one NEW shared Expense as a Draft, once its amount is stated. Never use it for an Expense that already has a Draft.",
  inputSchema: z.object({
    description: z.string().min(1).describe("Short title, e.g. 'Pizza'."),
    amount: z.string().min(1).describe("Total cost as stated, e.g. '30' or '12.50'."),
    payer: z.string().min(1).describe("'me' if the sender paid, else the payer's name."),
    participants: z.array(z.string()).describe("Everyone else sharing the cost besides the payer."),
  }),
  execute(input) {
    const { nextId } = session.get();
    const draft = { id: nextId, ...input };
    session.update((s) => ({ drafts: [...s.drafts, draft], nextId: s.nextId + 1 }));
    return { draft, summary: `Draft ${draft.id}: ${draft.description} $${draft.amount}, paid by ${draft.payer}, split equally with ${draft.participants.join(", ")}.` };
  },
});
