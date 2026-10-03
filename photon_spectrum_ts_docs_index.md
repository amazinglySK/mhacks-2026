# Photon `spectrum-ts` Documentation Index

This index maps out the essential documentation for building agent applications with Photon's `spectrum-ts`, with a specific deep dive into the **iMessage Provider** capabilities, features, and setup.

## 📚 General Documentation Index

Navigate through the [Photon Documentation](https://photon.codes/docs/spectrum-ts/introduction) using these core links:

### 1. Core Concepts & Getting Started

* **[Introduction](https://photon.codes/docs/spectrum-ts/introduction)**: Overview of Spectrum and the multi-platform agent architecture.
* **[Messages](https://photon.codes/docs/spectrum-ts/messages)**: Core primitives for receiving, narrowing, and acting on inbound messages.
* **[Spaces and Users](https://photon.codes/docs/spectrum-ts/spaces-and-users)**: Understanding conversations, DMs, groups, and the identity system.
* **[Reactions and Replies](https://photon.codes/docs/spectrum-ts/reactions-and-replies)**: Working with threading and tapbacks.
* **[Platform Narrowing](https://photon.codes/docs/spectrum-ts/platform-narrowing)**: Handling provider-specific edge cases gracefully.
* **[Webhooks](https://photon.codes/docs/spectrum-ts/webhooks)**: Setting up event-driven agent architectures.

### 2. Content & Interactivity

The API provides rich message composition for agent interactions via the **[Content Module](https://photon.codes/docs/spectrum-ts/content)**:

* **Basic**: Text, Markdown, Contacts, Voice.
* **Media**: Attachments, Rich Links, Avatars.
* **Interactivity**: Apps, Polls, Custom Content.
* **Operations**: Replies, Edits, Unsend, Read receipts, Typing indicators.
* **Group Management**: Rename, Membership, Composing content.

### 3. Providers

`spectrum-ts` abstracts multiple platforms. Direct links to available providers:

* **[iMessage](https://photon.codes/docs/spectrum-ts/providers/imessage)** (Focus for this guide)
* **[Voice](https://photon.codes/docs/spectrum-ts/providers/voice)**
* **[Terminal](https://photon.codes/docs/spectrum-ts/providers/terminal)**
* **[WhatsApp Business](https://photon.codes/docs/spectrum-ts/providers/whatsapp)**
* **[Telegram](https://photon.codes/docs/spectrum-ts/providers/telegram)**

## 💬 iMessage Provider Details & Capabilities

The [iMessage integration](https://photon.codes/docs/spectrum-ts/providers/imessage) is split into two independent platforms depending on your agent's deployment environment:

1. **Cloud Package** (`@spectrum-ts/imessage` / `imessage`): For managed Spectrum cloud lines. Runs on Node.js or Bun.
2. **Local Package** (`@spectrum-ts/imessage-local` / `local_imessage`): For accessing a local Mac's Messages database directly (`~/Library/Messages/chat.db`). Requires macOS with Bun or Node.js.

### 🌟 Interesting Agent Features & API Capabilities

The Cloud package exposes powerful native iMessage features that are perfect for building highly interactive agents:

* **Interactive Agents (Cloud Only)**:
  * Reactions (Tapbacks) and threaded replies.
  * Editing and unsending messages.
  * Streaming text and live typing indicators (great for AI generation states).
  * Sending and receiving read receipts.
  * Triggering full-screen Message effects and chat backgrounds.

* **Group Automation (Dedicated Cloud lines only)**:
  * Creating new group chats.
  * Renaming groups and changing group avatars.
  * Managing group membership and listening to inbound group events.

* **Native Integrations**:
  * Universal `app(...)` content renders as a native iMessage App card (Cloud) instead of just a text URL (Local).
  * Native contact-card sharing.

* **Universal Basics (Both Cloud & Local)**:
  * Sending/receiving text, markdown, attachments, and contacts.
  * Interacting with existing DMs and group chats.

*Note: The Local package cannot stream text (typing is a no-op) and does not support effects, read receipts, or group creation.*

## 🛠 Setup & Migration Notes

### [Migrating from `local: true`](https://photon.codes/docs/spectrum-ts/providers/imessage#migrating-from-local-true)

If you are updating an older agent, the combined-package API `imessage.config({ local: true })` has been removed. You must now explicitly import the local package:

```typescript
import { Spectrum } from "spectrum-ts";
import { localIMessage } from "@spectrum-ts/imessage-local";

const app = await Spectrum({
  providers: [localIMessage.config()],
});
```

### Deployment Best Practices

* **Keep Entrypoints Separate:** If your repository has both a deployed cloud worker and a Mac development tool, keep their composition modules separate (e.g., `cloud-app.ts` vs `mac-app.ts`). Do not dynamically switch them at runtime, as bundlers will pull the native SQLite dependency into your cloud graph.
* **Explicit Cloud Clients:** For agents that need to restrict the SDK to a known subset of cloud lines, pass credentials explicitly. Note that explicit tokens are not automatically renewed by Spectrum.

```typescript
imessage.config({
  clients: [{ address: "...", token: "...", phone: "..." }],
});
```