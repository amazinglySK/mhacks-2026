import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { CHANGE_PIZZA, listening, PIZZA, PIZZA_36_SHARES } from "../shared";

export default defineEval({
  description: "Making the pizza $36 updates the existing Draft in place and quotes the new shares.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const change = await pizza.session.send(CHANGE_PIZZA);

    t.succeeded();
    t.calledTool("record_draft", { count: 1 });
    t.calledTool("modify_draft", {
      count: 1,
      output: (output: any) =>
        output.draft.amount === "36.00" &&
        output.draft.status === "draft" &&
        JSON.stringify(output.draft.shares) === JSON.stringify(PIZZA_36_SHARES),
    });
    for (const fact of ["Pizza", "$36.00", "Demo User", "Alex", "Maya Lee", "$12.00"]) {
      t.check(change.message, includes(fact)).label(`reply states ${fact}`);
    }
  },
});
