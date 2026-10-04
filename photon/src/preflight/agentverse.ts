// Preflight: one Agentverse mailbox round trip through the hosted Reasoning Agent,
// which also reads the mapped Splitwise group and calls ASI:One before replying.
import { loadConfig } from "../config";
import { connectReasoningAgent } from "../runtime";

const TIMEOUT_MS = 90_000;
const EXPECTED_GROUP = "MHacks Weekend";

const config = loadConfig();
const link = await connectReasoningAgent(config);
console.log("Almanac resolution and Photon mailbox access ok.");

await link.send({ messageId: `preflight-${crypto.randomUUID()}`, sender: "preflight", text: "@splitty preflight" });
console.log("SUBMIT ok. Waiting for the Reasoning Agent reply...");

let reply: string | undefined;
const deadline = Date.now() + TIMEOUT_MS;
while (!reply && Date.now() < deadline) {
  await link.receive(async (text) => void (reply ??= text));
  if (!reply) await Bun.sleep(1000);
}

if (!reply) {
  console.error("Agentverse mailbox round trip FAILED: no reply within 90 seconds.");
  process.exit(1);
}
console.log("Agentverse mailbox round trip PASSED.");

const group = /^PREFLIGHT OK group="([^"]*)" demo_user_member=yes asi1=yes$/.exec(reply)?.[1];
if (group !== EXPECTED_GROUP) {
  console.error(`Splitwise group read FAILED. Reasoning Agent replied: ${reply}`);
  process.exit(1);
}
console.log(`Splitwise group read and ASI:One call PASSED (group "${group}").`);
