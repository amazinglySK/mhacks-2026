// Preflight: one Agentverse mailbox round trip through the hosted Reasoning Agent,
// which also reads the mapped Splitwise group and calls ASI:One before replying.
import { loadConfig } from "../config";
import { connectReasoningAgent } from "../runtime";

const TIMEOUT_MS = 90_000;

const config = loadConfig();
const link = await connectReasoningAgent(config);
console.log("Almanac resolution and Photon mailbox access ok.");

await link.send({ messageId: `preflight-${crypto.randomUUID()}`, sender: "preflight", text: "@agent preflight" });
console.log("SUBMIT ok. Waiting for the Reasoning Agent reply...");

const deadline = Date.now() + TIMEOUT_MS;
while (Date.now() < deadline) {
  const [reply] = await link.receive();
  if (reply) {
    console.log(`REPLY: ${reply}`);
    console.log("Agentverse mailbox preflight PASSED.");
    process.exit(0);
  }
  await Bun.sleep(1000);
}
console.error("No reply from the Reasoning Agent within 90 seconds.");
process.exit(1);
