import { defineDynamic, defineInstructions } from "eve/instructions";
import { session } from "../lib/session";

const STATUS = {
  none: "No Listening Session is active.",
  active: "A Listening Session is active.",
  stopped: "The Listening Session is stopped; its batch is under review and can't change.",
};

export default defineDynamic({
  events: {
    "turn.started": () => {
      const { status, drafts } = session.get();
      const lines = (drafts ?? []).map((d) => {
        const shares = d.shares.map((s) => `${s.user_id} paid ${s.paid_share} owed ${s.owed_share}`).join("; ");
        const source = d.source_messages.map((m) => m.id).join(", ");
        return `- ${d.id}: ${d.description} ${d.currency_code} $${d.amount} [${shares}] (${d.status}, from message ${source})`;
      });
      const draftText = lines.length > 0 ? `Current Drafts:\n${lines.join("\n")}` : "There are no Drafts.";
      return defineInstructions({ content: `# Session now\n\n${STATUS[status] ?? STATUS.none}\n${draftText}` });
    },
  },
});
