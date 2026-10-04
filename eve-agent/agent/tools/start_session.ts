import { defineTool } from "eve/tools";
import { z } from "zod";
import { startListening } from "../lib/listening";
import { session } from "../lib/session";

export default defineTool({
  description: "Start a Listening Session when the user asks you to start listening, or report that one is already active.",
  inputSchema: z.object({}),
  async execute() {
    const outcome = startListening(session.get());
    session.update(() => outcome.session);
    return { status: outcome.session.status, summary: outcome.summary };
  },
});
