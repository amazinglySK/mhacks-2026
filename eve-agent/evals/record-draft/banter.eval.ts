import { defineEval } from "eve/evals";
import { noReply, PIZZA } from "../shared";

export default defineEval({
  description: "Banter and agreement after the pizza Draft get no reply and no second Draft.",
  async test(t) {
    const pizza = await t.send(PIZZA);
    const banter = await pizza.session.send("Lol ishan u need to up your food recommendation dude");
    const agreement = await banter.session.send("See, yash also agrees");

    t.succeeded();
    t.check(banter.message, noReply).label("banter gets no reply");
    t.check(agreement.message, noReply).label("agreement gets no reply");
    t.calledTool("record_draft", { count: 1 });
  },
});
