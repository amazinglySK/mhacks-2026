import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDraftChanges, batchFingerprint, buildDraft, DraftError } from "../agent/lib/money.ts";
import type { Draft, Group } from "../agent/lib/money.ts";
import { addDraft, commitBatch, modifyDraft, NO_SESSION, startListening, stopListening, summarizeSession } from "../agent/lib/listening.ts";
import type { ListeningSession } from "../agent/lib/listening.ts";
import { SplitwiseError, type SplitwiseClient } from "../agent/lib/splitwise.ts";
import type { ExpensePayload } from "../agent/lib/money.ts";

const GROUP: Group = {
  id: 4242,
  name: "MHacks Weekend",
  members: [
    { id: 100, first_name: "Demo", last_name: "User" },
    { id: 101, first_name: "Alex", last_name: null },
    { id: 102, first_name: "Maya", last_name: "Lee" },
  ],
};

function pizza(amount = "30", id = "d1"): Draft {
  const meta = { id, now: "2026-10-04T06:00:00.000Z", source: { id: "m1", sender: "+15550100" } };
  return buildDraft({ description: "Pizza", amount, participants: ["Alex", "Maya"] }, GROUP, 100, meta);
}

function countingClient(options: { fail?: boolean; outcomes?: Array<number | Error> } = {}) {
  const calls = { getGroup: 0, createExpense: 0 };
  const creates: ExpensePayload[] = [];
  let index = 0;
  const client: SplitwiseClient = {
    async getGroup() {
      calls.getGroup += 1;
      if (options.fail) throw new Error("get_group failed (HTTP 503)");
      return structuredClone(GROUP);
    },
    async createExpense(payload) {
      calls.createExpense += 1;
      creates.push(payload);
      const outcome = options.outcomes?.[index++];
      if (outcome instanceof Error) throw outcome;
      return outcome ?? 9000 + creates.length;
    },
    async listExpenses() {
      return [];
    },
  };
  return { client, calls, creates };
}

function active(...drafts: Draft[]): ListeningSession {
  return { ...startListening(NO_SESSION).session, drafts };
}

test("starting makes the session active", () => {
  const { session, summary } = startListening(NO_SESSION);

  assert.equal(session.status, "active");
  assert.deepEqual(session.drafts, []);
  assert.match(summary, /started/i);
});

test("starting twice reports the existing session and keeps its Drafts", () => {
  const first = active(pizza());
  const { session, summary } = startListening(first);

  assert.deepEqual(session, first);
  assert.match(summary, /already active/i);
  assert.match(summary, /1 Draft/);
});

test("a stopped session can't be resumed", async () => {
  const { session: stopped } = await stopListening(active(pizza()), countingClient().client);
  const { session, summary } = startListening(stopped);

  assert.deepEqual(session, stopped);
  assert.match(summary, /stopped/i);
});

test("Drafts are recorded only in an active session", async () => {
  assert.throws(() => addDraft(NO_SESSION, pizza()), DraftError);
  const { session: stopped } = await stopListening(active(pizza()), countingClient().client);
  assert.throws(() => addDraft(stopped, pizza("40", "d2")), (error) => error instanceof DraftError && /stopped/i.test(error.message));

  assert.deepEqual(addDraft(active(), pizza()).drafts, [pizza()]);
});

test("a Modification updates the existing Draft in place", () => {
  const original = pizza();
  const other = pizza("12", "d2");
  const next = applyDraftChanges(original, { amount: "36" }, GROUP, 100, {
    now: "2026-10-04T06:05:00.000Z",
    source: { id: "m2", sender: "+15550100" },
  });

  const session = modifyDraft(active(original, other), next);

  assert.equal(session.drafts.length, 2);
  assert.deepEqual(session.drafts[0], next);
  assert.deepEqual(session.drafts[1], other);
});

test("a Modification is rejected when the session is stopped", async () => {
  const original = pizza();
  const { session: stopped } = await stopListening(active(original), countingClient().client);
  const next = { ...original, amount: "36.00" };

  assert.throws(() => modifyDraft(stopped, next), (error) => error instanceof DraftError && /stopped/i.test(error.message));
  assert.deepEqual(stopped.drafts, [original]);
});

test("a Modification of an unknown Draft leaves the batch unchanged", () => {
  const original = pizza();
  const session = active(original);

  assert.throws(
    () => modifyDraft(session, { ...original, id: "missing" }),
    (error) => error instanceof DraftError && /missing/.test(error.message),
  );
  assert.deepEqual(session.drafts, [original]);
});

test("the summary lists every Draft and the mapped group", async () => {
  const session = active(pizza(), pizza("12", "d2"));
  const { session: after, summary } = await summarizeSession(session, countingClient().client);

  assert.deepEqual(after, session);
  assert.match(summary, /MHacks Weekend/);
  assert.match(summary, /1\. Pizza \$30\.00, paid by Demo User, split equally: Demo User \$10\.00, Alex \$10\.00, Maya Lee \$10\.00/);
  assert.match(summary, /2\. Pizza \$12\.00/);
});

