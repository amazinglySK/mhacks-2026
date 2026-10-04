import assert from "node:assert/strict";
import { test } from "node:test";
import { httpSplitwise, SplitwiseError } from "../agent/lib/splitwise.ts";

type FakeResponse = { status: number; body: unknown };

function fakeFetch(response: FakeResponse) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init ?? {} });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      async json() {
        return response.body;
      },
    } as Response;
  };
  return { fetchImpl, requests };
}

test("create_expense posts the payload and returns the Expense ID", async () => {
  const { fetchImpl, requests } = fakeFetch({ status: 200, body: { expenses: [{ id: 51023 }], errors: {} } });
  const payload = { group_id: 7, cost: "30.00", description: "Pizza", currency_code: "USD" };

  const expenseId = await httpSplitwise("sw-key", 7, fetchImpl).createExpense(payload);

  assert.equal(expenseId, 51023);
  assert.equal(requests[0].url, "https://secure.splitwise.com/api/v3.0/create_expense");
  assert.equal(requests[0].init.method, "POST");
  assert.equal((requests[0].init.headers as Record<string, string>).Authorization, "Bearer sw-key");
  assert.equal(requests[0].init.body, JSON.stringify(payload));
});

test("HTTP 200 with a nonempty errors object is a failed create", async () => {
  const { fetchImpl } = fakeFetch({
    status: 200,
    body: { expenses: [], errors: { base: ["Shares do not add up"] } },
  });

  await assert.rejects(
    httpSplitwise("sw-key", 7, fetchImpl).createExpense({
      group_id: 7,
      cost: "30.00",
      description: "Pizza",
      currency_code: "USD",
    }),
    (error) => error instanceof SplitwiseError && /Shares do not add up/.test(error.message),
  );
});

test("a create without an Expense ID is a failure", async () => {
  const { fetchImpl } = fakeFetch({ status: 200, body: { expenses: [], errors: {} } });

  await assert.rejects(
    httpSplitwise("sw-key", 7, fetchImpl).createExpense({
      group_id: 7,
      cost: "30.00",
      description: "Pizza",
      currency_code: "USD",
    }),
    SplitwiseError,
  );
});
