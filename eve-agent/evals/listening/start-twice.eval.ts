import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { START } from "../shared";

export default defineEval({
  description: "Starting twice reports the existing Listening Session.",
  async test(t) {
    const first = await t.send(START);
    const second = await first.session.send(START);

    t.succeeded();
    t.calledTool("start_session", { output: { status: "active" }, count: 2 });
    t.check(first.message, includes(/started/i)).label("first start is acknowledged");
    t.check(second.message, includes(/already active/i)).label("second start reports the existing session");
  },
});
