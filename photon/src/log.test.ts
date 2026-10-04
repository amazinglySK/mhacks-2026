import { afterEach, expect, spyOn, test } from "bun:test";
import { logError, redact } from "./log";

afterEach(() => redact([]));

test("logError masks configured identifiers inside third-party error messages", () => {
  const spy = spyOn(console, "error").mockImplementation(() => {});
  redact(["any;-;+15550000000", "+15550000000", "tok-secret"]);

  logError("startup_failed", new Error("space any;-;+15550000000 not found (token tok-secret)"));

  const line = String(spy.mock.calls[0]![0]);
  expect(line).not.toContain("+15550000000");
  expect(line).not.toContain("tok-secret");
  expect(line).toContain("[redacted]");
  spy.mockRestore();
});
