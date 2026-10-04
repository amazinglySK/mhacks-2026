import assert from "node:assert/strict";
import { test } from "node:test";
import { allowConversation, ConfigError, requireConfig } from "../agent/lib/config.ts";

const DEMO_DM = "any;-;+15550000000";

const live = {
  ASI1_API_KEY: "asi-secret-value",
  IMESSAGE_PROJECT_ID: "proj",
  IMESSAGE_PROJECT_SECRET: "photon-secret-value",
  IMESSAGE_WEBHOOK_SECRET: "webhook-secret-value",
  DEMO_DM_ID: DEMO_DM,
  SPLITWISE_API_KEY: "sw-secret-value",
  SPLITWISE_GROUP_ID: "4242",
  DEMO_USER_SPLITWISE_ID: "100",
};

test("the configured DM is accepted and any other conversation is dropped", () => {
  assert.equal(allowConversation(DEMO_DM, DEMO_DM), true);
  assert.equal(allowConversation("iMessage;-;+15550000000", DEMO_DM), true);
  assert.equal(allowConversation("any;-;+15559999999", DEMO_DM), false);
});

test("missing required configuration names the setting without its value", () => {
  const secret = "super-secret-key-value";
  assert.throws(
    () => requireConfig({ ASI1_API_KEY: secret, IMESSAGE_PROJECT_SECRET: secret }),
    (error) => {
      assert.ok(error instanceof ConfigError);
      for (const name of [
        "IMESSAGE_PROJECT_ID",
        "IMESSAGE_WEBHOOK_SECRET",
        "DEMO_DM_ID",
        "SPLITWISE_API_KEY",
        "SPLITWISE_GROUP_ID",
        "DEMO_USER_SPLITWISE_ID",
      ]) {
        assert.match(error.message, new RegExp(name));
      }
      assert.doesNotMatch(error.message, /super-secret-key-value/);
      return true;
    },
  );
});

test("fake Splitwise does not require the live Splitwise keys", () => {
  const config = requireConfig({
    ASI1_API_KEY: "k",
    IMESSAGE_PROJECT_ID: "p",
    IMESSAGE_PROJECT_SECRET: "s",
    IMESSAGE_WEBHOOK_SECRET: "w",
    DEMO_DM_ID: DEMO_DM,
    SPLITWISE_CLIENT: "fake",
  });
  assert.equal(config.demoDmId, DEMO_DM);
});

test("complete live configuration is accepted", () => {
  const config = requireConfig(live);
  assert.equal(config.demoDmId, DEMO_DM);
});
