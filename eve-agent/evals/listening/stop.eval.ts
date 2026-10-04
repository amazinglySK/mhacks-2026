import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { listening, onlyStopped, PIZZA, STOP } from "../shared";

export default defineEval({
  description: "Stopping returns the final batch and writes nothing to Splitwise.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const stop = await pizza.session.send(STOP);

    t.succeeded();
    t.calledTool("stop_session", {
      output: (output: any) => output.status === "stopped" && /Pizza \$30\.00/.test(output.summary),
      count: 1,
    });
    t.check(stop.toolCalls, onlyStopped);
    for (const fact of ["MHacks Weekend", "Pizza", "$30.00"]) {
      t.check(stop.message, includes(fact)).label(`final batch states ${fact}`);
    }
  },
});
