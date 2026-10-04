import { defineEval } from "eve/evals";
import { asksAQuestion, GAS, listening, PIZZA } from "../shared";

export default defineEval({
  description: "An ambiguous Modification asks which Draft and changes nothing.",
  async test(t) {
    const pizza = await (await listening(t)).send(PIZZA);
    const gas = await pizza.session.send(GAS);
    const change = await gas.session.send("Actually make it $36.");

    t.succeeded();
    t.calledTool("record_draft", { count: 2 });
    t.calledTool("modify_draft", { count: 0 });
    t.check(change.message, asksAQuestion);
  },
});
