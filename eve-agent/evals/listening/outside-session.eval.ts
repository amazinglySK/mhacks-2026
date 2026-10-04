import { defineEval } from "eve/evals";
import { noReply, PIZZA } from "../shared";

export default defineEval({
  description: "Outside a Listening Session, an Expense that doesn't address the agent gets no reply and no Draft.",
  async test(t) {
    const turn = await t.send(PIZZA);

    t.succeeded();
    t.check(turn.message, noReply);
    t.calledTool("record_draft", { count: 0 });
    t.notCalledTool("start_session");
  },
});
