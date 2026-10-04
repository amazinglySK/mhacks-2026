import { photonIMessageChannel } from "eve/channels/photon";

async function photonCredentials() {
  const projectId = process.env.IMESSAGE_PROJECT_ID;
  const projectSecret = process.env.IMESSAGE_PROJECT_SECRET;
  if (!projectId || !projectSecret) throw new Error("Photon project credentials are required.");
  return { projectId, projectSecret };
}

export default photonIMessageChannel({
  credentials: photonCredentials,
  webhookSecret: process.env.IMESSAGE_WEBHOOK_SECRET,
  turnPolicy: "queue",
  // Photon stops typing on a timer that never fires once a serverless turn ends, so a
  // no_reply turn would leave the bubble up forever. These replace the defaults that start it.
  events: {
    async "turn.started"(_event, ctx) {
      Object.assign(ctx.state, {
        pendingToolCallMessage: null,
        anchorMessageId: null,
        lastEditAtMs: null,
        streamStepIndex: null,
      });
    },
    async "actions.requested"(_event, ctx) {
      ctx.state.pendingToolCallMessage = null;
    },
  },
});
