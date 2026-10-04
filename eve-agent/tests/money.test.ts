import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDraftChanges, batchFingerprint, buildDraft, commitDrafts, describeDraft, draftToCreateExpensePayload, DraftError, equalShares, parseAmount, validateDraft } from "../agent/lib/money.ts";
import type { ExpenseInput, ExpensePayload, Group } from "../agent/lib/money.ts";
import { SplitwiseError } from "../agent/lib/splitwise.ts";

const DEMO_USER = 100;
const GROUP: Group = {
  id: 4242,
  name: "MHacks Weekend",
  members: [
    { id: 100, first_name: "Demo", last_name: "User" },
    { id: 101, first_name: "Alex", last_name: null },
    { id: 102, first_name: "Maya", last_name: "Lee" },
    { id: 103, first_name: "Sam", last_name: "Park" },
    { id: 104, first_name: "Sam", last_name: "Ortiz" },
  ],
};
const META = { id: "d1", now: "2026-10-04T06:00:00.000Z", source: { id: "m1", sender: "+15550100" } };

function draft(input: Partial<ExpenseInput>) {
  return buildDraft({ description: "Pizza", amount: "30", participants: ["Alex", "Maya"], ...input }, GROUP, DEMO_USER, META);
}

function rejection(input: Partial<ExpenseInput>): string {
  try {
    draft(input);
  } catch (error) {
    assert.ok(error instanceof DraftError);
    return error.message;
  }
  assert.fail("expected the Draft to be rejected");
}

test("equal shares put the whole cost on the payer's paid share", () => {
  assert.deepEqual(equalShares(3000, 100, [100, 101, 102]), [
    { user_id: 100, paid_share: "30.00", owed_share: "10.00" },
    { user_id: 101, paid_share: "0.00", owed_share: "10.00" },
    { user_id: 102, paid_share: "0.00", owed_share: "10.00" },
  ]);
});

test("the rounding remainder goes to the payer's owed share", () => {
  const shares = equalShares(1000, 100, [100, 101, 102]);
  assert.deepEqual(shares.map((s) => s.owed_share), ["3.34", "3.33", "3.33"]);
  assert.deepEqual(validateDraft({ amount: "10.00", shares }), []);
});

test("the pizza message becomes one Draft with three $10 owed shares and the demo user as payer", () => {
  const pizza = draft({ payer: "me" });

  assert.equal(pizza.amount, "30.00");
  assert.equal(pizza.status, "draft");
  assert.deepEqual(pizza.shares, equalShares(3000, 100, [100, 101, 102]));
  assert.deepEqual(pizza.source_messages, [{ id: "m1", sender: "+15550100" }]);
  assert.equal(
    describeDraft(pizza, GROUP),
    "Pizza $30.00, paid by Demo User, split equally: Demo User $10.00, Alex $10.00, Maya Lee $10.00",
  );
});

test("the sender pays when no payer is named", () => {
  assert.equal(draft({ payer: undefined }).shares[0].user_id, DEMO_USER);
});

test("a named payer pays and the sender is a Participant", () => {
  const gas = draft({ description: "Gas", amount: "20", payer: "Alex", participants: ["me"] });

  assert.deepEqual(gas.shares, [
    { user_id: 101, paid_share: "20.00", owed_share: "10.00" },
    { user_id: 100, paid_share: "0.00", owed_share: "10.00" },
  ]);
});

test("names match first or full name, ignoring case, spacing, and a leading @", () => {
  const taxi = draft({ participants: ["sam  PARK", "@maya"] });

  assert.deepEqual(taxi.shares.map((s) => s.user_id), [100, 103, 102]);
});

test("a Participant named twice is counted once", () => {
  assert.equal(draft({ participants: ["Alex", "alex", "me"] }).shares.length, 2);
});

