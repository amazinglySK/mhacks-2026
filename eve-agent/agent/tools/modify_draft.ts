import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertActive, modifyDraft } from "../lib/listening";
import { applyDraftChanges, describeDraft, DraftError } from "../lib/money";
import { session } from "../lib/session";
import { splitwiseFromEnv } from "../lib/splitwise";

export default defineTool({
  description:
    "Update an existing Draft in place. Only works in an active Listening Session. " +
    "Use this when the user changes an Expense that already has a Draft; never create a second Draft for it. " +
    "Names are checked against the Splitwise group; if a name is unknown or ambiguous, the call fails with the member list.",
  inputSchema: z.object({
    draft_id: z.string().min(1).describe("The id of the Draft to change, from Session now."),
    description: z.string().min(1).optional().describe("New short title, if it changed."),
    amount: z.string().optional().describe("New total cost exactly as stated, e.g. '36' or '12.50'."),
    payer: z.string().optional().describe("New payer, if it changed: 'me' for the sender, else their name."),
    participants: z.array(z.string()).optional().describe("New people sharing the cost besides the payer, if the split changed."),
  }),
  async execute(input, ctx) {
    const current = session.get();
    assertActive(current);
    const existing = current.drafts.find((draft) => draft.id === input.draft_id);
    if (!existing) {
      const known = current.drafts.map((draft) => `${draft.id} (${draft.description})`).join(", ");
      throw new DraftError(
        `No Draft ${input.draft_id} in this session, so nothing was changed. Current Drafts: ${known || "none"}. Ask which Draft they meant.`,
      );
    }
    const { client, demoUserId } = splitwiseFromEnv();
    const group = await client.getGroup();
    const caller = ctx.session.auth.current;
    const messageId = caller?.attributes.message_id;
    const draft = applyDraftChanges(
      existing,
      {
        description: input.description,
        amount: input.amount,
        payer: input.payer,
        participants: input.participants,
      },
      group,
      demoUserId,
      {
        now: new Date().toISOString(),
        source: { id: typeof messageId === "string" ? messageId : "", sender: caller?.subject ?? "" },
      },
    );
    session.update((s) => modifyDraft(s, draft));
    return { draft, summary: `Draft: ${describeDraft(draft, group)}. Group: ${group.name}.` };
  },
});
