import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { listening, PIZZA, RESET, REVIEW, START } from "../shared";

export default defineEval({
  description: "Reset clears an uncommitted Draft and the Listening Session.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const reset = await pizza.session.send(RESET);
    const review = await (await reset.session.send(START)).session.send(REVIEW);

    t.succeeded();
    t.calledTool("reset_session", { output: { status: "none" }, count: 1 });
    t.calledTool("record_draft", { count: 1 });
    t.check(reset.message, includes(/reset/i)).label("reset is acknowledged");
    t.check(review.message, includes(/No Drafts/i)).label("review after reset has no Draft");
  },
});
