# System Topology

**Component ownership and communication model for the Shared-Money Agent.**

---

## Components

### Photon Runtime
**What it is:** TypeScript process using `@spectrum-ts/imessage` SDK  
**What it owns:**
- iMessage WebSocket connection
- Message-to-envelope translation (iMessage → Agentverse mailbox format)
- Response delivery (Reasoning Agent → iMessage group)

**What it does NOT own:**
- Session state (lives in Reasoning Agent)
- Draft records (lives in Reasoning Agent)
- Business logic (lives in Reasoning Agent)

**Communication:**
- **Inbound:** iMessage events (user messages, reactions, attachments)
- **Outbound:** HTTP POST to `https://agentverse.ai/v1/submit` (Agentverse mailbox REST API)

---

### Reasoning Agent
**What it is:** Python uAgent code hosted on Agentverse  
**What it owns:**
- Listening session state (stored in Agent Storage)
- Draft records (stored in Agent Storage)
- Expense parsing logic (LLM: ASI:One)
- Receipt image analysis (LLM vision)
- Splitwise API client

**What it does NOT own:**
- iMessage connectivity (delegated to Photon)
- Balances or expense history (system of record is Splitwise)

**Communication:**
- **Inbound:** Agentverse mailbox (receives messages from Photon)
- **Outbound:** 
  - HTTP to Splitwise API (`https://secure.splitwise.com/api/v3.0/...`)
  - Agentverse mailbox (replies to Photon, who forwards to iMessage)

**State management:**
- Uses Agentverse **Agent Storage** (key-value store) for persistence
- Hosted agents are stateless (globals reset after each protocol handler call)
- Session and draft data must be explicitly saved/loaded from storage

---

### Splitwise
**What it is:** External REST API  
**What it owns:**
- Canonical expense records
- Settlements
- Balances (computed from expenses + settlements)

**What it does NOT own:**
- Drafts (never sees them until commit)
- Listening sessions (not a Splitwise concept)

**Communication:**
- **Inbound:** HTTP from Reasoning Agent (OAuth2 bearer token)
- **Outbound:** JSON responses (expense IDs, error messages)

---

## Data Flow: Recording an Expense

```
┌─────────────────┐
│ iMessage User   │
│ "I paid $50"    │
└────────┬────────┘
         │ (1) User message in group chat
         ▼
┌─────────────────┐
│ Photon Runtime  │ ← Receives iMessage event
└────────┬────────┘
         │ (2) POST /v1/submit (Agentverse mailbox REST API)
         │     Body: { sender, target: agent_address, payload: "I paid $50" }
         ▼
┌─────────────────────────┐
│ Reasoning Agent         │
│ - Parse message (LLM)   │ ← Reads session state from Agent Storage
│ - Create draft          │ ← Writes draft to Agent Storage
│ - Ask for confirmation  │
└────────┬────────────────┘
         │ (3) Send reply to mailbox (for Photon)
         ▼
┌─────────────────┐
│ Photon Runtime  │ ← Polls mailbox /v1/mailbox
└────────┬────────┘
         │ (4) Send iMessage "Confirm: $50 pizza, split with Alice?"
         ▼
┌─────────────────┐
│ iMessage User   │
│ 👍 (tapback)    │
└────────┬────────┘
         │ (5) Reaction event
         ▼
┌─────────────────┐
│ Photon Runtime  │
└────────┬────────┘
         │ (6) POST /v1/submit (reaction payload)
         ▼
┌─────────────────────────┐
│ Reasoning Agent         │
│ - Load draft            │ ← Reads from Agent Storage
│ - Mark confirmed        │
│ - Call Splitwise API    │ ────┐
└─────────────────────────┘     │ (7) POST /api/v3.0/create_expense
                                 │     Auth: Bearer <token>
                                 ▼
                          ┌─────────────┐
                          │ Splitwise   │ ← Creates expense record
                          └─────────────┘
                                 │ (8) Return expense_id
                                 ▼
┌─────────────────────────┐
│ Reasoning Agent         │
│ - Delete draft          │ ← Removes from Agent Storage
│ - Reply success         │
└────────┬────────────────┘
         │ (9) Send reply to mailbox
         ▼
┌─────────────────┐
│ Photon Runtime  │
└────────┬────────┘
         │ (10) Send iMessage "✅ Recorded in Splitwise"
         ▼
┌─────────────────┐
│ iMessage User   │
└─────────────────┘
```

---

## Ownership Summary

| Concept | Owner | Storage Location |
|---|---|---|
| Listening Session | Reasoning Agent | Agentverse Agent Storage |
| Draft | Reasoning Agent | Agentverse Agent Storage |
| Expense (committed) | Splitwise | Splitwise database |
| Balance | Splitwise | Computed, never stored by us |
| iMessage connection | Photon Runtime | In-memory (WebSocket) |
| Secrets (API keys) | Reasoning Agent | Agentverse Agent Secrets UI |

---

## Alternatives Not Chosen

### Gateway Service (Bun/Node)
**Why considered:** Could handle state, routing, or HTTP transformations between Photon and agent.

**Why rejected:** 
- Agentverse Agent Storage already provides persistence
- Direct Photon → Agentverse mailbox is simpler (no middle layer)
- Time constraint (20 hours for hackathon)

See `docs/research/spacetimedb-gateway-verdict.md` for detailed analysis.

---

## Open Questions

1. **Polling vs Webhooks:** Should Photon poll `/v1/mailbox` or use webhooks for agent replies?
   - **Polling:** Simpler, no public endpoint needed
   - **Webhooks:** Lower latency, requires HTTPS endpoint

2. **Session timeout:** How long can a listening session stay active without activity?
   - **Proposal:** 24 hours, then auto-stop

3. **Error handling:** If Splitwise API fails after user confirms, what state do we show?
   - **Proposal:** Keep draft, mark as `commit_failed: true`, let user retry

---

**Last updated:** October 3, 2026  
**Related:** `GLOSSARY.md`, `docs/research/fetch-agentverse-integration.md`