for (const amount of [undefined, "", "abc", "0", "-5"]) {
  test(`a missing or invalid amount (${JSON.stringify(amount)}) is asked for, never guessed`, () => {
    assert.match(rejection({ amount }), /Ask how much/);
  });
}

test("amounts are read as stated and rounded to the cent", () => {
  assert.equal(parseAmount("$1,200"), 120000);
  assert.equal(parseAmount("12.5"), 1250);
  assert.equal(parseAmount("12.345"), 1235);
});

test("an unknown Participant blocks the Draft and lists the group members", () => {
  const message = rejection({ participants: ["Zed"] });

  assert.match(message, /Zed is not in MHacks Weekend/);
  assert.match(message, /Demo User, Alex, Maya Lee, Sam Park, Sam Ortiz/);
});

test("an ambiguous first name blocks the Draft and names the choices", () => {
  assert.match(rejection({ participants: ["Sam"] }), /Sam: Sam Park or Sam Ortiz/);
});

test("an Expense nobody shares with the payer is rejected", () => {
  assert.match(rejection({ participants: ["me"] }), /Ask who split it/);
});

test("an amount too small to split is rejected before it becomes a Draft", () => {
  assert.match(rejection({ amount: "0.03", participants: ["Alex", "Maya", "Sam Park", "Sam Ortiz"] }), /a share is negative/);
});

test("the batch fingerprint changes when what Commit would send changes", () => {
  const pizza = draft({});
  const pricier = draft({ amount: "36" });

  assert.equal(batchFingerprint([pizza]), batchFingerprint([structuredClone(pizza)]));
  assert.notEqual(batchFingerprint([pizza]), batchFingerprint([pricier]));
  assert.notEqual(batchFingerprint([pizza]), batchFingerprint([pizza, { ...pricier, id: "d2" }]));
  assert.notEqual(batchFingerprint([pizza]), batchFingerprint([{ ...pizza, description: "Pasta" }]));
});

test("the batch fingerprint ignores committed Drafts and timestamps", () => {
  const pizza = draft({});
  const committed = { ...draft({ amount: "12" }), id: "d0", status: "committed" as const };

  assert.equal(batchFingerprint([pizza]), batchFingerprint([committed, { ...pizza, updated_at: "2026-10-04T07:00:00.000Z" }]));
});

test("validation catches unbalanced and negative shares", () => {
  const shares = equalShares(3000, 100, [100, 101, 102]);
  shares[1] = { ...shares[1], owed_share: "-10.00" };

  assert.deepEqual(validateDraft({ amount: "30.00", shares }), ["owed shares don't add up to the cost", "a share is negative"]);
});

test("changing the pizza amount recomputes three $12 owed shares and keeps the Draft id", () => {
  const pizza = draft({});
  const changed = applyDraftChanges(pizza, { amount: "36" }, GROUP, DEMO_USER, {
    now: "2026-10-04T06:05:00.000Z",
    source: { id: "m2", sender: "+15550100" },
  });

  assert.equal(changed.id, pizza.id);
  assert.equal(changed.status, "draft");
  assert.equal(changed.description, "Pizza");
  assert.equal(changed.amount, "36.00");
  assert.deepEqual(changed.shares, equalShares(3600, 100, [100, 101, 102]));
  assert.equal(changed.created_at, pizza.created_at);
  assert.equal(changed.updated_at, "2026-10-04T06:05:00.000Z");
  assert.deepEqual(changed.source_messages, [
    { id: "m1", sender: "+15550100" },
    { id: "m2", sender: "+15550100" },
  ]);
  assert.equal(
    describeDraft(changed, GROUP),
    "Pizza $36.00, paid by Demo User, split equally: Demo User $12.00, Alex $12.00, Maya Lee $12.00",
  );
});

test("a Modification that changes Participants resolves names and recomputes shares", () => {
  const pizza = draft({});
  const changed = applyDraftChanges(pizza, { participants: ["Alex", "Sam Park"] }, GROUP, DEMO_USER, {
    now: "2026-10-04T06:05:00.000Z",
    source: { id: "m2", sender: "+15550100" },
  });

  assert.equal(changed.id, pizza.id);
  assert.deepEqual(changed.shares, equalShares(3000, 100, [100, 101, 103]));
});

