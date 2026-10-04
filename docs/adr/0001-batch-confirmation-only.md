# ADR 0001: Batch Confirmation Only (No Per-Draft Confirmation)

**Status:** Accepted  
**Date:** 2026-10-03  
**Context:** Listening Session lifecycle design for hackathon MVP

## Decision

Drafts created during a listening session have **no explicit per-draft confirmation step**. Users may modify drafts via natural language during the session, and all drafts commit together as a batch when the user stops listening, after one final confirmation prompt.

## Context

The agent creates drafts by parsing messages like "I paid $30 for pizza." The question arose: should each draft require user confirmation before it's considered "ready to commit"?

### Alternatives Considered

1. **Per-draft confirmation:** Agent asks "Is this correct?" after each draft, user must explicitly confirm via tapback/reply before it's commit-eligible.
2. **Three-state lifecycle:** Drafts move through `unconfirmed → confirmed → committed`, with confirmation as an explicit state transition.
3. **Batch confirmation only (chosen):** Drafts are modifiable during the session; implicit confirmation happens at session end when user approves the batch.

## Rationale

### Why batch confirmation only?

1. **Conversational flow:** In natural conversation, people don't confirm every statement. "I paid $30" followed by silence implies acceptance. Explicit confirmation after every expense breaks chat rhythm.

2. **Hackathon time constraint:** Per-draft confirmation adds 20-30% more state transitions, UI interactions, and edge cases (e.g., "what if user confirms then wants to modify?"). With 20 hours remaining, batch confirmation is the simplest path to a working demo.

3. **Modification is confirmation:** Users can modify drafts ("change that to $35"). The act of modifying or leaving alone is implicit feedback. Only the final batch needs explicit approval because it's irreversible (writes to Splitwise).

4. **Safety at the gate:** The final Photon app card shows all drafts before commit, giving one clear checkpoint before any financial action occurs.

### Why not per-draft confirmation?

- **Friction:** Requires user action after every expense mention, slowing conversation.
- **Complexity:** Adds a `confirmed` state, confirmation UI (tapbacks/replies/buttons), and ambiguity around "confirmed but wants to modify" scenarios.
- **Not strictly necessary:** The final confirmation catches all errors before Splitwise writes.

## Consequences

### Positive

- **Faster conversation:** No interruption after each expense.
- **Simpler state machine:** Two states (`draft` → `committed`) instead of three.
- **Fewer edge cases:** No "confirmed but needs modification" scenarios.
- **Clearer final gate:** One confirmation point (the stop card) is easier to understand than N micro-confirmations.

### Negative

- **Risk of silent errors:** If the agent misparsed an expense and user didn't notice during the session, the error only surfaces at the final stop confirmation.
- **Bulk correction UX:** User must review all drafts at stop time, rather than confirming as they go.

### Mitigations

- Agent sends a summary message after creating each draft: "Recorded: Pizza $30, Alice paid, split 3 ways." This gives immediate feedback even without requiring confirmation.
- "what do you got @splitty?" command lets users check drafts mid-session.
- Users can modify drafts anytime during the session via natural language.
- Final confirmation card shows all drafts with full details before commit.

## Implementation Notes

- Drafts have a single pre-commit state: `draft` (modifiable).
- Agent Storage schema: `Draft { status: 'draft' | 'committed', ... }`
- No `confirmed` boolean or enum value.
- Modification updates the draft in place; no state transition needed.

## Reversibility

**Medium effort to reverse.** Could add per-draft confirmation post-hackathon by:
1. Adding a `confirmed: bool` field to Draft schema
2. Requiring confirmation before including draft in stop batch
3. Extending Photon integration to support tapback-to-confirm

State machine changes would propagate through: draft creation, modification flow, summary display, and stop logic.

## Related

- `GLOSSARY.md`: Draft, Commit, Modification definitions
- `docs/agents/topology.md`: State storage in Agent Storage
