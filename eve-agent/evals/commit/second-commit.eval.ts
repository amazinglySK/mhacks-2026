import { defineEval } from "eve/evals";
import { CHANGE_PIZZA, COMMIT, listening, PIZZA, REVIEW, sentACreate, STOP } from "../shared";

export default defineEval({
  description: "A second commit performs no additional Splitwise create.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const change = await pizza.session.send(CHANGE_PIZZA);
    const review = await change.session.send(REVIEW);
    const stop = await review.session.send(STOP);
    const first = await stop.session.send(COMMIT);
    await first.session.send(COMMIT);

    t.succeeded();
    t.calledTool("commit_batch", { output: sentACreate, count: 1 });
  },
});
