import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { PIZZA, PIZZA_SHARES } from "../shared";

export default defineEval({
  description: "The pizza message records exactly one Draft and the reply quotes its summary facts.",
  async test(t) {
    const turn = await t.send(PIZZA);

    t.succeeded();
    t.calledTool("record_draft", {
      count: 1,
      output: (output: any) =>
        output.draft.amount === "30.00" &&
        output.draft.status === "draft" &&
        JSON.stringify(output.draft.shares) === JSON.stringify(PIZZA_SHARES),
    });
    for (const fact of ["Pizza", "$30.00", "Demo User", "Alex", "Maya Lee", "$10.00"]) {
      t.check(turn.message, includes(fact)).label(`reply states ${fact}`);
    }
  },
});
