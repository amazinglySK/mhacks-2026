import { beforeEach, describe, expect, test } from "bun:test";
import { identityFromSeed } from "./identity";
import { decodePayload, encodePayload, signEnvelope, verifyEnvelope, type Envelope } from "./envelope";
import { CHAT_ACK_SCHEMA_DIGEST, CHAT_MESSAGE_SCHEMA_DIGEST, CHAT_PROTOCOL_DIGEST, ReasoningAgentLink } from "./link";

const AGENTVERSE = "https://agentverse.test";
const HOSTED_ENDPOINT = "https://agentverse.test/v1/hosting/submit";
const photon = identityFromSeed("photon-test-seed");
const reasoning = identityFromSeed("reasoning-test-seed");
const stranger = identityFromSeed("stranger-test-seed");

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

let calls: Call[];
let mailbox: { uuid: string; envelope: Envelope }[];
let almanacStatus: number;
let mailboxStatus: number;

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  calls.push({ method, url, headers, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (url === `${AGENTVERSE}/v1/almanac/agents/${reasoning.address}`) {
    return Response.json({ endpoints: [{ url: HOSTED_ENDPOINT, weight: 1 }], expiry: "2099-01-01T00:00:00Z" }, { status: almanacStatus });
  }
  if (url === `${AGENTVERSE}/v2/agents/${photon.address}/mailbox` && method === "GET") {
    return Response.json(
      mailbox.map((item) => ({ ...item, received_at: "2026-10-03T00:00:00Z", expires_at: "2026-10-04T00:00:00Z" })),
      { status: mailboxStatus },
    );
  }
  if (url.startsWith(`${AGENTVERSE}/v2/agents/${photon.address}/mailbox/`) && method === "DELETE") {
    return new Response(null, { status: 200 });
  }
  if (url === HOSTED_ENDPOINT && method === "POST") return Response.json({});
  return new Response("unexpected", { status: 500 });
}) as typeof fetch;

function link() {
  return new ReasoningAgentLink({
    identity: photon,
    reasoningAgentAddress: reasoning.address,
    agentverseUrl: AGENTVERSE,
    fetch: fakeFetch,
  });
}

function replyFrom(sender: typeof reasoning, text: string, uuid: string = crypto.randomUUID()) {
  const envelope = signEnvelope(sender, {
    version: 1,
    sender: sender.address,
    target: photon.address,
    session: crypto.randomUUID(),
    schema_digest: CHAT_MESSAGE_SCHEMA_DIGEST,
    protocol_digest: CHAT_PROTOCOL_DIGEST,
    payload: encodePayload({
      timestamp: new Date().toISOString(),
      msg_id: crypto.randomUUID(),
      content: [{ type: "text", text }],
    }),
  });
  return { uuid, envelope };
}

beforeEach(() => {
  calls = [];
  mailbox = [];
  almanacStatus = 200;
  mailboxStatus = 200;
});

describe("ReasoningAgentLink", () => {
  test("connect resolves the hosted agent endpoint and checks the Photon mailbox", async () => {
    await link().connect();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${AGENTVERSE}/v1/almanac/agents/${reasoning.address}`,
      `GET ${AGENTVERSE}/v2/agents/${photon.address}/mailbox`,
    ]);
    expect(calls[1]!.headers.authorization).toStartWith("Agent attr:");
  });

  test("connect fails when the Reasoning Agent is not registered", async () => {
    almanacStatus = 404;
    expect(link().connect()).rejects.toThrow(/Reasoning Agent/);
  });

  test("connect fails when the Photon mailbox does not exist", async () => {
    mailboxStatus = 404;
    expect(link().connect()).rejects.toThrow(/mailbox/);
  });

  test("send submits a signed chat message carrying only the minimal envelope", async () => {
    const l = link();
    await l.connect();
    await l.send({ messageId: "msg-1", sender: "+15550000000", text: "@agent hello" });

    const submit = calls.find((c) => c.url === HOSTED_ENDPOINT)!;
    const envelope = submit.body as Envelope;
    expect(envelope.sender).toBe(photon.address);
    expect(envelope.target).toBe(reasoning.address);
    expect(envelope.schema_digest).toBe(CHAT_MESSAGE_SCHEMA_DIGEST);
    expect(envelope.protocol_digest).toBe(CHAT_PROTOCOL_DIGEST);
    expect(verifyEnvelope(envelope)).toBe(true);
    const chat = decodePayload(envelope) as { content: unknown[] };
    expect(chat.content).toEqual([
      { type: "metadata", metadata: { kind: "dm_message", message_id: "msg-1", sender: "+15550000000" } },
      { type: "text", text: "@agent hello" },
    ]);
  });

  test("receive returns reply text from the Reasoning Agent, acknowledges it, and deletes it", async () => {
    const l = link();
    await l.connect();
    mailbox = [replyFrom(reasoning, "Hi from MHacks Weekend", "uuid-1")];

    expect(await l.receive()).toEqual(["Hi from MHacks Weekend"]);
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/mailbox/uuid-1"))).toBe(true);
    const ack = calls.find((c) => c.url === HOSTED_ENDPOINT)!.body as Envelope;
    expect(ack.schema_digest).toBe(CHAT_ACK_SCHEMA_DIGEST);
  });

  test("receive drops envelopes that are unsigned or not from the Reasoning Agent", async () => {
    const l = link();
    await l.connect();
    const forged = replyFrom(reasoning, "forged", "uuid-forged");
    forged.envelope = { ...forged.envelope, signature: replyFrom(stranger, "x").envelope.signature };
    mailbox = [replyFrom(stranger, "spoof", "uuid-stranger"), forged];

    expect(await l.receive()).toEqual([]);
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(2);
    expect(calls.some((c) => c.url === HOSTED_ENDPOINT)).toBe(false);
  });
});
