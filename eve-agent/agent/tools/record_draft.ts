import { randomUUID } from "node:crypto";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { buildDraft, describeDraft } from "../lib/money";
import { session } from "../lib/session";
import { splitwiseFromEnv } from "../lib/splitwise";

export default defineTool({
  description:
    "Record one NEW shared Expense as a Draft, once its amount is stated. Never use it for an Expense that already has a Draft. " +
    "Names are checked against the Splitwise group; if a name is unknown or ambiguous, the call fails with the member list.",
  inputSchema: z.object({
    description: z.string().min(1).describe("Short title, e.g. 'Pizza'."),
    amount: z.string().optional().describe("Total cost exactly as stated, e.g. '30' or '12.50'. Omit if no amount was stated."),
    payer: z.string().optional().describe("Who paid: 'me' for the sender (the default), else their name."),
    participants: z.array(z.string()).describe("Everyone else sharing the cost besides the payer; 'me' for the sender."),
  }),
  async execute(input, ctx) {
    const { client, demoUserId } = splitwiseFromEnv();
    const group = await client.getGroup();
    const caller = ctx.session.auth.current;
    const messageId = caller?.attributes.message_id;
    const draft = buildDraft(input, group, demoUserId, {
      id: randomUUID(),
      now: new Date().toISOString(),
      source: { id: typeof messageId === "string" ? messageId : "", sender: caller?.subject ?? "" },
    });
    session.update((s) => ({ ...s, drafts: [...s.drafts, draft] }));
    return { draft, summary: `Draft: ${describeDraft(draft, group)}. Group: ${group.name}.` };
  },
});
