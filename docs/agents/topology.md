# System Topology

Component ownership and communication model for the Shared-Money Agent.

## Components

### Photon Runtime

The Photon Runtime is a TypeScript process using `@spectrum-ts/imessage`.

It owns:

- The managed Photon cloud-line connection.
- The allowlist for the configured iMessage DM.
- Translation between iMessage events and Agentverse mailbox envelopes.
- Immediate tapbacks and delivery of Reasoning Agent replies to the DM.
- Agentverse mailbox polling.

It does not own Listening Sessions, Drafts, participant resolution, Splitwise access, or business rules.

### Reasoning Agent

The Reasoning Agent is a Python uAgent hosted on Agentverse.

It owns:

- Listening Sessions and Drafts in Agent Storage.
- Committed Splitwise Expense mappings used by Corrections.
- ASI:One parsing and tool use.
- Participant resolution against members of the mapped Splitwise group.
- Splitwise API validation and calls.

Hosted handler globals are not state. Every handler explicitly loads and saves Agent Storage.

### Splitwise

Splitwise is the system of record for committed Expenses, Settlements, and Balances. It never stores Drafts or Listening Sessions. The Reasoning Agent calls its REST API directly with a personal API key used as a bearer token.

## Communication

```text
iMessage DM
    ↕ managed Photon cloud line
Photon Runtime (TypeScript, local Bun process)
    ↕ Agentverse mailbox REST API
Reasoning Agent (Python uAgent, hosted on Agentverse)
    ↕ outbound HTTPS
Splitwise REST API
```

Photon submits DM events to `https://agentverse.ai/v1/submit` and polls the Agentverse mailbox for replies. This needs no gateway and no public endpoint on the presenter laptop.

## Recording and Commit flow

1. The demo user starts a Listening Session in the allowlisted DM.
2. Photon reacts immediately to a received message and submits its envelope to Agentverse.
3. The Reasoning Agent loads the session, parses the message, resolves named Participants against the mapped Splitwise group, and stores a Draft.
4. Photon returns the Draft summary to the DM. No per-Draft confirmation occurs.
5. The demo user may modify Drafts in natural language and then stops the Listening Session.
6. The Reasoning Agent returns the batch summary. A Photon confirmation card is preferred; an explicit text reply is the guaranteed fallback.
7. On confirmation, the Reasoning Agent validates and commits each Draft to Splitwise on a best-effort basis, preserving each successful Splitwise Expense ID for later Corrections.

## Ownership summary

| Concept | Owner | Storage |
|---|---|---|
| Listening Session | Reasoning Agent | Agentverse Agent Storage |
| Draft | Reasoning Agent | Agentverse Agent Storage |
| Committed Expense mapping | Reasoning Agent | Agentverse Agent Storage |
| Expense and Balance | Splitwise | Splitwise |
| iMessage connection | Photon Runtime | In-memory WebSocket |
| Photon and Agentverse connection secrets | Photon Runtime | Local `.env` |
| Splitwise API key | Reasoning Agent | Agentverse Agent Secrets |

## Judging deployment

- Photon runs locally under Bun and accepts only the configured DM.
- The Reasoning Agent remains hosted on Agentverse.
- The DM maps to one preselected Splitwise group and one preseeded demo-user Splitwise ID.
- Restarting Photon sends a reset control message that discards the active Listening Session and uncommitted Drafts for the DM. Committed Expense mappings remain available for Corrections.
- There is no redundant deployment or automatic distributed retry infrastructure.

See `docs/agents/judging-deployment.md` for configuration and recovery details.

## Alternatives not chosen

A gateway service and SpacetimeDB were rejected because Agent Storage already supplies the needed persistence and the Reasoning Agent can call Splitwise directly. Webhooks were rejected for the judging deployment because mailbox polling avoids deploying a public endpoint.

**Last updated:** October 3, 2026  
**Related:** `GLOSSARY.md`, `docs/adr/0001-batch-confirmation-only.md`, `docs/agents/judging-deployment.md`
