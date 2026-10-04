import { defineEval } from "eve/evals";
import { COMMIT, listening, PIZZA, RESET, sentACreate, STOP } from "../shared";

export default defineEval({
  description: "After reset, a committed mapping is kept and replaying commit creates nothing.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const stop = await pizza.session.send(STOP);
    const commit = await stop.session.send(COMMIT);
    const reset = await commit.session.send(RESET);
    await reset.session.send(COMMIT);

    t.succeeded();
    t.calledTool("reset_session", {
      count: 1,
      output: (output: unknown) => {
        const result = output as { status?: string; committed_count?: number };
        return result.status === "none" && result.committed_count === 1;
      },
    });
    t.calledTool("commit_batch", { output: sentACreate, count: 1 });
  },
});
