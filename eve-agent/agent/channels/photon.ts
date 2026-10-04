import { defaultPhotonAuth, photonIMessageChannel } from "eve/channels/photon";
import { allowConversation, requireConfig } from "../lib/config";

async function photonCredentials() {
  const { projectId, projectSecret } = requireConfig();
  return { projectId, projectSecret };
}

export default photonIMessageChannel({
  credentials: photonCredentials,
  webhookSecret: process.env.IMESSAGE_WEBHOOK_SECRET,
  turnPolicy: "queue",
  // Tools read the source message ID from the turn's auth, so a Draft never depends on the model echoing it.
  // Conversations other than the configured DM never reach the model or session history.
  onMessage(ctx, message) {
    const { demoDmId } = requireConfig();
    if (!allowConversation(ctx.thread.id, demoDmId)) return null;
    const auth = defaultPhotonAuth(message);
    return { auth: { ...auth, attributes: { ...auth.attributes, message_id: message.id } } };
  },
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
