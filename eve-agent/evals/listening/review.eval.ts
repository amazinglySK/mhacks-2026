import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { listening, PIZZA, REVIEW } from "../shared";

export default defineEval({
  description: "The summary lists the current Draft and the mapped group.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const review = await pizza.session.send(REVIEW);

    t.succeeded();
    t.calledTool("get_session_summary", {
      output: (output: any) => output.status === "active" && /MHacks Weekend/.test(output.summary) && /Pizza \$30\.00/.test(output.summary),
      count: 1,
    });
    for (const fact of ["MHacks Weekend", "Pizza", "$30.00"]) {
      t.check(review.message, includes(fact)).label(`summary states ${fact}`);
    }
  },
});
