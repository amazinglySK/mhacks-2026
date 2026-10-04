// Preflight: one Photon send and one receive in the configured DM.
import { loadConfig } from "../config";
import { reduceInbound } from "../dm";
import { connectPhoton, openDemoDm } from "../runtime";

const TIMEOUT_MS = 120_000;

const config = loadConfig();
const app = await connectPhoton(config.photon);
const dm = await openDemoDm(app, config);
const sentAt = new Date();
await dm.send("Photon preflight: reply to this message with anything.");
console.log("SEND ok. Waiting for a reply in the demo DM...");

const timer = setTimeout(() => {
  console.error("RECEIVE failed: no reply from the demo DM within 2 minutes.");
  process.exit(1);
}, TIMEOUT_MS);

for await (const [, message] of app.messages) {
  if (!reduceInbound(message, config.demoDmId).ok || message.timestamp < sentAt) continue;
  clearTimeout(timer);
  console.log("RECEIVE ok. Photon send/receive PASSED.");
  await app.stop();
  process.exit(0);
}
