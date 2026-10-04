import { defineEval } from "eve/evals";
import { COMMIT, listening, PIZZA, sentACreate } from "../shared";

export default defineEval({
  description: "Commit before stop is refused and writes nothing.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    await pizza.session.send(COMMIT);

    t.succeeded();
    t.calledTool("record_draft", { count: 1 });
    t.calledTool("stop_session", { count: 0 });
    t.calledTool("commit_batch", { output: sentACreate, count: 0 });
  },
});
