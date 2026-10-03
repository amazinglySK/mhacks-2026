# Shared-Money Agent
*Hackathon Product Spec — Working Draft*

*A conversational financial layer for group expenses in iMessage, backed by Splitwise.*

## 1. Product Thesis

Shared expenses usually happen inside conversations:

- “I got dinner.”
- “Split the Uber between everyone except Maya.”
- “Alex paid me back already.”
- “Wait, I only had one drink.”
- “How much do I owe?”

The annoying part is that somebody still has to leave the conversation, open Splitwise, create the expense, select the right people, choose the right split, and later fix anything that was entered incorrectly.

**Goal:** let the group handle shared expenses naturally in iMessage while using **Splitwise as the persistent system of record**.

The agent becomes the conversational execution layer between messy human conversation and structured Splitwise expenses.

**Chat → Understand → Confirm → Save to Splitwise → Reconcile**

> **Budgeting is intentionally on the backburner for now.** The MVP focuses on expenses that have already happened and making expense capture/reconciliation dramatically easier.

## 2. Core User Story

A group talks normally in iMessage.

The agent understands statements such as:

- “I paid $86 for dinner.”
- “Split that between everyone except Sarah.”
- “Alex only owes $12.”
- “Maya already sent me $20.”
- “Actually the Uber was $38, not $36.”
- “Put this in our Chicago trip.”
- “How much do I owe right now?”

The agent converts those messages into structured expense operations, asks for clarification only when necessary, and writes the resulting expense to Splitwise.

Splitwise remains the durable ledger. The iMessage agent is the intelligent interface.

## 3. Core Workflow

| Phase | What happens | What the agent does | Result |
|---|---|---|---|
| **1. Detect** | Someone mentions a shared payment or repayment in chat | Recognizes that the message represents an expense, settlement, or correction | Structured intent |
| **2. Resolve** | Details may be incomplete or ambiguous | Infers payer, amount, participants, group, and split rule; asks only for missing information | Complete expense draft |
| **3. Confirm** | The agent presents what it understood | Shows a compact Photon card with payer, amount, participants, split, and destination Splitwise group | Human-approved operation |
| **4. Commit** | User confirms | Creates or updates the expense through the Splitwise API | Expense saved to Splitwise |
| **5. Reconcile** | Conversation later changes the facts | Updates/corrects the corresponding Splitwise expense or records a repayment | Splitwise stays accurate |

## 4. MVP Scope

- Natural-language expense capture from an iMessage group chat.
- Connect a user's Splitwise account through OAuth.
- Select or associate an iMessage conversation with a Splitwise group.
- Create Splitwise expenses from natural language.
- Support equal splits.
- Support exclusions, such as “everyone except Maya.”
- Support simple custom shares, such as “Alex only owes $12.”
- Detect the payer from conversational context.
- Edit/correct an existing expense from natural language.
- Record repayments/settlements when supported by the mapped Splitwise operation.
- Show a Photon confirmation card before committing an expense.
- Read back current expense/balance information from Splitwise when a user asks.
- Keep a trace from the chat action to the resulting Splitwise expense ID so later corrections can target the correct record.

## 5. Key Product Principle: Splitwise Is the Source of Truth

The project should **not** build a second competing expense ledger.

Splitwise already handles persistence, groups, users, expenses, shares, and balances. The value of this project is eliminating the friction between a conversation and that structured financial state.

```text
iMessage conversation
        ↓
AI intent extraction
        ↓
structured expense draft
        ↓
Photon confirmation
        ↓
Splitwise API
        ↓
persistent Splitwise expense
```

The app may keep lightweight metadata such as:

- conversation ↔ Splitwise group mapping
- message ↔ Splitwise expense ID mapping
- pending/unconfirmed expense drafts
- agent context needed to understand follow-up corrections

It should not independently duplicate the entire Splitwise ledger unless technically necessary.

## 6. Intelligence Boundary

The AI is responsible for understanding **what the humans meant**.

Examples:

```text
"I got the Uber, $42"
→ payer = sender
→ amount = 42
→ likely participants = current group
→ split = equal
```

```text
"Split dinner between everyone except Sam"
→ operation = expense
→ participants = group - Sam
→ split = equal
```

```text
"Actually I only owe $18 for that"
→ operation = modify prior expense
→ target = most relevant referenced/recent expense
→ custom owed share = 18
```

The AI should produce structured operations rather than directly manipulating balances.

Example internal representation:

```json
{
  "action": "create_expense",
  "amount": 86.00,
  "description": "Dinner",
  "payer": "Shashwat",
  "splitwise_group_id": 12345,
  "participants": ["Shashwat", "Alex", "Maya"],
  "split_type": "equal"
}
```

The backend validates that operation and translates it into the corresponding Splitwise API request.

## 7. Confirmation Model

Financial actions should not silently happen from ambiguous conversation.

For the MVP:

1. Agent detects an expense.
2. Agent creates a draft.
3. Photon renders a compact confirmation card.
4. User can:
   - **Add to Splitwise**
   - **Edit**
   - **Cancel**
5. Only confirmed operations are committed.

Example card:

```text
Dinner — $86.00

Paid by: Shashwat
Split between:
✓ Shashwat
✓ Alex
✓ Priya
✗ Maya

Splitwise group: Chicago Trip

[ Add to Splitwise ]   [ Edit ]
```

For extremely explicit commands such as “Add $30 groceries to Splitwise, split equally with Alex and Maya,” auto-commit can be considered later as a user preference.

## 8. Splitwise Integration

Splitwise's API supports fetching information about users, groups, expenses, and related account data. It also exposes authenticated endpoints for creating expenses, including equal group splits or explicit `paid_share` / `owed_share` values, and for updating existing expenses.

The integration should use:

- OAuth for user authorization.
- Splitwise groups as the persistent group structure.
- Splitwise user IDs for participant matching.
- `create_expense` for confirmed expenses.
- `update_expense/{id}` for corrections.
- Splitwise expense IDs as durable references for follow-up conversation.

### Important design constraint

This project should be presented as a **conversational integration with Splitwise**, not a replacement for Splitwise.

The Splitwise self-serve API is intended for integrations, hobbyists, and exploratory/internal prototyping, but its terms restrict applications that replicate or compete with Splitwise functionality. Our product differentiation is therefore the iMessage/agent interaction layer and intelligent translation of conversation into Splitwise actions.

## 9. Tiny SpacetimeDB Module

SpacetimeDB acts as the lightweight coordination layer between the agent and Splitwise.

It should answer questions like:

- Which Splitwise group is this iMessage conversation linked to?
- Is there a pending expense waiting for confirmation?
- Which people in this chat map to which Splitwise users?
- Has a pending expense been confirmed, edited, or cancelled?
- Which Splitwise expense ID corresponds to a prior chat action?

It should **not** answer questions like:

- What is the canonical balance between two users?
- What expenses exist in the group?
- What is the authoritative total owed?

Those belong to Splitwise.

### Minimal architecture

```text
iMessage / Photon
      ↓
Fetch agent
      ↓
SpacetimeDB module
      ↓
Splitwise API
```

### Minimal Spacetime tables

#### ConversationMapping

```text
conversation_id
splitwise_group_id
participant_mappings
created_by
```

### PendingExpense

```text
draft_id
conversation_id
source_message_id
amount
description
payer
participants
split_rule
splitwise_group_id
status
created_at
```

Possible statuses:

```text
draft
awaiting_confirmation
confirmed
committing
committed
cancelled
failed
```

### ExpenseReference

```text
source_message_id
splitwise_expense_id
conversation_id
created_at
```

### ParticipantMapping

```text
conversation_id
imessage_participant
splitwise_user_id
confidence
confirmed
```

### Optional ConfirmationState

Only add this if the Photon experience allows multiple participants to interact with the same pending expense.

```text
draft_id
participant_id
decision
updated_at
```

### Minimal server-side operations

The Spacetime module only needs a handful of operations:

```text
create_draft(...)
update_draft(...)
confirm_draft(...)
cancel_draft(...)
commit_to_splitwise(...)
record_splitwise_reference(...)
```

The most important flow is:

```text
confirm_draft(draft_id)
      ↓
validate draft
      ↓
mark status = committing
      ↓
call Splitwise API
      ↓
store splitwise_expense_id
      ↓
mark status = committed
```

If the Splitwise request fails:

```text
status = failed
error = stored for retry / display
```

### Why Spacetime exists here

Spacetime is useful because it provides:

- persistent workflow state,
- a server-side place to keep Splitwise-facing logic,
- live shared state for Photon cards,
- a clean boundary between AI interpretation and financial persistence.

It is **not** being used as a replacement database for Splitwise.

Splitwise itself remains responsible for the canonical expense and balance data.

## 10. Sponsor-Tech Fit

