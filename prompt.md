# Handoff: moving the Reasoning Agent to Eve

Continuation notes from a design session on 2026-10-04 (~1:45 AM ET). Judging is **under 6 hours away**; the spec (#16) protects the final 2 hours for rehearsal, so there are roughly 4 build hours left. Read this first, then `GLOSSARY.md`, `docs/adr/0001-batch-confirmation-only.md`, and issue #16.

## Where the repo stands

- `main` is at `c9ad329` ("Recover a partially failed Commit without duplicates (#19)"), 2 commits ahead of `origin/main`, not pushed.
- The current stack still works end to end: the local Bun Photon runtime (`photon/`) talks to the hosted Python Reasoning Agent (`reasoning-agent/agent.py` + `shared_money.py`) on Agentverse through the Agentverse mailbox. ASI:One is called by the Python agent. 62 Python tests pass (`cd reasoning-agent && uv run pytest -q`).
- #19 is implemented and committed but the issue is still open (it needs live Splitwise and iMessage proof). Open children of #16: #20 (Modify and review), #21 (Isolate and reset), #22 (Incomplete or uncertain Expense language), #23 (Certify and record the judging run).
- An attempted fix (requiring a new Draft's amount to appear in the message text) was **rejected by the user and dropped**. Don't reintroduce that kind of text heuristic.
- The hosted Agentverse copy of `shared_money.py` must be re-pasted by hand whenever it changes.

## The problem that started this

In live testing, banter inside a Listening Session misbehaved:

- "Lol ishan u need to up your food recommendation dude" got an unwanted clarifying question.
- "See, yash also agrees" created a **second, duplicate $30 Pizza Draft**.

The root cause is the interpretation design, not a prompt tweak. Today each message gets **one stateless ASI:One call** with two tools (`record_expense`, `ask_user`). Python reads only the first tool call; ASI:One never sees tool results.

- **No message-to-Draft link.** The transcript is bare text and the Drafts are a separate summary list, so nothing says which message produced which Draft.
- **No memory of its own replies.** The agent's own replies (including its questions) are never stored.
- **No "existing Draft" option.** There is no way to say "this is about an existing Draft", so banter, follow-ups, Modifications and answers have no correct option.

Issue #11 had originally specified a richer tool set (`record_draft` with `source_message_id`, `modify_draft`, `get_session_summary`, …); #18 narrowed it.

Side finding: duplicate iMessage replies earlier were caused by **three Photon runtimes running at once** (old `bun run start` processes), not by the agent. Only one Photon consumer may run at a time.

## Decisions made

1. **Agent model: a real tool-calling (ReAct) loop.** The model calls a tool, sees the result, and decides whether that was what the user meant before acting again or replying. ASI:One supports this on `/v1/chat/completions` (tool results go back as `role: "tool"` with the same `tool_call_id`; `strict: true` and `parallel_tool_calls: false` are available).
2. **Framework: build the agent in Eve** (Vercel's agent framework, eve.dev), replacing both the Python Reasoning Agent and the local Bun Photon runtime + Agentverse mailbox link. The user is more comfortable in Eve.
3. **Model: ASI:One** through `@ai-sdk/openai-compatible` (`createOpenAICompatible({ baseURL, apiKey }).chatModel("asi1")`), keeping the Fetch.ai track story. Set `modelContextWindowTokens` explicitly (Eve errors without it for custom providers).
4. **iMessage: Eve's first-class Photon channel** (`eve add channel/photon-imessage`, `photonIMessageChannel` from `eve/channels/photon`, webhook route `/eve/v1/photon`, one Eve session per iMessage conversation).
5. **Hosting: Vercel with Vercel Connect** (option a). Reuse the existing Photon project and line, and **stop the old Bun runtime** once the webhook points at Eve, or both will answer.
6. **Turn policy: `turnPolicy: "queue"`.** Every message is handled to completion, in order, so no Expense message is dropped or interrupted by steering.
7. **No rigid commands.** The user does not want fixed command strings like `@agent start listening`. Start, stop, summary and reset should be understood from natural language through tools.
8. **State and reset: Eve durable state** for the single DM session holds the Listening Session, Drafts, committed Splitwise Expense IDs, and handled confirmation message IDs. Photon restart no longer exists as a reset path, so #21's reset becomes a natural-language reset tool that clears the active session and uncommitted Drafts and **keeps** committed mappings. This also gives a way out of a stuck stopped batch.
9. **Agentverse: a discovery-only side entry point**, not on the iMessage demo path. The iMessage demo runs Photon → Eve directly.
10. **Build order (about 4 hours):**
    1. **Spike (~30 min):** an Eve agent on ASI:One over Photon. Prove one reply, one silence on banter, and one tool call.
    2. **Port to TypeScript with tests (~1 h):** equal shares (remainder on the payer's owed share), Draft validation, the Splitwise client (HTTP 200 with a nonempty `errors` object is a failure), and #19's exactly-once Commit (per-Draft best effort; mark each success immediately; skip committed Drafts on retry; store the first attempt time before sending and, on retry, look for an Expense that attempt already saved before resending).
    3. **Tools and instructions (~1 h).**
    4. **Deploy and run the 13-step judging script (~30 min).**
    5. **Agentverse adapter only if time remains.**

    The Python stack stays untouched as the fallback until Eve passes the judging script.

## Answered (~1:50 AM): Q1 → (b), Q2 → try 1 then 3, Q3 → skip the adapter for now

Fallback cutoffs: if the spike hasn't produced one reply and one tool call over Photon by 2:45 AM, or Eve hasn't passed the judging script by 5:45 AM, demo on the Python stack. Full record and ticket changes: https://github.com/amazinglySK/mhacks-2026/issues/16#issuecomment-5977073464

## Open questions (original wording, kept for reference)

**Q1 - How natural can Commit be?** Commit is the one irreversible step (ADR 0001: one explicit confirmation of the reviewed batch). Options:

- (a) Fully natural: the model calls `commit_batch` whenever it judges the user confirmed.
- (b) Natural, but code-guarded: `commit_batch` refuses unless the session is stopped **and** the exact batch was shown to the user in a summary and has not changed since.
- (c) Keep a literal `commit` word.

Recommended: **(b)**.

**Q2 - How do we get silence on banter?** The Photon channel docs don't say whether a reply can be skipped (`onMessage` can only return `null` to ignore a message or add context; it cannot reply itself). Options:

1. An empty final answer, if the channel then skips sending. Test it in the spike.
2. A cheap gate in `onMessage` that drops obviously irrelevant messages. The risk is dropping real Expense messages, and dropped messages don't enter session history.
3. A small custom channel (`defineChannel`) wrapping Photon/Spectrum whose delivery step drops a `NO_REPLY` marker. Full control, ~30 to 45 extra minutes.

Recommended: **try 1 in the spike; if it fails, go to 3**. Keep the agent silent on banter (spec story 4); don't accept an "👀"-style reply without the user's OK.

**Q3 - What does the Agentverse marketplace listing do?** Strangers must not be able to write into the user's Splitwise group (the deployment uses one personal API key and one group). Options:

- (a) A split planner: same agent, but for Agentverse/ASI:One senders it only works out Drafts and shares and never writes to Splitwise.
- (b) The full agent, allowlisted to specific Agentverse addresses.
- (c) Skip the adapter.

Recommended: **(a)**.

The adapter itself would be a small TypeScript endpoint (likely a custom Eve channel) that:

- receives Agent Chat Protocol envelopes;
- verifies them with the existing signing code in `photon/src/agentverse/`;
- acknowledges with `ChatAcknowledgement`;
- forwards the text to an Eve session keyed by the sender;
- sends the reply back as a signed `ChatMessage`.

It is registered once on Agentverse as an External Agent with the Chat Protocol, keywords and a README.

## Design points still to settle after those answers

These were proposed for the ReAct design but not confirmed after the move to Eve. Revisit them:

- **What the model sees up front:** every Draft (with ID, fields and source message ID), recent transcript with message IDs **and the agent's own replies**, and any open question. Prefer injecting state up front over read tools, since each round trip costs seconds.
- **Who writes the money facts:** Eve's default is that the model writes every reply. Proposed: each Draft tool returns the exact Draft summary text (amount, payer, shares, group) and the instructions require quoting it verbatim, so chat always matches what Commit will send.
- **When tool effects apply:** Eve's default is that tool effects apply immediately. Staging changes until the turn finishes was proposed earlier but is probably not worth it in 4 hours; the model can correct with `modify_draft`.
- **Proposed tool set:**
  - `record_draft(description, amount, payer, participants)`
  - `modify_draft(draft_id, …changes)`
  - `ask_user(question)`
  - start, stop, summary and reset session tools
  - `commit_batch` (guarded per Q1)

  Name resolution happens inside the Draft tools. An unknown or ambiguous name returns an error with the group member list so the model can fix it or ask. No `discard_draft` for now.
- **Code-enforced guards regardless of model behavior:**
  - Draft tools work only in an active session.
  - `commit_batch` follows Q1.
  - No tool may write to Splitwise except `commit_batch`.
  - Every Draft is validated before Commit (paid shares = cost, owed shares = cost, no negative share).
- **Spec and docs updates needed:**
  - An ADR recording the move to Eve (only after Eve passes the judging script).
  - ~~Update #16 and the open child issues (#20 to #23).~~ Done as one comment on #16.
  - After Eve passes the judging script, update `docs/agents/topology.md`, `docs/agents/judging-deployment.md`, `docs/agents/preflight.md` and `docs/contracts/draft-to-splitwise.md` (storage now lives in Eve durable state).

## Useful facts gathered

- **ASI:One tool calling:** https://docs.asi1.ai/documentation/build-with-asi-one/tool-calling
- **Eve docs index:** https://eve.dev/llms.txt
- **Eve Photon channel:** https://eve.dev/docs/channels/photon.md. Portable-credential env vars are `IMESSAGE_PROJECT_ID`, `IMESSAGE_PROJECT_SECRET` and `IMESSAGE_WEBHOOK_SECRET`.
- **Eve model configuration:** https://eve.dev/docs/agent-config
- **Agentverse external agents:** register a public HTTPS Chat Protocol endpoint as an External Agent, with keywords and a README. See https://innovationlab.fetch.ai/resources/docs/agentverse/agentverse-sdk-fastapi and https://docs.agentverse.ai/documentation/getting-started/enable-chat-protocol.mdx.
- **ASI:One outside Agentverse:** it is not injected automatically, so the Eve deployment needs its own ASI:One API key from https://asi1.ai/developer.
- **Secrets:** never put secret values, phone numbers, DM IDs or Splitwise IDs in Git, issues or logs.
