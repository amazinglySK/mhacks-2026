import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bech32 } from "bech32";

secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);
secp.hashes.sha256 = sha256;

// Signatures (64 bytes) encode past bech32's default 90-character limit.
const BECH32_LIMIT = 1023;
const encoder = new TextEncoder();

export interface AgentIdentity {
  readonly address: string;
  readonly publicKey: Uint8Array;
  signDigest(digest: Uint8Array): string;
}

function encodeBech32(prefix: string, bytes: Uint8Array): string {
  return bech32.encode(prefix, bech32.toWords(bytes), BECH32_LIMIT);
}

function decodeBech32(value: string): { prefix: string; bytes: Uint8Array } {
  const { prefix, words } = bech32.decode(value, BECH32_LIMIT);
  return { prefix, bytes: Uint8Array.from(bech32.fromWords(words)) };
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Mirrors `uagents_core.identity.Identity.from_seed(seed, 0)`. */
function deriveSecretKey(seed: string): Uint8Array {
  const derivation = sha256(concat(encoder.encode("agent"), Uint8Array.of(0)));
  return sha256(concat(derivation, sha256(encoder.encode(seed))));
}

export function identityFromSeed(seed: string): AgentIdentity {
  const secretKey = deriveSecretKey(seed);
  const publicKey = secp.getPublicKey(secretKey, true);
  return {
    address: encodeBech32("agent", publicKey),
    publicKey,
    signDigest: (digest) =>
      encodeBech32("sig", secp.sign(digest, secretKey, { prehash: false })),
  };
}

export function verifyDigest(address: string, digest: Uint8Array, signature: string): boolean {
  try {
    const key = decodeBech32(address);
    const sig = decodeBech32(signature);
    if (key.prefix !== "agent" || sig.prefix !== "sig") return false;
    return secp.verify(sig.bytes, digest, key.bytes, { prehash: false, lowS: false });
  } catch {
    return false;
  }
}

/** Mirrors `uagents_core.storage.compute_attestation`, used as `Authorization: Agent <attestation>`. */
export function computeAttestation(
  identity: AgentIdentity,
  validFromSeconds: number,
  validitySeconds: number,
  nonce: Uint8Array,
): string {
  if (nonce.length !== 32) throw new Error("Attestation nonce must be 32 bytes");
  const window = new Uint8Array(16);
  const view = new DataView(window.buffer);
  view.setBigUint64(0, BigInt(validFromSeconds));
  view.setBigUint64(8, BigInt(validFromSeconds + validitySeconds));
  const payload = concat(identity.publicKey, window, nonce);
  const signature = identity.signDigest(sha256(payload));
  return `attr:${Buffer.from(payload).toString("base64")}:${signature}`;
}
