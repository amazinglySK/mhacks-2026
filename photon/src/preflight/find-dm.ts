// Setup helper: text the Photon line from the demo phone; this prints that conversation's DEMO_DM_ID.
import { loadPhotonCredentials } from "../config";
import { connectPhoton } from "../runtime";

const app = await connectPhoton(loadPhotonCredentials());
console.log("Connected. Text the Photon line from the demo phone now (Ctrl+C to quit).");

for await (const [space, message] of app.messages) {
  if (message.platform !== "imessage" || message.direction === "outbound") continue;
  const type = "type" in space ? String(space.type) : "unknown";
  console.log(`Message received in a ${type} conversation. Put this in photon/.env:`);
  console.log(`DEMO_DM_ID=${space.id}`);
}
