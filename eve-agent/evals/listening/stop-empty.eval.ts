import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { listening, onlyStopped, STOP } from "../shared";

export default defineEval({
  description: "Stopping an empty session ends cleanly with no Splitwise write.",
  async test(t) {
    const stop = await (await listening(t)).send(STOP);

    t.succeeded();
    t.calledTool("stop_session", {
      output: (output: any) => output.status === "none" && /no Drafts/i.test(output.summary),
      count: 1,
    });
    t.check(stop.toolCalls, onlyStopped);
    t.check(stop.message, includes(/nothing to record/i));
  },
});
