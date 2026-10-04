import { describe, expect, test } from "bun:test";
import { ConfigError, loadConfig, loadPhotonCredentials, sensitiveValues } from "./config";

const base = {
  DEMO_DM_ID: "any;-;+15550000000",
  PHOTON_AGENT_SEED: "a-long-random-seed-phrase",
  REASONING_AGENT_ADDRESS: "agent1qreasoning",
};

describe("loadConfig", () => {
  test("accepts explicit Photon cloud client credentials", () => {
    const config = loadConfig({
      ...base,
      PHOTON_ADDRESS: "line.example.com:443",
      PHOTON_TOKEN: "tok",
      PHOTON_PHONE: "+15551111111",
    });
    expect(config.photon).toEqual({
      kind: "client",
      client: { address: "line.example.com:443", token: "tok", phone: "+15551111111" },
    });
    expect(config.demoDmId).toBe(base.DEMO_DM_ID);
    expect(config.reasoningAgentAddress).toBe(base.REASONING_AGENT_ADDRESS);
  });

  test("accepts Photon project credentials", () => {
    const config = loadConfig({ ...base, PHOTON_PROJECT_ID: "p", PHOTON_PROJECT_SECRET: "s" });
    expect(config.photon).toEqual({ kind: "project", projectId: "p", projectSecret: "s" });
  });

  test("fails naming every missing variable without echoing values", () => {
    const secret = "super-secret-token-value";
    let error: unknown;
    try {
      loadConfig({ PHOTON_TOKEN: secret, DEMO_DM_ID: "  " });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as Error).message;
    for (const name of [
      "DEMO_DM_ID",
      "PHOTON_AGENT_SEED",
      "REASONING_AGENT_ADDRESS",
      "PHOTON_ADDRESS",
      "PHOTON_PHONE",
    ]) {
      expect(message).toContain(name);
    }
    expect(message).not.toContain(secret);
  });

  test("lists the DM handle and secrets as sensitive", () => {
    const config = loadConfig({ ...base, PHOTON_ADDRESS: "a", PHOTON_TOKEN: "tok", PHOTON_PHONE: "+15551111111" });
    expect(sensitiveValues(config)).toEqual(
      expect.arrayContaining([base.DEMO_DM_ID, "+15550000000", base.PHOTON_AGENT_SEED, "tok", "+15551111111"]),
    );
  });

  test("loads Photon credentials alone before the DM is known", () => {
    expect(loadPhotonCredentials({ PHOTON_PROJECT_ID: "p", PHOTON_PROJECT_SECRET: "s" })).toEqual({
      kind: "project",
      projectId: "p",
      projectSecret: "s",
    });
    expect(() => loadPhotonCredentials({})).toThrow(ConfigError);
  });

  test("requires one complete set of Photon credentials", () => {
    expect(() => loadConfig(base)).toThrow(/PHOTON_PROJECT_ID.*PHOTON_ADDRESS|PHOTON_ADDRESS.*PHOTON_PROJECT_ID/s);
  });
});
