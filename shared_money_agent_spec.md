# Shared-Money Agent
*Hackathon Product Spec — Working Draft*

*A conversational financial layer for group activities — from budget planning to spending to settlement.*

## 1. Product Thesis

Group activities have two money phases:

1. People decide what they can afford and what the activity should cost.
2. They spend unevenly, cover one another, make corrections, and settle afterward.

Existing expense tools usually start only after the money has already been spent.

**Goal:** create one conversational agent that understands the full financial lifecycle of a group activity:

**Budget → Spend → Reconcile → Settle**

## 2. Core User Story

A group talks normally in iMessage.

The agent understands statements such as:

- “Let’s keep this under $50 each.”
- “I paid $86 for dinner.”
- “Exclude Sarah.”
- “Alex already paid me $20.”
- “How much do I still owe?”

It converts that conversation into a structured shared financial state and keeps it updated.

## 3. Lifecycle

| Phase | What the group does | What the agent does | Primary output |
|---|---|---|---|
| **1. Budget** | Discusses the activity, target spend, limits, and priorities | Extracts budget constraints, participant count, categories, and unresolved assumptions | Live budget card |
| **2. Spend** | People pay for shared items in uneven ways | Captures expenses, payer, participants, exclusions, custom shares, and receipts | Running group ledger |
| **3. Reconcile** | People correct mistakes and clarify who consumed what | Understands corrections, settlements, reimbursements, and ambiguous statements | Updated balances + explanation |
| **4. Settle** | Group wants to close out the activity | Simplifies debts and explains the minimum set of transfers | Final settlement card |

## 4. MVP Scope

- Natural-language expense capture from group chat.
- Shared activity budget, such as a total budget or per-person target.
- Equal splits and exclusions, such as “everyone except Maya.”
- Simple custom shares, such as “Alex owes only $12.”
- Corrections to prior expenses using normal language.
- Settlements, such as “Sam paid me back $20.”
- Deterministic balance calculation and debt simplification.
- One live Photon card that reflects current budget, spend, balances, and settlement status.
- A short explainability view: “Why do I owe X?” with line-item reasoning from the ledger.

## 5. Out of Scope for First Build

- Holding or transferring real money.
- Bank, Venmo, or card-account integrations.
- Full personal-finance tracking.
- Generic task coordination, rides, chores, or scheduling.
- Complex accounting, tax, or currency-conversion logic.
- Receipt OCR unless the MVP is already stable.

## 6. Intelligence Boundary

The LLM/agent should interpret intent and convert conversation into structured financial operations.

The ledger engine should perform all arithmetic deterministically.

```text
conversation
  ↓
intent extraction / clarification
  ↓
structured financial operation
  ↓
deterministic ledger + budget engine
  ↓
live shared card / settlement output
```

## 7. Core Data Model

- **Group / Activity:** id, title, participants, currency, lifecycle stage.
- **Budget:** total target, per-person target, optional category limits.
- **Expense:** amount, payer, participants, split rule, category, timestamp, source message.
- **Settlement:** sender, receiver, amount, timestamp.
- **Adjustment:** correction that modifies or reverses a prior financial operation.
- **Balance:** derived value only; never stored as the source of truth.

## 8. Sponsor-Tech Fit

| Technology | Role | Use only if justified by the core flow |
|---|---|---|
| **Photon** | Primary iMessage interface: read conversation context, render/update the live financial card, receive corrections and confirmations | **Yes — core product surface** |
| **Fetch / Agentverse** | Agent reasoning: classify money intent, decide whether clarification is needed, maintain workflow logic, expose the same workflow in ASI:One | **Yes if entering the Fetch track** |
| **SpacetimeDB** | Real-time shared state when multiple people edit/confirm the same budget or ledger concurrently | **Optional for MVP** |

## 9. Demo Script

1. Group: “Let’s keep tomorrow under $45 each for four people.”
2. Agent creates a live budget card: target **$180**.
3. User: “I paid $92 for dinner, split between everyone except Maya.”
4. Ledger updates and remaining budget changes.
5. Another user: “I got the Uber, $38 for all four.”
6. Ledger updates again.
7. User: “Actually Maya sent me $20 already.”
8. Agent records a settlement, not a new expense.
9. User: “Why do I still owe Alex?”
10. Agent shows the specific expenses and settlement history.
11. Group taps **Settle**.
12. Agent returns the simplified transfers.

## 10. Stretch Features

- Receipt image parsing with line-item assignment through chat.
- Group pot / contribution pool for trips, clubs, or events.
- Category-aware budgets such as food, transport, and tickets.
- Proactive warnings when a proposed purchase would break the budget.
- Reimbursement tracking for clubs or employers.
- Multi-currency trips.

## 11. Success Criteria for the Hackathon

- A judge understands the value proposition in under 20 seconds.
- A messy financial conversation reliably becomes structured state.
- A correction in natural language updates the same ledger correctly.
- Budgeting and post-spend settlement both work in one coherent activity.
- At least one interaction is visibly live/interactive in Photon.
- The arithmetic is deterministic and explainable.
- The project feels complete even without any stretch feature.

## 12. Working One-Line Pitch

**An AI financial layer for group chats that helps people budget before an activity, tracks shared spending as it happens, and automatically reconciles who owes whom afterward.**
