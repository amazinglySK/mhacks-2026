# Photon Spectrum-TS iMessage Capabilities Research

**Date**: October 3, 2026  
**Primary Source**: `photon_spectrum_ts_docs_index.md` (local repo file)  
**Purpose**: Evaluate iMessage group chat capabilities for hackathon bot

## Executive Summary

For a hackathon timeline, **Cloud (`@spectrum-ts/imessage`)** is the clear choice: it supports tapback reactions, interactive app cards, and group automation features that the local package lacks. The local package requires a Mac and cannot send reactions or interactive content.

---

## Cloud vs Local Setup

### Cloud Package (`@spectrum-ts/imessage`)
- **What's needed**: Managed Spectrum cloud lines with account/sponsor credits
- **Platform**: Node.js or Bun (no Mac required)
- **Time to first message**: *Not specified in available docs*
- **Key advantage**: Full interactive features including reactions, effects, app cards

### Local Package (`@spectrum-ts/imessage-local`)
- **What's needed**: macOS system with access to `~/Library/Messages/chat.db`
- **Platform**: Bun or Node.js on Mac
- **Limitations**: No reactions, no typing indicators, no effects, no group creation, app content renders as plain text URL

**Source**: Lines 40-68, `photon_spectrum_ts_docs_index.md`

---

## Group Chat Capabilities

### Receiving Messages with Sender Identity
- **Supported**: Both Cloud and Local can interact with existing group chats (line 67)
- **Identity details**: Documentation references a "Spaces and Users" section covering "conversations, DMs, groups, and the identity system" (line 14)
- **⚠️ Gap**: Specific details on extracting sender handle (phone/email) and display name not present in index file

**Source**: Lines 14, 67

### Detecting Mentions
- **⚠️ Not documented**: No explicit mention detection API described in the index file
- **Workaround**: May require text matching on message content

---

## Interactive Features

### Sending Tapback Reactions ✅
- **Cloud only**: "Reactions (Tapbacks) and threaded replies" explicitly supported (line 50)
- **Local**: Not supported
- **Details**: Linked to [Reactions and Replies docs](https://photon.codes/docs/spectrum-ts/reactions-and-replies)

**Source**: Lines 15, 50

### Threaded Replies ✅
- **Cloud**: Supported alongside reactions (line 50)
- **Local**: Not mentioned

**Source**: Line 50

### Editing Sent Messages ✅
- **Cloud only**: "Editing and unsending messages" (line 51)
- **Local**: Not supported

**Source**: Line 51

### Confirmation Options (App Cards/Polls)
- **Cloud**: Universal `app(...)` content renders as **native iMessage App card** (line 61)
- **Local**: `app(...)` falls back to text URL (line 62)
- **Interactive content types**: Apps, Polls, Custom Content mentioned in Content Module (line 25)
- **⚠️ Gap**: Whether button taps/poll responses trigger inbound events not specified in index

**Source**: Lines 25, 61-62

---

## Media & Attachments

### Inbound Image Attachments
- **Supported**: Both Cloud and Local support "Sending/receiving text, markdown, attachments, and contacts" (line 66)
- **⚠️ Gap**: Specifics on downloading image bytes or accessing attachment data not detailed in index

**Source**: Line 66

---

## Architecture Model

### Webhook vs Long-Running Process
- **Webhooks**: Documented as available for "event-driven agent architectures" (line 17)
- **Local package**: Requires macOS system access, implies long-running process reading local database
- **Cloud package**: Can run on Node.js/Bun, supports webhook deployment

**Source**: Lines 17, 40-43

---

## Recommendations for Hackathon Bot

### ✅ Use Cloud Package (`@spectrum-ts/imessage`)
**Rationale**:
1. **Reactions**: Native tapback support for per-message reactions
2. **Confirmation flow**: Interactive app cards can potentially handle button-based confirmations (needs verification via full docs)
3. **No Mac required**: Deploy anywhere Node.js/Bun runs
4. **Group features**: Full group automation support

### How to React to Messages
Use the reactions API (Cloud only):
```typescript
// Conceptual - exact API needs verification from full docs
message.react('👍'); // Tapback reaction
```
**Source**: Line 50 reference to reactions capability

### How to Implement Confirmation
**Primary approach**: Use `app(...)` content to render native iMessage App cards (Cloud only)
- **⚠️ Unknown**: Whether user interactions with app cards/polls generate inbound events
- **Fallback**: Text-based confirmation with message reactions as accept/reject signals

**Source**: Lines 25, 61

### Image Attachment Support
**Status**: Receiving attachments is supported (line 66)
- **Next step**: Verify full docs for attachment download API
- **Use case**: Receipt parsing for expense tracking

---

## Information Gaps (Needs Full Docs)

1. **Setup timeline**: How long to provision a cloud line? Sponsor credit requirements?
2. **Sender identity extraction**: API for getting handle + display name from group message sender
3. **Mention detection**: Native API or text parsing required?
4. **Interactive event callbacks**: Do app card button taps fire inbound events?
5. **Attachment download**: How to access image bytes from inbound attachment?

**Next action**: Review full docs at https://photon.codes/docs/spectrum-ts/introduction for implementation details.