| Technology | Role | Importance |
|---|---|---|
| **Photon / Spectrum** | Primary product surface. The agent lives inside iMessage, understands the conversation, and renders interactive confirmation/edit cards. | **Core** |
| **Fetch / Agentverse** | Agent reasoning and orchestration: transform conversational intent into validated financial operations, decide when clarification is required, and expose an ASI:One-compatible agent workflow. | **Core if competing in Fetch** |
| **Splitwise API** | Persistent financial backend and source of truth for groups, expenses, splits, corrections, and balances. | **Core** |
| **SpacetimeDB** | Tiny workflow-state backend: pending drafts, conversation/group mappings, participant mappings, Splitwise expense references, and shared confirmation state. It also provides the server-side boundary for committing approved actions to Splitwise. | **Yes — intentionally small** |

### Current recommendation

Use SpacetimeDB, but keep its responsibility extremely narrow.

```text
Photon = conversation + interface
Fetch = reasoning + intent extraction
SpacetimeDB = workflow state + secure execution boundary
Splitwise = canonical financial state
```

The key separation is:

> **SpacetimeDB owns workflow state. Splitwise owns financial state.**

SpacetimeDB should not duplicate the Splitwise ledger or recalculate canonical balances. Its job is only to coordinate what is happening between the conversation and Splitwise.

## 11. Demo Script

### Setup

Three people are in an iMessage chat associated with a Splitwise group called **MHacks Weekend**.

### Demo

**User 1:**
> I got dinner, $84

The agent understands that User 1 paid $84 and produces a Photon card:

```text
Dinner — $84
Paid by: User 1
Split equally: User 1, User 2, User 3
Group: MHacks Weekend

[Add to Splitwise] [Edit]
```

User taps **Add to Splitwise**.

The expense appears in the real Splitwise group.

---

**User 2:**
> Wait I didn't eat dinner

The agent connects the follow-up to the previous expense:

```text
Update Dinner — $84

Remove User 2 from this split?

[Update Splitwise] [Cancel]
```

The original Splitwise expense is updated.

---

Later:

**User 3:**
> I paid $31 for the Uber, everyone was in this one

The agent creates another expense and saves it to Splitwise.

---

Finally:

**User 1:**
> What do I owe right now?

The agent reads current state from Splitwise and replies with the relevant balance information.

### Demo payoff

The judges see an entire Splitwise workflow happen without anyone opening Splitwise:

**conversation → understanding → interactive confirmation → real external action**

## 12. Stretch Features

Only add these after the core Splitwise flow is stable.

- Receipt image parsing with line-item assignment.
- Reply directly to an expense message to modify that expense.
- Voice-message expense capture.
- Smarter participant inference from conversational context.
- Automatically identify the most likely Splitwise group based on chat participants.
- Interactive expense history mini-app inside iMessage.
- “Why do I owe this?” explanation using Splitwise expense history.
- Splitwise group creation from an iMessage group.
- Multi-currency travel support.
- **Budgeting / pre-event planning** as a later phase once post-spend expense capture is excellent.

## 13. Explicitly Deferred: Budgeting

The earlier concept attempted to cover both:

**Budget → Spend → Reconcile → Settle**

For the current hackathon MVP, that is unnecessarily broad.

The focus is now:

**Spend → Record → Correct → Understand**

Budgeting remains a logical future extension because the same conversational agent could eventually help a group establish spending limits before an activity. It should not consume implementation time until the Splitwise-backed expense workflow is polished.

## 14. Success Criteria for the Hackathon

- A judge understands the product in under 20 seconds.
- A casual message such as “I got dinner, $84” becomes a correctly structured expense.
- The user can visually confirm the inferred split in iMessage.
- Confirmation creates a **real expense in Splitwise**.
- A conversational correction modifies the correct existing Splitwise expense.
- The system handles ambiguity by asking a targeted clarification rather than guessing.
- The Splitwise account remains the source of truth.
- The demo works end-to-end without budgeting, receipt OCR, or a separate traditional backend.
- SpacetimeDB remains a small workflow module rather than becoming a second financial ledger.
- The project feels like an intelligent integration, not a chatbot wrapped around an API.

## 15. Working One-Line Pitch

**An AI expense agent that lives in your iMessage group chat, understands who paid for what, and turns the conversation directly into accurate Splitwise expenses.**

## 16. Slightly Punchier Pitch

**Stop opening Splitwise after every group expense. Just talk normally — the agent figures out the split, confirms it in iMessage, and saves it to Splitwise for you.**

## 17. Architecture Rule of Thumb

Use this rule throughout implementation:

```text
Fetch interprets.
Spacetime coordinates.
Splitwise records.
Photon presents.
```

If a feature does not clearly fit one of those responsibilities, do not add it during the hackathon.
