import { sha256 } from "@noble/hashes/sha2.js";
import { verifyDigest, type AgentIdentity } from "./identity";

/** Wire shape of a uagents `Envelope`. */
export interface Envelope {
  version: number;
  sender: string;
  target: string;
  session: string;
  schema_digest: string;
  protocol_digest?: string | null;
  payload?: string | null;
  expires?: number | null;
  nonce?: number | null;
  signature?: string | null;
}

const encoder = new TextEncoder();

function uint64(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
  return bytes;
}

/** Mirrors `uagents_core.envelope.Envelope._digest`. */
export function envelopeDigest(envelope: Envelope): Uint8Array {
  const hasher = sha256.create();
  hasher.update(encoder.encode(envelope.sender));
  hasher.update(encoder.encode(envelope.target));
  hasher.update(encoder.encode(envelope.session));
  hasher.update(encoder.encode(envelope.schema_digest));
  if (envelope.payload != null) hasher.update(encoder.encode(envelope.payload));
  if (envelope.expires != null) hasher.update(uint64(envelope.expires));
  if (envelope.nonce != null) hasher.update(uint64(envelope.nonce));
  return hasher.digest();
}

export function signEnvelope(identity: AgentIdentity, envelope: Envelope): Envelope {
  const unsigned = { ...envelope, sender: identity.address, signature: null };
  return { ...unsigned, signature: identity.signDigest(envelopeDigest(unsigned)) };
}

export function verifyEnvelope(envelope: Envelope): boolean {
  if (!envelope.signature) return false;
  return verifyDigest(envelope.sender, envelopeDigest(envelope), envelope.signature);
}

export function encodePayload(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

export function decodePayload(envelope: Envelope): unknown {
  if (!envelope.payload) return undefined;
  return JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
}
