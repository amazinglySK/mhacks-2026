import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { asksAQuestion, listening } from "../shared";

export default defineEval({
  description: "An Expense without an amount is asked about, never guessed.",
  async test(t) {
    const turn = await (await listening(t)).send("I got pizza for Alex and Maya, split equally.");

    t.succeeded();
    t.calledTool("record_draft", { count: 0 });
    t.check(turn.message, asksAQuestion);
    t.check(turn.message, includes(/how much|amount|cost/i));
  },
});