test("a Modification with an unknown Participant blocks the change", () => {
  const pizza = draft({});

  assert.throws(
    () =>
      applyDraftChanges(pizza, { participants: ["Zed"] }, GROUP, DEMO_USER, {
        now: "2026-10-04T06:05:00.000Z",
        source: { id: "m2", sender: "+15550100" },
      }),
    (error) => error instanceof DraftError && /Zed is not in MHacks Weekend/.test(error.message),
  );
});

function recordingClient(outcomes: Array<number | Error> = []) {
  const creates: ExpensePayload[] = [];
  let index = 0;
  return {
    creates,
    async createExpense(payload: ExpensePayload) {
      creates.push(payload);
      const outcome = outcomes[index++];
      if (outcome instanceof Error) throw outcome;
      return outcome ?? 9000 + creates.length;
    },
  };
}

test("a Draft flattens to Splitwise by-shares create fields", () => {
  assert.deepEqual(draftToCreateExpensePayload(draft({}), 4242), {
    group_id: 4242,
    cost: "30.00",
    description: "Pizza",
    currency_code: "USD",
    users__0__user_id: 100,
    users__0__paid_share: "30.00",
    users__0__owed_share: "10.00",
    users__1__user_id: 101,
    users__1__paid_share: "0.00",
    users__1__owed_share: "10.00",
    users__2__user_id: 102,
    users__2__paid_share: "0.00",
    users__2__owed_share: "10.00",
  });
});

test("Commit skips a committed Draft and never sends it again", async () => {
  const pizza = { ...draft({}), status: "committed" as const, splitwise_expense_id: 51023 };
  const client = recordingClient();

  const result = await commitDrafts([pizza], client, 4242, "2026-10-04T06:10:00.000Z");

  assert.deepEqual(client.creates, []);
  assert.equal(result.drafts[0].status, "committed");
  assert.equal(result.drafts[0].splitwise_expense_id, 51023);
  assert.deepEqual(result.committed, []);
  assert.deepEqual(result.failed, []);
});

test("an invalid Draft is never sent and does not block the others", async () => {
  const pizza = draft({});
  pizza.shares[1] = { ...pizza.shares[1], owed_share: "-10.00" };
  const tacos = draft({ description: "Tacos", amount: "20", participants: ["Alex"] });
  tacos.id = "d2";
  const client = recordingClient();

  const result = await commitDrafts([pizza, tacos], client, 4242, "2026-10-04T06:10:00.000Z");

  assert.deepEqual(
    client.creates.map((payload) => payload.description),
    ["Tacos"],
  );
  assert.equal(result.drafts[0].status, "draft");
  assert.equal(result.drafts[1].status, "committed");
  assert.equal(result.drafts[1].splitwise_expense_id, 9001);
  assert.match(result.failed[0].reason, /negative/);
});

test("one rejected create does not block the rest of the batch", async () => {
  const pizza = draft({});
  const tacos = draft({ description: "Tacos", amount: "20", participants: ["Alex"] });
  tacos.id = "d2";
  const client = recordingClient([new SplitwiseError("create_expense rejected: bad shares"), 9002]);

  const result = await commitDrafts([pizza, tacos], client, 4242, "2026-10-04T06:10:00.000Z");

  assert.deepEqual(
    client.creates.map((payload) => payload.description),
    ["Pizza", "Tacos"],
  );
  assert.equal(result.drafts[0].status, "draft");
  assert.equal(result.drafts[1].status, "committed");
  assert.equal(result.drafts[1].splitwise_expense_id, 9002);
  assert.match(result.failed[0].reason, /bad shares/);
  assert.equal(result.committed[0].description, "Tacos");
});
