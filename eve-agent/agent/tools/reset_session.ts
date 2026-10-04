import { defineTool } from "eve/tools";
import { z } from "zod";
import { resetListening } from "../lib/listening";
import { session } from "../lib/session";

export default defineTool({
  description:
    "Reset the demo when the user asks to reset. Clears the Listening Session and uncommitted Drafts. " +
    "Keeps committed Splitwise mappings and handled confirmation IDs so a real write is never forgotten or repeated.",
  inputSchema: z.object({}),
  async execute() {
    const outcome = resetListening(session.get());
    session.update(() => outcome.session);
    return {
      status: outcome.session.status,
      summary: outcome.summary,
      committed_count: outcome.session.committed.length,
    };
  },
});
