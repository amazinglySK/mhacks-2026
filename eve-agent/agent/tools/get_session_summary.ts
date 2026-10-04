import { defineTool } from "eve/tools";
import { z } from "zod";
import { summarizeSession } from "../lib/listening";
import { session } from "../lib/session";
import { splitwiseFromEnv } from "../lib/splitwise";

export default defineTool({
  description: "List every Draft in the Listening Session and the Splitwise group, when the user asks what you have so far.",
  inputSchema: z.object({}),
  async execute() {
    const outcome = await summarizeSession(session.get(), splitwiseFromEnv().client);
    session.update(() => outcome.session);
    return { status: outcome.session.status, summary: outcome.summary };
  },
});
