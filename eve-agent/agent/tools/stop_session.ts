import { defineTool } from "eve/tools";
import { z } from "zod";
import { stopListening } from "../lib/listening";
import { session } from "../lib/session";
import { splitwiseFromEnv } from "../lib/splitwise";

export default defineTool({
  description:
    "Stop the Listening Session when the user asks you to stop listening, and return the final batch of Drafts. " +
    "Never writes to Splitwise. A stopped session can't take new Drafts or be resumed.",
  inputSchema: z.object({}),
  async execute() {
    const outcome = await stopListening(session.get(), splitwiseFromEnv().client);
    session.update(() => outcome.session);
    return { status: outcome.session.status, summary: outcome.summary };
  },
});
