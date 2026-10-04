import { defineTool } from "eve/tools";
import { z } from "zod";
import { commitBatch } from "../lib/listening";
import { session } from "../lib/session";
import { splitwiseFromEnv } from "../lib/splitwise";

export default defineTool({
  description:
    "Write the reviewed batch to Splitwise after the user confirms it, including the literal word commit. " +
    "Only works when the Listening Session is stopped and the batch is the one that was shown. " +
    "This is the only tool that writes to Splitwise. Never use it for a new Expense or a change, " +
    "and never use it for a non-confirming reply such as 'sounds good'.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const caller = ctx.session.auth.current;
    const messageId = caller?.attributes.message_id;
    const outcome = await commitBatch(
      session.get(),
      typeof messageId === "string" ? messageId : "",
      splitwiseFromEnv().client,
      new Date().toISOString(),
    );
    session.update(() => outcome.session);
    return {
      status: outcome.session.status,
      summary: outcome.summary,
      created: outcome.created ?? [],
    };
  },
});
