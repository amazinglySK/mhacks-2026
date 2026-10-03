# Shared-Money Agent

A conversational agent in iMessage group chats that turns talk about shared spending into records in Splitwise, which remains the system of record.

## Language

### Domain Concepts

**Expense**:
A payment one or more people made for something shared among participants, each carrying an owed share.
_Avoid_: Debt, bill, transaction

**Settlement**:
A repayment from one person to another that reduces what they owe.
_Avoid_: Payback, debt payment

**Balance**:
The net amount owed between people, derived by Splitwise from expenses and settlements; never computed by us.
_Avoid_: Debt, debt graph, total owed

**Listening Session**:
A stateful period scoped to a group chat with two states: `active` (agent listening, creating/modifying drafts) and `stopped` (session ended). Created by "@agent start listening", ended by "@agent stop listening". Anyone in the group can start, stop, or modify any draft. State lives in the Reasoning Agent (Agent Storage) and includes all drafts and their Splitwise expense ID mappings.
_Avoid_: Monitoring, recording mode, stretch

**Draft**:
Structured expense data (amount, payer, participants, split rule) recorded by the Reasoning Agent during an active session, stored in Agent Storage. Exists in one of two states: `draft` (created and modifiable) or `committed` (written to Splitwise). Drafts have no explicit per-item confirmation; user may modify any draft via natural language during the session. All drafts commit together as a batch when the session stops, after one final confirmation.
_Avoid_: Pending expense, proposal, unconfirmed expense

**Commit**:
The batch operation that writes all drafts from a session to Splitwise when the user stops listening. Triggered by final user confirmation on a Photon app card. Best-effort: drafts that succeed are written and marked `committed`; drafts that fail (Splitwise API error) are reported to the user with retry option. Stores Splitwise expense IDs in Agent Storage for later corrections.
_Avoid_: Save, sync, push

**Correction**:
Updating an already-committed expense in Splitwise via `update_expense` API. Context-dependent: inside a session, natural language like "change that pizza to $35" triggers immediate Splitwise update; outside a session, explicit command "@agent correct pizza to $35" required. Agent looks up Splitwise expense ID from stored mapping by description.
_Avoid_: Edit, fix, modification (use Modification for in-session draft changes)

**Modification**:
Changing a draft's data during an active session before commit, via natural language like "change that to $35" or "split between 4 people". Updates the draft in Agent Storage; does not touch Splitwise.
_Avoid_: Edit (ambiguous with Correction)

**Receipt**:
An image of an itemised bill shared in the chat, used as evidence for an expense.
_Avoid_: Bill photo, scan

### Components

**Photon Runtime**:
The TypeScript process using `@spectrum-ts/imessage` SDK that receives iMessage events from group chats and forwards them to the Reasoning Agent via Agentverse mailbox REST API.
_Avoid_: Photon app, iMessage client

**Reasoning Agent**:
The Python uAgent code hosted on Agentverse that parses messages, manages listening sessions and drafts, calls Splitwise API, and replies to the group via Photon; includes the agent's mailbox and Agent Storage.
_Avoid_: Fetch agent, backend, agent code

**Splitwise**:
The external system of record for expenses, settlements, and balances; we call its REST API but never maintain derived state.
_Avoid_: Splitwise API, backend
