import { describe, expect, test } from "bun:test";
import { reduceInbound, type InboundLike } from "./dm";

const DEMO_DM = "any;-;+15550000000";

function message(overrides: Partial<InboundLike> = {}): InboundLike {
  return {
    id: "msg-1",
    platform: "imessage",
    direction: "inbound",
    space: { id: DEMO_DM },
    sender: { id: "+15550000000" },
    content: { type: "text", text: "@agent hello" },
    ...overrides,
  };
}

describe("reduceInbound", () => {
  test("reduces a text message from the configured DM to the minimal envelope", () => {
    expect(reduceInbound(message(), DEMO_DM)).toEqual({
      ok: true,
      message: { messageId: "msg-1", sender: "+15550000000", text: "@agent hello" },
    });
  });

  test("rejects messages from any other DM", () => {
    expect(reduceInbound(message({ space: { id: "any;-;+15559999999" } }), DEMO_DM)).toEqual({
      ok: false,
      reason: "other_space",
    });
  });

  test("rejects the agent's own outbound echoes", () => {
    expect(reduceInbound(message({ direction: "outbound" }), DEMO_DM)).toEqual({ ok: false, reason: "outbound" });
  });

  test("rejects non-text content", () => {
    expect(reduceInbound(message({ content: { type: "reaction" } }), DEMO_DM)).toEqual({
      ok: false,
      reason: "not_text",
    });
  });

  test("rejects messages without a sender, which the Draft audit reference needs", () => {
    expect(reduceInbound(message({ sender: undefined }), DEMO_DM)).toEqual({ ok: false, reason: "no_sender" });
  });

  test("rejects other platforms", () => {
    expect(reduceInbound(message({ platform: "terminal" }), DEMO_DM)).toEqual({ ok: false, reason: "other_platform" });
  });
});
