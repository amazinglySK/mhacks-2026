import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { CHANGE_PIZZA, listening, PIZZA, STOP } from "../shared";

export default defineEval({
  description: "A Modification after stopping is rejected and changes nothing.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const stop = await pizza.session.send(STOP);
    const change = await stop.session.send(CHANGE_PIZZA);

    t.succeeded();
    t.calledTool("record_draft", { count: 1 });
    t.calledTool("modify_draft", { count: 0 });
    t.calledTool("stop_session", { output: { status: "stopped" }, count: 1 });
    t.check(change.message, includes(/stopped/i)).label("reply says the batch is stopped");
  },
});
