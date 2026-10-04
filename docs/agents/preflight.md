# Walking-Path Setup and Preflights

How to bring up the deployed iMessage → Photon Runtime → Agentverse → Reasoning Agent → ASI:One → Splitwise path, and where to record that each external dependency passed. Configuration names are defined in `docs/agents/judging-deployment.md`.

## One-time setup

1. **Reasoning Agent.** Create a hosted agent on Agentverse. Add `reasoning-agent/agent.py` (as the agent's main file) and `reasoning-agent/shared_money.py` in the hosted editor. Copy its `agent1…` address.
2. **Photon `.env`.** Copy `photon/.env.example` to `photon/.env`. Fill the Photon credentials and `DEMO_DM_ID`, generate a long random `PHOTON_AGENT_SEED`, set `REASONING_AGENT_ADDRESS` to the address from step 1, and add an Agentverse API key for registration.
3. **Photon mailbox.** From `photon/`, run `bun install` then `bun run register`. It registers Photon's agent identity as an Agentverse mailbox agent and prints the `PHOTON_SENDER_ADDRESS` value.
4. **Reasoning Agent secrets.** In the hosted agent's Agent Secrets, set `SPLITWISE_API_KEY`, `SPLITWISE_GROUP_ID`, `DEMO_USER_SPLITWISE_ID`, and the printed `PHOTON_SENDER_ADDRESS`. Confirm `ASI1_API_KEY` and `ASI1_BASE_URL` are injected. Start the agent.

## Preflights

Run each from `photon/`. A preflight passes only when it prints `PASSED`.

| Preflight | Command | Proves |
|---|---|---|
| Photon send/receive | `bun run preflight:photon` | The cloud line can send to the demo DM and receive a reply sent after the preflight message. |
| Agentverse mailbox round trip | `bun run preflight:agentverse` | Photon's signed envelope reaches the hosted Reasoning Agent and a reply returns to Photon's mailbox. |
| Splitwise group read | (same run as above) | The reply is `PREFLIGHT OK group="MHacks Weekend" …`, which the Reasoning Agent sends only after reading the group with its Agentverse secrets, finding the demo user among its members, and getting an ASI:One completion. |

Then run `bun run start`, send `@agent hello` from the demo DM, and expect a visible reply naming the group. A message from any other DM logs `message_rejected` with reason `other_space` and is never forwarded.

## Record

Fill in after each run. Do not paste secrets, phone numbers, DM IDs, or Splitwise IDs here.

| Date | Photon send/receive | Agentverse round trip | Splitwise group read | End-to-end `@agent` reply | Other-DM rejected | Notes |
|---|---|---|---|---|---|---|
| 2026-10-04 | passed | passed | passed (group "MHacks Weekend") | passed | passed | Without `@agent`, a DM message is forwarded and the agent logs `chat_ignored`. A non-text event right after a reply is rejected as `not_text`. |