test("stopping returns the final batch and records it as shown", async () => {
  const { client, calls } = countingClient();
  const drafts = [pizza()];
  const { session, summary } = await stopListening(active(...drafts), client);

  assert.equal(session.status, "stopped");
  assert.deepEqual(session.drafts, drafts);
  assert.equal(session.shown_fingerprint, batchFingerprint(drafts));
  assert.match(summary, /Stopped listening/);
  assert.match(summary, /Pizza \$30\.00/);
  assert.match(summary, /MHacks Weekend/);
  assert.match(summary, /Nothing has been written to Splitwise/);
  assert.deepEqual(calls, { getGroup: 1, createExpense: 0 });
});

test("stopping an empty session ends it cleanly without contacting Splitwise", async () => {
  const { client, calls } = countingClient();
  const { session, summary } = await stopListening(active(), client);

  assert.equal(session.status, "none");
  assert.match(summary, /no Drafts/i);
  assert.deepEqual(calls, { getGroup: 0, createExpense: 0 });
});

test("a stop that can't read Splitwise keeps listening so it can be retried", async () => {
  const session = active(pizza());

  await assert.rejects(stopListening(session, countingClient({ fail: true }).client), /HTTP 503/);
  assert.equal(session.status, "active");
});

test("reviewing a stopped session records the batch it showed", async () => {
  const { session: stopped } = await stopListening(active(pizza()), countingClient().client);
  const { session } = await summarizeSession({ ...stopped, shown_fingerprint: null }, countingClient().client);

  assert.equal(session.shown_fingerprint, batchFingerprint(stopped.drafts));
});

test("reviewing an active session records nothing as shown", async () => {
  const { session } = await summarizeSession(active(pizza()), countingClient().client);

  assert.equal(session.shown_fingerprint, null);
});

test("with no session, stopping and reviewing say so without contacting Splitwise", async () => {
  const { client, calls } = countingClient();

  assert.match((await stopListening(NO_SESSION, client)).summary, /No Listening Session is active/);
  assert.match((await summarizeSession(NO_SESSION, client)).summary, /No Listening Session is active/);
  assert.deepEqual(calls, { getGroup: 0, createExpense: 0 });
});

async function stopped(...drafts: Draft[]) {
  return (await stopListening(active(...drafts), countingClient().client)).session;
}

test("Commit of a stopped shown batch creates one Expense and marks the Draft committed", async () => {
  const { client, creates } = countingClient();
  const session = await stopped(pizza());

  const { session: after, summary } = await commitBatch(session, "commit-1", client, "2026-10-04T06:10:00.000Z");

  assert.deepEqual(creates, [
    {
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
    },
  ]);
  assert.equal(after.drafts[0].status, "committed");
  assert.equal(after.drafts[0].splitwise_expense_id, 9001);
  assert.equal(after.drafts[0].committed_at, "2026-10-04T06:10:00.000Z");
  assert.match(summary, /Committed to Splitwise in MHacks Weekend: Pizza \$30\.00/);
  assert.match(summary, /Open Splitwise/);
});

test("Commit before stop is refused and writes nothing", async () => {
  const { client, creates } = countingClient();
  const session = active(pizza());

  const { session: after, summary } = await commitBatch(session, "commit-1", client, "2026-10-04T06:10:00.000Z");

  assert.deepEqual(creates, []);
  assert.deepEqual(after, session);
  assert.match(summary, /stop/i);
});

test("Commit after the batch changed since it was shown is refused", async () => {
  const { client, creates } = countingClient();
  const session = await stopped(pizza());
  session.drafts = [pizza("36")];

  const { session: after, summary } = await commitBatch(session, "commit-1", client, "2026-10-04T06:10:00.000Z");

  assert.deepEqual(creates, []);
  assert.equal(after.drafts[0].status, "draft");
  assert.match(summary, /changed since it was shown/i);
});

test("a redelivered confirmation message writes nothing", async () => {
  const { client, creates } = countingClient({ outcomes: [9001, 9002] });
  const session = await stopped(pizza());
  const first = await commitBatch(session, "commit-1", client, "2026-10-04T06:10:00.000Z");

  const second = await commitBatch(first.session, "commit-1", client, "2026-10-04T06:11:00.000Z");

  assert.equal(creates.length, 1);
  assert.equal(second.session.drafts[0].splitwise_expense_id, 9001);
  assert.match(second.summary, /already handled|Nothing was written/i);
});

test("a second confirmation skips committed Drafts and writes nothing more", async () => {
  const { client, creates } = countingClient();
  const session = await stopped(pizza());
  const first = await commitBatch(session, "commit-1", client, "2026-10-04T06:10:00.000Z");

  const second = await commitBatch(first.session, "commit-2", client, "2026-10-04T06:11:00.000Z");

  assert.equal(creates.length, 1);
  assert.equal(second.session.drafts[0].status, "committed");
});

test("a failed Draft stays uncommitted and the summary names it", async () => {
  const { client, creates } = countingClient({
    outcomes: [new SplitwiseError("create_expense rejected: bad shares")],
  });
  const session = await stopped(pizza());

  const { session: after, summary } = await commitBatch(session, "commit-1", client, "2026-10-04T06:10:00.000Z");

  assert.equal(creates.length, 1);
  assert.equal(after.drafts[0].status, "draft");
  assert.match(summary, /Couldn't record Pizza \$30\.00/);
  assert.match(summary, /bad shares/);
  assert.match(summary, /Reply commit to retry/);
});
