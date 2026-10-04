import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { listening, PIZZA, STOP } from "../shared";

export default defineEval({
  description: "An Expense stated after stopping creates no Draft.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const stop = await pizza.session.send(STOP);
    const after = await stop.session.send("I paid $20 for gas with Alex, split equally.");

    t.succeeded();
    t.calledTool("record_draft", { count: 1 });
    t.calledTool("stop_session", { output: { status: "stopped" }, count: 1 });
    t.check(after.message, includes(/stopped/i)).label("reply says the batch is stopped");
  },
});
