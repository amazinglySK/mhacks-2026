import { ConfigError, loadConfig, sensitiveValues } from "./config";
import { reduceInbound } from "./dm";
import { log, logError, redact } from "./log";
import { connectPhoton, connectReasoningAgent, openDemoDm, pollReplies } from "./runtime";

async function main() {
  const config = loadConfig();
  redact(sensitiveValues(config));
  log("config_valid", { photon_credentials: config.photon.kind });

  const link = await connectReasoningAgent(config);
  log("reasoning_agent_connected");

  const app = await connectPhoton(config);
  const dm = await openDemoDm(app, config);
  log("demo_dm_reachable");

  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  void pollReplies(link, async (text) => void (await dm.send(text)), stop.signal);

  log("listening");
  for await (const [, message] of app.messages) {
    const reduced = reduceInbound(message, config.demoDmId);
    if (!reduced.ok) {
      if (reduced.reason !== "outbound") log("message_rejected", { reason: reduced.reason });
      continue;
    }
    try {
      await link.send(reduced.message);
      log("message_forwarded");
    } catch (error) {
      logError("message_forward_failed", error);
    }
  }
}

main().catch((error) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    logError("startup_failed", error);
  }
  process.exit(1);
});
