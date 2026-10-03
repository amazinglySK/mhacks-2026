# Fetch.ai uAgents & Agentverse Integration Research

**Research Question:** How does a Fetch uAgent get hosted on Agentverse and talk to the rest of the system?

**Date:** October 3, 2026  
**Primary Sources:** Fetch.ai docs, uAgents framework docs, Agentverse docs, MHacks 2026 hackpack

---

## 1. Hosted Agent vs Local Agent with Mailbox

### Hosted Agents on Agentverse

**What they can do:**
- **Outbound HTTP requests**: ✅ Yes. Supported packages include `requests`, `httpx`, `aiohttp`, and `urllib3` [[1]](#ref-1).
- **Third-party Python packages**: ✅ Yes, from an approved list including: `openai`, `langchain`, `langchain-community`, `mcp`, `web3`, `cosmpy`, `pymongo`, `mysqlclient`, and more [[1]](#ref-1)[[2]](#ref-2).
- **Secrets/environment variables**: ✅ Yes. Agentverse provides an "Agent Secrets" UI panel (like a `.env` file) and CLI commands (`avctl hosting secrets add/delete/get`) [[3]](#ref-3)[[4]](#ref-4).
- **LLM SDKs**: ✅ Yes. Can use OpenAI SDK, Anthropic, Google AI, etc. Agentverse automatically injects `ASI1_API_KEY` and `ASI1_BASE_URL` for hosted agents [[5]](#ref-5).

**Key characteristics:**
- Cloud-based, managed by Agentverse — no infrastructure management needed [[6]](#ref-6).
- Function as lightweight tasks that **reset global variables after each call**; must use Agent Storage for stateful behavior [[6]](#ref-6).
- Code edited in browser via the Agentverse code editor [[7]](#ref-7).
- Omit `agent.run()` when pasting code into the hosted editor; Agentverse runs it automatically [[6]](#ref-6).

### Local Agents with Mailbox

**What they can do:**
- **Outbound HTTP requests**: ✅ Yes. No restrictions; full Python environment [[8]](#ref-8).
- **Third-party Python packages**: ✅ Yes, any package installable via `pip` [[8]](#ref-8).
- **Secrets/environment variables**: ✅ Yes. Use standard `.env` files or environment variables in your own runtime.
- **Infrastructure**: You manage it (local machine, server, or cloud VM) [[8]](#ref-8).

**Key characteristics:**
- Full control over runtime and dependencies.
- Must run `agent.run()` to start the agent.
- Connect to Agentverse via mailbox for discoverability [[9]](#ref-9).
- Mailbox enables two-way communication even when agent is offline or behind a firewall [[9]](#ref-9).

---

## 2. Discoverability Requirements

To be "discoverable" and qualify for MHacks 2026 Fetch.ai prizes, agents must:

### Mandatory Requirements

1. **Register on Agentverse**: Create agent record on Agentverse (hosted or local with mailbox) [[10]](#ref-10).
2. **Implement Agent Chat Protocol (ACP)**: Use `uagents>=0.25.5` and attach the chat protocol:
   ```python
   from uagents_core.contrib.protocols.chat import (
       ChatMessage, ChatAcknowledgement, TextContent,
       EndSessionContent, chat_protocol_spec
   )
   from uagents import Protocol
   
   protocol = Protocol(spec=chat_protocol_spec)
   agent.include(protocol, publish_manifest=True)
   ```
   [[11]](#ref-11)[[12]](#ref-12)

3. **ASI:One compatibility**: Implementing ACP makes the agent callable from ASI:One Chat [[13]](#ref-13).

### Discoverability Mechanisms

- **Almanac registration**: Agents automatically register with the Almanac when they start with `mailbox=True` and `publish_agent_details=True` [[14]](#ref-14).
- **Agentverse marketplace**: Agents with good README, metadata, and documentation are discoverable in the marketplace [[6]](#ref-6).
- **ASI:One Chat Protocol**: ACP v0.3.0 is the expected format for ASI:One. Must acknowledge every `ChatMessage` and reply with `ChatAcknowledgement` [[11]](#ref-11)[[15]](#ref-15).

---

## 3. External TypeScript App ↔ Agent Communication

### Option A: REST Mailbox API (Simplest for TypeScript)

**How it works:**
- TypeScript app sends messages via Agentverse mailbox REST API [[16]](#ref-16)[[17]](#ref-17).
- Agent polls or receives messages from its mailbox.

**TypeScript example:**
```typescript
// Send message to agent
const response = await fetch("https://agentverse.ai/v1/submit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    version: 1,
    sender: "your-app-address",
    target: "agent-address-here",
    session: crypto.randomUUID(),
    schema_digest: "proto:...", // From protocol definition
    payload: "base64-encoded-message"
  })
});

// List agent's mailbox messages
const messages = await fetch(
  "https://agentverse.ai/v1/mailbox?page=1&size=50",
  { headers: { Authorization: "Bearer YOUR_TOKEN" } }
);
```

**Latency:** REST roundtrip + agent processing time (typically sub-second for simple operations).

### Option B: Local Agent with REST Endpoint

**How it works:**
- Agent exposes `on_rest_post` handler on a local port.
- TypeScript app sends HTTP POST directly to agent.

```python
from uagents import Agent

agent = Agent(port=8001)

@agent.on_rest_post("/message")
async def handle_message(ctx: Context, request: str):
    # Process and return response
    return {"reply": "..."}
```

**Latency:** Direct HTTP call (fastest, ~10-100ms).

### Option C: Agent Chat Protocol over HTTP

**How it works:**
- TypeScript wraps messages in `ChatMessage` format.
- Agent receives via ACP handler.

```python
@protocol.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.now(),
        acknowledged_msg_id=msg.msg_id
    ))
    # Process msg.content[0].text
    await ctx.send(sender, ChatMessage(
        content=[TextContent(text="reply"), EndSessionContent()]
    ))
```

**Latency:** Depends on mailbox polling or mailbox webhook delivery.

### Recommendation for Photon TypeScript App

**Use Option A (REST Mailbox API)** for MHacks:
- ✅ Works with both hosted and local agents
- ✅ No persistent connection needed
- ✅ TypeScript-friendly (just `fetch`)
- ✅ Agent can be offline; messages queued
- ⚠️ Requires encoding messages in uAgents Envelope format

---

## 4. LLM Integration Options

### Option A: ASI:One API

**Capabilities:**
- Tool/function calling: ✅ Yes, OpenAI-compatible `tools` parameter [[18]](#ref-18).
- Vision: ✅ Yes, on `asi1` model via `image_url` content parts [[19]](#ref-19).
- Streaming: ✅ Yes, via `stream: true` [[18]](#ref-18).

**Usage in agent:**
```python
from openai import OpenAI
import os

# Hosted agents: env vars auto-injected
client = OpenAI(
    base_url=os.environ["ASI1_BASE_URL"],
    api_key=os.environ["ASI1_API_KEY"]
)

response = client.chat.completions.create(
    model="asi1",
    messages=[...],
    tools=[...],  # Function calling
    max_tokens=2048
)
```
[[5]](#ref-5)[[18]](#ref-18)

**Prize consideration:** Using ASI:One counts toward "Best Use of ASI:One" ($500 prize) [[10]](#ref-10).

### Option B: OpenAI / Anthropic / Gemini

**Capabilities:**
- All support tool/function calling and vision.
- Use their respective SDKs (all approved imports on Agentverse) [[1]](#ref-1).

**Usage:**
```python
from openai import OpenAI  # or anthropic, google-generativeai

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
# Same OpenAI API format
```

**Prize consideration:** Does NOT count toward ASI:One prize, but still valid for main track.

### Recommendation

**Use ASI:One API (`asi1` model)** for MHacks because:
1. ✅ Prize requirement: "integrate ASI:One as the reasoning engine" [[10]](#ref-10)
2. ✅ Tool calling + vision support covers all MVP needs
3. ✅ Free for hosted agents (auto-injected credentials) [[5]](#ref-5)
4. ✅ OpenAI-compatible API (easy migration if needed)

---

## 5. MHacks 2026 Judging Criteria

**Source:** [MHacks Fetch.ai Hackpack](https://www.fetch.ai/events/hackathons/m-hacks/hackpack) [[10]](#ref-10)

### Prize Tracks

1. **Best Use of Fetch.ai** ($1250 + internship interview)
   - Must: Register agents on Agentverse, implement Chat Protocol, use ASI:One as reasoning engine
   - Judges look for "strong end-to-end implementation"

2. **Best Deployment on Agentverse** ($750 + internship interview)
   - Highest number of useful, discoverable, well-documented agents
   - Judges value scale, clarity, ease of discovery

3. **Best Use of ASI:One** ($500 + internship interview)
   - Most effective application of ASI:One as core reasoning engine

### Judging Rubric (All Tracks)

1. **Functionality & Technical Implementation (25%)**
   - Does the agent system work as intended?
   - Are agents properly communicating and reasoning in real time?

2. **Use of Fetch.ai Technology (20%)**
   - Are agents registered on Agentverse?
   - Is Chat Protocol implemented for ASI:One discoverability?

3. **Innovation & Creativity (20%)**
   - How original or creative is the solution?
   - Is it solving a problem in a new way?

4. **Real-World Impact & Usefulness (20%)**
   - Does it solve a meaningful problem?
   - How useful would this be to an end user?

5. **User Experience & Presentation (15%)**
   - Well-structured demo?
   - Smooth and intuitive UX?

---

## Recommendations for MHacks 2026 Build

### Deployment Choice

**Use a Hosted Agent on Agentverse:**

✅ **Pros:**
- Fastest setup (no infrastructure)
- Auto-injected ASI:One credentials
- Satisfies all prize requirements out of the box
- Can make outbound HTTP to Splitwise API
- Can install third-party packages (Photon SDK if needed)
- Secrets management built-in

⚠️ **Cons:**
- Stateless (must use Agent Storage for Listening Sessions and Drafts)
- Limited to approved Python packages (but all needed ones are available)

### Communication Flow: Photon TypeScript ↔ Fetch Agent

```
Photon TypeScript App (spectrum-ts)
        ↓ (HTTP POST)
Agentverse Mailbox REST API (/v1/submit)
        ↓ (message delivery)
Hosted Fetch Agent (Python)
        ↓ (ASI:One API call)
ASI:One LLM (tool calling + vision)
        ↓ (reasoning result)
Agent processes & calls Splitwise API
        ↓ (response via mailbox)
Photon polls mailbox (/v1/mailbox) ← fetches reply
        ↓
iMessage group chat (via spectrum-ts)
```

### LLM Choice

**Use ASI:One (`asi1` model):**
- Satisfies prize requirement
- Tool calling for expense parsing
- Vision for receipt images
- Free for hosted agents

### Discoverability Checklist

- [x] Register hosted agent on Agentverse
- [x] Implement Agent Chat Protocol (ACP v0.3.0)
- [x] Use `publish_manifest=True` when including protocol
- [x] Add README with clear purpose and setup instructions
- [x] Add metadata (name, description, creator)
- [x] Custom avatar icon for marketplace
- [ ] Test agent responds correctly to ASI:One Chat

---

## References

<a id="ref-1"></a>[1] [Agentverse: allowed imports](https://agentverse.ai/docs/allowed-imports)  
<a id="ref-2"></a>[2] [allowed-imports.mdx](https://docs.agentverse.ai/documentation/advanced-usages/allowed-imports.mdx)  
<a id="ref-3"></a>[3] [AVCTL Hosting](https://agentverse.ai/docs/avctl/avctl-hosting)  
<a id="ref-4"></a>[4] [Hosted Code Editor](https://docs.agentverse.ai/documentation/create-agents/hosted-code-editor.md)  
<a id="ref-5"></a>[5] [Enable the Chat Protocol](https://docs.agentverse.ai/documentation/getting-started/enable-chat-protocol.mdx)  
<a id="ref-6"></a>[6] [Create and run Hosted Agents on Agentverse](https://agentverse.ai/docs/quickstart)  
<a id="ref-7"></a>[7] [Hosted Code Editor](https://docs.agentverse.ai/documentation/create-agents/hosted-code-editor.md)  
<a id="ref-8"></a>[8] [Create a Local Agent (uAgent)](https://docs.agentverse.ai/v-2/documentation/create-agents/local-agent-u-agent.md)  
<a id="ref-9"></a>[9] [Utilizing the Agentverse Mailroom feature](https://agentverse.ai/docs/uAgents/mailbox)  
<a id="ref-10"></a>[10] [MHacks Fetch.ai Hackpack](https://www.fetch.ai/events/hackathons/m-hacks/hackpack)  
<a id="ref-11"></a>[11] [Agent Chat Protocol](https://innovationlab.fetch.ai/resources/docs/agent-communication/agent-chat-protocol)  
<a id="ref-12"></a>[12] [Create an ASI:One Compatible Agent](https://innovationlab.fetch.ai/resources/docs/examples/chat-protocol/asi-compatible-uagents)  
<a id="ref-13"></a>[13] [Enable the Chat Protocol](https://docs.agentverse.ai/documentation/getting-started/enable-chat-protocol.mdx)  
<a id="ref-14"></a>[14] [Create an ASI:One Compatible Agent](https://innovationlab.fetch.ai/resources/docs/examples/chat-protocol/asi-compatible-uagents)  
<a id="ref-15"></a>[15] [Agent Chat Protocol v0.3.0](https://innovationlab.fetch.ai/resources/docs/agent-communication/agent-chat-protocol)  
<a id="ref-16"></a>[16] [Submit Message Envelope](https://docs.agentverse.ai/v-1/api-reference/mailbox/submit-message-envelope.md)  
<a id="ref-17"></a>[17] [List Mailbox Messages](https://docs.agentverse.ai/v-1/api-reference/mailbox/list-mailbox-messages.md)  
<a id="ref-18"></a>[18] [Chat Completions API](https://docs.asi1.ai/documentation/build-with-asi-one/chat-completions.md)  
<a id="ref-19"></a>[19] [Chat Completions API - Image Input](https://docs.asi1.ai/documentation/build-with-asi-one/chat-completions.md#image-input)
