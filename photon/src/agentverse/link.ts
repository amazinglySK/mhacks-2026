import type { DmMessage } from "../dm";
import { decodePayload, encodePayload, signEnvelope, verifyEnvelope, type Envelope } from "./envelope";
import { computeAttestation, type AgentIdentity } from "./identity";

// Agent Chat Protocol digests, computed with uagents_core 0.4.11.
export const CHAT_PROTOCOL_DIGEST = "proto:30a801ed3a83f9a0ff0a9f1e6fe958cb91da1fc2218b153df7b6cbf87bd33d62";
export const CHAT_MESSAGE_SCHEMA_DIGEST = "model:2601825997203ee07dbb9ff6e7c71ae7bdaf6a7c8b817361f2f88f4b29c68d0c";
export const CHAT_ACK_SCHEMA_DIGEST = "model:741eb75692abbeb43c131e364ad939af23f14e8288ba0ec3df130843ef79bd7f";

const ATTESTATION_VALIDITY_SECONDS = 300;

interface StoredEnvelope {
  uuid: string;
  envelope: Envelope;
}

interface ChatMessagePayload {
  msg_id: string;
  content: { type: string; text?: string }[];
}

export interface ReasoningAgentLinkOptions {
  identity: AgentIdentity;
  reasoningAgentAddress: string;
  agentverseUrl: string;
  fetch?: typeof fetch;
}

/**
 * Talks to the hosted Reasoning Agent as a signed Agentverse mailbox agent:
 * submits Agent Chat Protocol messages to its endpoint and polls Photon's own mailbox for replies.
 */
export class ReasoningAgentLink {
  private readonly identity: AgentIdentity;
  private readonly target: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly session = crypto.randomUUID();
  private endpoint: string | undefined;

  constructor(options: ReasoningAgentLinkOptions) {
    this.identity = options.identity;
    this.target = options.reasoningAgentAddress;
    this.baseUrl = options.agentverseUrl.replace(/\/$/, "");
    this.fetch = options.fetch ?? fetch;
  }

  get address(): string {
    return this.identity.address;
  }

  async connect(): Promise<void> {
    const resolved = await this.fetch(`${this.baseUrl}/v1/almanac/agents/${this.target}`);
    if (!resolved.ok) {
      throw new Error(`Reasoning Agent is not resolvable on the Almanac (HTTP ${resolved.status})`);
    }
    const agent = (await resolved.json()) as { endpoints?: { url: string }[] };
    this.endpoint = agent.endpoints?.[0]?.url;
    if (!this.endpoint) throw new Error("Reasoning Agent has no registered endpoint");

    const mailbox = await this.mailboxRequest("GET", "");
    if (mailbox.status === 404) {
      throw new Error("Photon mailbox not found on Agentverse; run `bun run register` first");
    }
    if (!mailbox.ok) throw new Error(`Photon mailbox check failed (HTTP ${mailbox.status})`);
  }

  async send(message: DmMessage): Promise<void> {
    await this.submit(CHAT_MESSAGE_SCHEMA_DIGEST, {
      timestamp: new Date().toISOString(),
      msg_id: crypto.randomUUID(),
      content: [
        { type: "metadata", metadata: { kind: "dm_message", message_id: message.messageId, sender: message.sender } },
        { type: "text", text: message.text },
      ],
    });
  }

  /** One mailbox poll. Returns reply texts from the Reasoning Agent; everything else is discarded. */
  async receive(): Promise<string[]> {
    const response = await this.mailboxRequest("GET", "");
    if (!response.ok) throw new Error(`Photon mailbox poll failed (HTTP ${response.status})`);
    const items = (await response.json()) as StoredEnvelope[];

    const replies: string[] = [];
    for (const { uuid, envelope } of items) {
      await this.mailboxRequest("DELETE", `/${uuid}`);
      if (envelope.sender !== this.target || !verifyEnvelope(envelope)) continue;
      if (envelope.schema_digest !== CHAT_MESSAGE_SCHEMA_DIGEST) continue;

      const chat = decodePayload(envelope) as ChatMessagePayload;
      await this.submit(CHAT_ACK_SCHEMA_DIGEST, {
        timestamp: new Date().toISOString(),
        acknowledged_msg_id: chat.msg_id,
        metadata: null,
      });
      const text = chat.content
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("");
      if (text) replies.push(text);
    }
    return replies;
  }

  private async submit(schemaDigest: string, message: unknown): Promise<void> {
    if (!this.endpoint) throw new Error("ReasoningAgentLink.connect() must succeed before sending");
    const envelope = signEnvelope(this.identity, {
      version: 1,
      sender: this.identity.address,
      target: this.target,
      session: this.session,
      schema_digest: schemaDigest,
      protocol_digest: CHAT_PROTOCOL_DIGEST,
      payload: encodePayload(message),
    });
    const response = await this.fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });
    if (!response.ok) throw new Error(`Envelope submit failed (HTTP ${response.status})`);
  }

  private mailboxRequest(method: "GET" | "DELETE", suffix: string): Promise<Response> {
    const attestation = computeAttestation(
      this.identity,
      Math.floor(Date.now() / 1000),
      ATTESTATION_VALIDITY_SECONDS,
      crypto.getRandomValues(new Uint8Array(32)),
    );
    return this.fetch(`${this.baseUrl}/v2/agents/${this.identity.address}/mailbox${suffix}`, {
      method,
      headers: { authorization: `Agent ${attestation}` },
    });
  }
}
