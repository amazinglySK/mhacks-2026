# Judging Deployment

Concrete deployment, configuration, and recovery plan for the Shared-Money Agent demo.

## Runtime placement

- **Photon Runtime:** run locally on the presenter laptop with Bun. It uses the managed Photon cloud line, accepts events only from the allowlisted demo DM, submits them to Agentverse, and polls the Agentverse mailbox for replies. It exposes no public endpoint.
- **Reasoning Agent:** run as a hosted Python uAgent on Agentverse. Agent Storage owns the active Listening Session, Drafts, and committed Splitwise Expense mappings.
- **Splitwise:** remains the system of record. The Reasoning Agent calls it directly using one personal API key.
- **ASI:One:** runs through the credentials Agentverse injects into the hosted Reasoning Agent.

There is no gateway and no redundant deployment.

## Demo identity model

The MVP is one human speaking to the agent in one iMessage DM. The DM is allowlisted and permanently mapped to the preselected **MHacks Weekend** Splitwise group for the demo.

The demo user's Splitwise user ID is preseeded. First-person statements such as "I paid $30" use that ID as the payer. Other people mentioned in the DM are Participants in the mapped Splitwise group, not iMessage conversation members.

For each named Participant, the Reasoning Agent fetches the current Splitwise group members and resolves the name as follows:

1. A unique exact normalized first-name or full-name match is accepted.
2. A unique strong fuzzy match is proposed in the DM and requires confirmation.
3. An ambiguous or weak match presents the nearest group-member choices and requires selection.
4. No match blocks Draft creation until the demo user clarifies.

The Reasoning Agent never invents a Splitwise user ID.

## Minimum configuration

### Photon Runtime local `.env`

Only the local Photon Runtime reads these values:

```dotenv
# Photon cloud credentials: EITHER the project pair (tokens auto-renew)...
PHOTON_PROJECT_ID=
PHOTON_PROJECT_SECRET=
# ...OR one explicit cloud client (token is not auto-renewed)
PHOTON_ADDRESS=
PHOTON_TOKEN=
PHOTON_PHONE=

# Only this DM may drive the demo (Spectrum space id)
DEMO_DM_ID=

# Photon's own Agentverse agent identity and the hosted Reasoning Agent it talks to
PHOTON_AGENT_SEED=
REASONING_AGENT_ADDRESS=

# Used only by the one-time `bun run register`
AGENTVERSE_API_KEY=
```

The runtime fails at startup if any required value is missing, naming the variables but never their values. Photon must not receive the Splitwise API key. See `photon/.env.example`.

Photon is itself a signed Agentverse mailbox agent: it derives an `agent1…` address from `PHOTON_AGENT_SEED`, submits Agent Chat Protocol envelopes to the Reasoning Agent's Almanac endpoint, and polls its own mailbox for replies. The Agent Chat Protocol schema digests are constants in `photon/src/agentverse/link.ts`, not configuration.

### Reasoning Agent secrets

Configure these in the Agentverse Agent Secrets UI:

```dotenv
SPLITWISE_API_KEY=
SPLITWISE_GROUP_ID=
DEMO_USER_SPLITWISE_ID=
PHOTON_SENDER_ADDRESS=
```

`PHOTON_SENDER_ADDRESS` authenticates reset and message envelopes from the one trusted Photon Runtime. `ASI1_API_KEY` and `ASI1_BASE_URL` are supplied by Agentverse and must not be duplicated.

Actual secret values and IDs never belong in Git, GitHub issues, or logs.

The hosted agent's code is `reasoning-agent/agent.py` plus `reasoning-agent/shared_money.py`; both files go into the Agentverse hosted editor. Setup order and the preflight record live in `docs/agents/preflight.md`.

## Startup behavior

1. Photon validates all required environment variables.
2. Photon resolves the Reasoning Agent and its own mailbox on Agentverse, connects its Photon cloud credentials, and verifies the configured DM is reachable.
3. Photon submits an authenticated `reset_demo_session` control envelope to the Reasoning Agent.
4. The Reasoning Agent deletes the active Listening Session and all uncommitted Drafts for the configured DM, but preserves committed Expense mappings used by Corrections.
5. Photon begins listening to the DM and polling the Agentverse mailbox.
6. The demo user starts a new Listening Session explicitly.

The reset is intentionally destructive to unfinished demo work: every Photon restart starts the demo afresh.

## Preflight checklist

Before judging:

- Confirm the Photon cloud line can receive and send in the allowlisted DM.
- Confirm the hosted Reasoning Agent accepts a mailbox envelope from the configured Photon sender.
- Confirm Agentverse injected both ASI:One variables.
- Confirm the Splitwise key can fetch the configured group and that the preseeded demo-user ID is a member.
- Exercise one exact Participant match and one fuzzy-match confirmation.
- Create and then remove a throwaway Splitwise Expense.
- Restart Photon once and verify the active Listening Session and Drafts are cleared while a committed Expense can still be found for Correction.
- Keep a short screen recording of the successful end-to-end demo for external-service outages.

## Recovery during judging

- **Photon process failure:** restart the Bun process. Startup reset clears unfinished session state; begin a new Listening Session.
- **Stale or confusing demo state:** restart Photon to invoke the same reset path.
- **Splitwise request failure:** report the failed Draft, keep the DM responsive, and retry only at the demo user's explicit request.
- **Agentverse, Photon cloud, or network outage:** do not switch deployments during judging; use the recorded demonstration and explain the live architecture.

Committed Splitwise Expenses are never deleted by the startup reset.
