import { defineEval } from "eve/evals";
import { sentACreate, listening, PIZZA, STOP } from "../shared";

export default defineEval({
  description: "A non-confirming reply after stop performs no Splitwise create.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const stop = await pizza.session.send(STOP);
    await stop.session.send("sounds good");

    t.succeeded();
    t.calledTool("stop_session", { output: { status: "stopped" }, count: 1 });
    t.calledTool("commit_batch", { output: sentACreate, count: 0 });
    t.calledTool("record_draft", { count: 1 });
  },
});
