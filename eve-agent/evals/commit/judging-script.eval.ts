import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { CHANGE_PIZZA, COMMIT, isPizza36Create, listening, PIZZA, PIZZA_36_SHARES, REVIEW, sentACreate, STOP } from "../shared";

export default defineEval({
  description: "The 13-step judging script ends with one $36 Pizza create and three $12 owed shares.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const change = await pizza.session.send(CHANGE_PIZZA);
    const review = await change.session.send(REVIEW);
    const stop = await review.session.send(STOP);
    const commit = await stop.session.send(COMMIT);

    t.succeeded();
    t.calledTool("record_draft", { count: 1 });
    t.calledTool("modify_draft", {
      count: 1,
      output: (output: any) => output.draft.amount === "36.00" && JSON.stringify(output.draft.shares) === JSON.stringify(PIZZA_36_SHARES),
    });
    t.calledTool("commit_batch", {
      count: 1,
      output: (output: any) =>
        Array.isArray(output.created) && output.created.length === 1 && isPizza36Create(output.created[0]),
    });
    t.calledTool("commit_batch", { output: sentACreate, count: 1 });
    for (const fact of ["Pizza", "$36.00", "Splitwise"]) {
      t.check(commit.message, includes(fact)).label(`commit reply states ${fact}`);
    }
  },
});
