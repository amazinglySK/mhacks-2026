import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { asksAQuestion } from "../shared";

export default defineEval({
  description: "A Participant who isn't in the group blocks the Draft and leads to a question.",
  async test(t) {
    const turn = await t.send("I paid $30 for pizza with Alex and Zed, split equally.");

    t.succeeded();
    t.calledTool("record_draft", { count: 0 });
    t.check(turn.message, asksAQuestion);
    t.check(turn.message, includes("Zed"));
  },
});
