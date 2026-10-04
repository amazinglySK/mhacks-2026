import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { identityFromSeed } from "./agentverse/identity";
import { ReasoningAgentLink } from "./agentverse/link";
import type { Config } from "./config";
import { logError, log } from "./log";

export const POLL_INTERVAL_MS = 1000;

export async function connectPhoton(config: Config) {
  const shared = { telemetry: false, options: { logLevel: "warn" as const } };
  if (config.photon.kind === "project") {
    return Spectrum({
      ...shared,
      projectId: config.photon.projectId,
      projectSecret: config.photon.projectSecret,
      providers: [imessage.config()],
    });
  }
  return Spectrum({ ...shared, providers: [imessage.config({ clients: [config.photon.client] })] });
}

export type PhotonApp = Awaited<ReturnType<typeof connectPhoton>>;

/** Throws when the configured DM cannot be resolved on the Photon line. */
export async function openDemoDm(app: PhotonApp, config: Config) {
  return imessage(app).space.get(config.demoDmId);
}

export async function connectReasoningAgent(config: Config): Promise<ReasoningAgentLink> {
  const link = new ReasoningAgentLink({
    identity: identityFromSeed(config.photonAgentSeed),
    reasoningAgentAddress: config.reasoningAgentAddress,
    agentverseUrl: config.agentverseUrl,
  });
  await link.connect();
  return link;
}

/** Polls Photon's mailbox until `signal` aborts, handing each reply to `onReply`. */
export async function pollReplies(
  link: ReasoningAgentLink,
  onReply: (text: string) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      for (const text of await link.receive()) {
        await onReply(text);
        log("reply_delivered");
      }
    } catch (error) {
      logError("mailbox_poll_failed", error);
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }
}
