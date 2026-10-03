# SpacetimeDB Gateway Verdict for Shared-Money Agent

**Research Date:** October 3, 2026  
**Question:** Can SpacetimeDB serve as the gateway/workflow-state layer for the Shared-Money Agent (iMessage → Splitwise)?  
**Primary Source:** [SpacetimeDB Official Documentation](https://spacetimedb.com/docs/)

---

## Executive Summary

**Verdict: NOT RECOMMENDED for this hackathon project.**

While SpacetimeDB _can technically_ make outbound HTTP calls via Procedures, the combination of:
- Procedures being in **beta** status
- **No Python SDK** (blocking Fetch uAgent integration)
- Learning curve for a new platform
- Transaction management complexity
- 20-hour time constraint with 1 builder

...makes a simple Bun/Node.js gateway service a significantly better choice for this hackathon.

---

## 1. What is SpacetimeDB?

### Overview
SpacetimeDB is a database that lets you write your entire application as a database module. Server logic runs inside the database as WebAssembly or V8 (for TypeScript). Clients subscribe to queries and get real-time updates over WebSocket.[^1]

> "SpacetimeDB is a database that is also a server."[^1]

### What is a Module?

A **module** is a collection of functions and schema definitions that define the structure of your database and the server-side logic.[^2]

**Supported Languages:**[^3]
- **Rust** - Compiles to WebAssembly
- **C#** - Compiles to WebAssembly
- **TypeScript** - Runs on V8
- **C++** - Compiles to WebAssembly

### Hosting Options

**Maincloud (Managed):**[^4]
- Fully managed serverless platform
- Handles infrastructure, scaling, replication, backups
- Scales to zero when idle
- Pay-per-use pricing

**Self-Hosting:**[^5]
- Run standalone server with `spacetime start`
- Requires Ubuntu 24.04+ (or similar) with Nginx + Let's Encrypt for HTTPS
- Supported via Railway template or custom VM setup

### Setup Time for Newcomers

According to official quickstarts: **"under 5 minutes"** to get a SpacetimeDB app running.[^6]

However, this assumes:
- Familiarity with the chosen language (Rust/C#/TypeScript/C++)
- Understanding of SpacetimeDB's data model (tables, reducers, procedures, views)
- No integration with external APIs requiring HTTP calls

**Realistic estimate for production-ready module with HTTP integration:** 2-4 hours minimum for an experienced developer; longer for first-time users.

---

## 2. Can a Module Make Outbound HTTP Calls?

### Answer: YES, but only via Procedures (not Reducers)

**Reducers vs Procedures:**[^7]

| Capability | Reducers | Procedures |
|---|---|---|
| Read from tables | ✓ | ✓ |
| Write to tables | ✓ | ✓ |
| Runs in transaction by default | ✓ | ✗ (manual) |
| External I/O (HTTP, etc.) | ✗ | ✓ |
| Side-effecting | ✗ | ✓ |

### How to Make HTTP Requests in Procedures

SpacetimeDB procedures can make HTTP requests using `ctx.http.get()` or `ctx.http.send()`.[^8]

**Example (Rust):**
```rust
#[spacetimedb::procedure]
fn call_splitwise_api(ctx: &mut spacetimedb::ProcedureContext) {
    let request = spacetimedb::http::Request::builder()
        .uri("https://secure.splitwise.com/api/v3.0/get_expenses")
        .method("GET")
        .header("Authorization", "Bearer YOUR_API_KEY")
        .body("")
        .expect("build failed");
    
    let response = ctx.http.send(request).expect("HTTP request failed");
    // Process response...
}
```

**Important Constraints:**[^8]
- **Procedures cannot send requests while a transaction is open.** You must manually open/commit transactions.
- Default timeout: **30 seconds** (increased from 500ms in early 2026)[^9]
- Maximum timeout: **180 seconds**[^9]
- **Procedures are currently in BETA.** The API may change in upcoming releases.[^8]

### Sanctioned Pattern for HTTP + DB Access

1. Start procedure (no transaction open)
2. Make HTTP call(s) using `ctx.http.send()`
3. Manually open transaction
4. Read/write database state
5. Commit transaction

This is more complex than reducer-only logic and requires careful error handling.

---

## 3. How External Clients Call SpacetimeDB

### Primary: WebSocket with Client SDKs

**Available Client SDKs:**[^10]
- TypeScript (browser/Node.js)
- Rust
- C#
- Unreal Engine (C++ & Blueprint)

**Python SDK: DOES NOT EXIST**[^11]

This is a **critical blocker** for the Fetch uAgent integration, which is written in Python and runs on Agentverse.

### Secondary: HTTP API

SpacetimeDB provides an HTTP API for calling reducers **and procedures**:[^12]

```http
POST /v1/database/:name_or_identity/call/:reducer
Content-Type: application/json
Authorization: Bearer <token>

["arg1", "arg2", ...]
```

**Path parameters:**
- `:reducer` - The name of the reducer **OR procedure**[^12]

**This means:**
- **Photon (TypeScript iMessage client)** can use the TypeScript SDK via WebSocket ✓
- **Fetch uAgent (Python on Agentverse)** would need to use raw HTTP calls with manual JSON encoding ⚠️

However, without a Python SDK:
- No generated type-safe bindings
- Manual construction of SATS-JSON format for complex types[^13]
- No real-time subscription support (HTTP is request/response only)

---

## 4. How Secrets (API Keys) Are Stored

### Runtime Environment Variables

SpacetimeDB Rust modules can read environment variables using standard Rust APIs:[^14]

```rust
let api_key = std::env::var("SPLITWISE_API_KEY")
    .expect("SPLITWISE_API_KEY not set");
```

**For local development:**[^15]
- Set environment variables when running `spacetime start`
- Supported variables: `STDB_PATH`, `SPACETIMEDB_LOG_CONFIG`, etc.

**For production (Maincloud or self-hosted):**[^14]
- Use dedicated secrets managers:
  - AWS Secrets Manager
  - HashiCorp Vault
  - Kubernetes Secrets
- Inject environment variables in deployment configuration
- **Never commit secrets to code or repositories**[^16]

---

## 5. Verdict: SpacetimeDB vs Tiny Bun/Node Service

### For a 20-Hour, 1-Builder Hackathon

**SpacetimeDB:**

**Pros:**
- Real-time subscriptions built-in
- Automatic state management
- Cool factor for sponsor prize track
- Type-safe client bindings (for supported languages)

**Cons:**
- **Procedures are in BETA** - API may change[^8]
- **No Python SDK** - Fetch uAgent cannot use native client
- Learning curve for SpacetimeDB concepts (reducers vs procedures, manual transactions, SATS type system)
- HTTP in procedures requires careful transaction management
- Setup complexity (environment variables, secrets, deployment)
- Potential debugging friction with WebAssembly/V8 runtime

**Tiny Bun/Node.js Service:**

**Pros:**
- **Familiar stack** - JavaScript/TypeScript
- **Fast to implement** - Express/Hono server in <1 hour
- **Direct HTTP calls** - `fetch()` to Splitwise API trivial
- **Works with Python** - Fetch uAgent can call REST endpoints easily
- **Simple state** - In-memory Map or SQLite for drafts/sessions
- **Zero learning curve**

**Cons:**
- No built-in real-time subscriptions (would need WebSocket server or polling)
- Manual state management
- Not as "impressive" to judges vs new tech

### Time Analysis

| Task | SpacetimeDB | Bun/Node Service |
|---|---|---|
| Learn platform | 2-3h | 0h (familiar) |
| Setup project | 0.5h | 0.25h |
| Define schema/tables | 1h | 0.5h (just types) |
| Implement HTTP to Splitwise | 1-2h (procedure + transactions) | 0.5h (fetch) |
| Build TypeScript client | 1h (SDK) | 1h (fetch API) |
| Build Python client | 2-3h (manual HTTP + SATS-JSON) | 0.5h (requests lib) |
| Debug/iterate | 2-3h (unfamiliar errors) | 1h |
| **TOTAL** | **10-13h** | **3.75h** |

**Time saved by using Bun/Node: 6-9 hours** - nearly half the hackathon!

---

## Final Recommendation

**Use a simple Bun/Node.js gateway service.**

### Why?

1. **Time is the #1 constraint** - 20 hours is tight for a 3-layer system (Photon → Gateway → Fetch → Splitwise)
2. **No Python SDK** is a major blocker - manual HTTP integration adds complexity
3. **Procedures are beta** - risk of bugs or API changes mid-hackathon
4. **Learning curve** - SpacetimeDB concepts take time to internalize
5. **Sponsor prize not worth the risk** - A working demo is better than an impressive-but-broken tech stack

### If You Still Want to Try SpacetimeDB

**Only pursue if:**
- You have >30 hours available
- You're comfortable debugging beta software
- You're willing to write manual HTTP client code in Python (no SDK)
- You want to learn SpacetimeDB for future projects (valuable learning experience!)

**Mitigation strategies:**
- Start with Rust module (best HTTP procedure examples)
- Use TypeScript module for faster iteration
- Budget 4-5 hours for SpacetimeDB-specific work
- Have a fallback plan (simple service) if you hit blockers

---

## References

[^1]: [SpacetimeDB Documentation - Getting Started](https://spacetimedb.com/docs/getting-started)
[^2]: [SpacetimeDB Documentation - The Database Module](https://spacetimedb.com/docs/databases)
[^3]: [SpacetimeDB Documentation - Language Support](https://spacetimedb.com/docs/intro/language-support/)
[^4]: [SpacetimeDB Documentation - Maincloud](https://spacetimedb.com/docs/how-to/maincloud)
[^5]: [SpacetimeDB Documentation - Self-Hosting](https://spacetimedb.com/docs/how-to/self-hosting)
[^6]: [SpacetimeDB Documentation - Rust Quickstart](https://spacetimedb.com/docs/modules/rust/quickstart)
[^7]: [SpacetimeDB Documentation - Functions](https://spacetimedb.com/docs/modules)
[^8]: [SpacetimeDB Documentation - Procedures](https://spacetimedb.com/docs/functions/procedures)
[^9]: [GitHub - Bump HTTP procedure timeouts PR #4630](https://github.com/clockworklabs/SpacetimeDB/pull/4630)
[^10]: [SpacetimeDB Documentation - Clients](https://spacetimedb.com/docs/sdks)
[^11]: Attempted fetch: `https://spacetimedb.com/docs/sdks/python` returned 404 Not Found (October 3, 2026)
[^12]: [SpacetimeDB Documentation - /v1/database HTTP API](https://spacetimedb.com/docs/http/database)
[^13]: [SpacetimeDB Documentation - SATS-JSON Data Format](https://spacetimedb.com/docs/sats-json)
[^14]: [AI VOID - Chapter 17: Production Best Practices](https://aivoid.dev/spacetime-db-guide-2026/chapter-17-production-best-practices/)
[^15]: [SpacetimeDB Source - standalone start.rs](https://git.adamlamers.com/PublicArchive/SpacetimeDB/raw/commit/ccaad881305b9231a5ccac4be7c7b5e19a68839d/crates/standalone/src/subcommands/start.rs)
[^16]: [SpacetimeDB Documentation - SpacetimeAuth Configure Project](https://git.adamlamers.com/PublicArchive/SpacetimeDB/src/commit/d4837c37ab213573d7775b3edabcf8cf9f37571c/docs/docs/spacetimeauth/configure-project.md)

---

**Document prepared by:** Cursor Agent Research Task  
**Based on primary sources from:** SpacetimeDB Official Documentation (spacetimedb.com)  
**Research conducted:** October 3, 2026
