import { describe, expect, test } from "bun:test";
import { computeAttestation, identityFromSeed, verifyDigest } from "./identity";
import { envelopeDigest, signEnvelope, verifyEnvelope, type Envelope } from "./envelope";

// Produced by uagents_core 0.4.11 for a throwaway seed.
const fixture = {
  seed: "photon-runtime-test-seed-not-a-secret",
  address: "agent1qfcvs4waedwtp3gsyy6y3v6mdd2csv3k07ktuac69x6jc2c608y96mn6ca7",
  envelope: {
    version: 1,
    sender: "agent1qfcvs4waedwtp3gsyy6y3v6mdd2csv3k07ktuac69x6jc2c608y96mn6ca7",
    target: "agent1qtestfixturetarget",
    session: "2f1f3d6e-6a62-4c55-9a9f-5d2d5a1c9b11",
    schema_digest: "model:2601825997203ee07dbb9ff6e7c71ae7bdaf6a7c8b817361f2f88f4b29c68d0c",
    protocol_digest: null,
    payload: "eyJoZWxsbyI6IndvcmxkIn0=",
    expires: 1790000000,
    nonce: 7,
    signature:
      "sig10v3whaed4mcwanrcp7xegkatpxh554r5a3d63pz7cs4nw4hdzpqsc0s9u2u5c4ddl07lep0dsdmjv5edxcrqg48lv2pylwc4xrnrxjgdnnkmq",
  } satisfies Envelope,
  digestHex: "f715d177db509d19402244c4b9a2f2a4544feb40a2a3da8900bd0ac6eae78b06",
  attestation:
    "attr:AnDIVd3LXLDFECE0SLNba1WIMjZ/rL53Gim1LCsaechdAAAAAGqxO4AAAAAAarE/aAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4f:sig1typf270kr36752huquaqaj8sxnqu7yurc3r0szgkjlvav7xqgjnrk7s6wkh2fzfr9w458ejjuayzz6xfdxnrvgu8h8xw3k3yrc9nq6saeskjh",
};

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("agent identity", () => {
  test("derives the same address as uagents from a seed", () => {
    expect(identityFromSeed(fixture.seed).address).toBe(fixture.address);
  });

  test("computes the uagents envelope digest", () => {
    expect(toHex(envelopeDigest(fixture.envelope))).toBe(fixture.digestHex);
  });

  test("accepts an envelope signed by uagents", () => {
    expect(verifyEnvelope(fixture.envelope)).toBe(true);
  });

  test("signs envelopes that verify against the sender address", () => {
    const identity = identityFromSeed(fixture.seed);
    const signed = signEnvelope(identity, { ...fixture.envelope, signature: null });
    expect(signed.signature).toStartWith("sig1");
    expect(verifyEnvelope(signed)).toBe(true);
    expect(verifyEnvelope({ ...signed, payload: "dGFtcGVyZWQ=" })).toBe(false);
  });

  test("builds an attestation with the uagents payload layout", () => {
    const identity = identityFromSeed(fixture.seed);
    const nonce = Uint8Array.from({ length: 32 }, (_, i) => i);
    const attestation = computeAttestation(identity, 1790000000, 1000, nonce);
    const [prefix, payload, signature] = attestation.split(":");
    const [, expectedPayload, expectedSignature] = fixture.attestation.split(":");
    expect(prefix).toBe("attr");
    expect(payload).toBe(expectedPayload!);
    const digest = new Uint8Array(new Bun.CryptoHasher("sha256").update(Buffer.from(payload!, "base64")).digest());
    expect(verifyDigest(fixture.address, digest, signature!)).toBe(true);
    expect(verifyDigest(fixture.address, digest, expectedSignature!)).toBe(true);
  });
});
