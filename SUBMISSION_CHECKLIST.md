# Devpost Submission Checklist & Verification Brief

**Hackathon**: Build, Ship, Shape: Amazon Developer Hackathon (Devpost 2026)  
**Primary Track**: Alexa+ Track  
**Mini-Challenge**: Open Source Contribution  
**Status**: Atlas and standalone validator published; final Devpost entry and video pending.

---

## 1. Repository Links & Metadata

| Submission Item | Value | Status / Verification |
| :--- | :--- | :--- |
| **Primary Code Repository** | `https://github.com/TeamArclight/Atlas.git` | Published primary repository |
| **Open Source License** | MIT License | Added at root [`LICENSE`](LICENSE) and [`contributions/atlas-plan-validator/LICENSE`](contributions/atlas-plan-validator/LICENSE) |
| **Additional Contribution Package** | `atlas-plan-validator` | Packaged under `contributions/atlas-plan-validator/`; published separately at TeamArclight/atlas-plan-validator |
| **Additional Contribution URL** | https://github.com/TeamArclight/atlas-plan-validator | Published commit cad7c4a |
| **Entrant GitHub Username** | Nightingale2494 | User-confirmed: https://github.com/Nightingale2494 |
| **Submission Deadline** | Friday, October 23, 2026, 12:00 PM (noon) PDT | Verified against official rules |

---

## 2. System Boundary & Truthful Classification

In strict compliance with hackathon rules, all components are transparently classified:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CLASSIFICATION                          │
├──────────────────────────────────────┬──────────────────────────────────────┤
│          REAL INTEGRATIONS           │    FICTIONAL & SIMULATED BOUNDARIES  │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 1. Google Gemini Live REST Planner   │ 1. Fictional Venue Inventory         │
│    (gemini-3.5-flash via POST REST   │    (The Grand Orchid / Garden Hall   │
│    endpoint with JSON schema & retry)│    at /demo/venue; no real money)    │
│ 2. Model Context Protocol (MCP)      │ 2. Simulated Catering / Cake Vendors │
│    (@modelcontextprotocol/sdk v1.26  │    (Quotes generated for companion   │
│    Streamable HTTP on /mcp)          │    mission steps with zero cost)     │
│ 3. Playwright Headless Worker        │ 3. Simulated Household Identity      │
│    (Navigates DOM, fills forms,      │    (Role tags: adult vs child; no    │
│    clicks, captures ARIA snapshots)  │    real biometric identity provider) │
│ 4. atlas-plan-validator Package      │ 4. Deterministic Eval Fixtures       │
│    (Independent DAG validator with   │    (npm run eval uses 5 offline      │
│    Kahn cycle detection, zero deps)  │    reproducible test scenarios)      │
│ 5. Cryptographic Action Ledger       │                                      │
│    (SHA-256 hash chaining, GENESIS)  │                                      │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 3. Live Gemini Planning Verification

Live inference was executed and verified against Google Gemini:

- **Provider**: Google AI Studio REST API (`generativelanguage.googleapis.com/v1beta/models`)
- **Configured Model**: `gemini-3.5-flash`
- **Execution Lifecycle Verified**:
  1. **Planning (`create_mission`)**: Formulated 3 structured steps (`fictional_venue_book` for INR 12,000, `fictional_catering_quote` for INR 0, `fictional_cake_quote` for INR 0). Planned commitment: INR 12,000; remaining buffer: INR 28,000.
  2. **Deterministic Graph Validation**: Validated via `atlas-plan-validator`. Verified tool allowlist, budget bounds, non-negative costs, acyclic DAG structure, and approval gate.
  3. **Contextual Approval Request**: Generated one-time confirmation token bound to mission `#1858c39d` with 5-minute TTL.
  4. **Browser Execution**: Headless Playwright worker filled the occasion, verified ticket pricing (`INR 12,000`), clicked *Confirm Booking*, and captured DOM accessibility snapshot.
  5. **Persistence**: Disk-backed booking recorded with reference `#ATLAS-1858C39D`.
  6. **Ledger Commit**: Transaction #1 recorded with SHA-256 hash chaining.
  7. **Saga Compensation (Undo)**: Browser worker executed *Cancel Reservation*, persistent provider refunded booking, and ledger recorded negative balance reversal (`-INR 12,000`), restoring net ledger balance to INR 0.
- **Resilience**: Added exponential retry with backoff in [`server/gemini.ts`](server/gemini.ts) for transient HTTP 503 (Overloaded) and HTTP 429 (Rate Limit) statuses.
- **Fail-Safe Integrity**: If Gemini inference fails, Atlas throws explicit descriptive errors; it **never silently substitutes fixtures**.

---

## 4. Verification & Build Suite

All automated checks pass with zero regressions:

```bash
# 1. Full Test Suite (31 tests across server, simulator, and atlas-plan-validator)
npm test
# Result: 31 passed, 0 failed, 0 errors (7.79s duration)

# 2. Seeded Evaluation Benchmark (5 scenarios)
npm run eval
# Result: 5/5 scenarios completed (100%), 0 unapproved actions, 0 duplicate bookings

# 3. Production Build
npm run build
# Result: Built in 1.71s with 0 TypeScript errors (tsc --noEmit && vite build)
```

---

## 5. Product & API Feedback (For Submission Form)

When completing the Devpost submission forms, use this structured feedback:

### Model Context Protocol (MCP) Streamable HTTP
- **Strength**: Clean separation of tool schemas from execution. Client-side fetch instrumentation enabled a real-time protocol inspector without intrusive code changes.
- **Opportunity**: The TypeScript SDK lacks built-in primitives for conversational turn-taking and approval-gated workflows. Adding standard `approval_required` and `compensation_for` metadata fields to `CallToolResult` would significantly simplify building human-in-the-loop agents.

### Google Gemini Structured JSON (`responseSchema`)
- **Strength**: Strict adherence to JSON schema (`responseMimeType: "application/json"`, `responseSchema`) made DAG output generation reliable.
- **Opportunity**: Under heavy concurrency, transient HTTP 503 and 429 errors occur frequently. Standardizing built-in client SDK retry mechanisms with jitter would streamline developer onboarding.

---

## 6. Official Timed Demo Script (< 3 Minutes)

*Video duration requirement: Strictly under 180 seconds.*

| Timestamp | Screen / Visual | Voice Command & Spoken Narration | Key Verification Shown |
| :--- | :--- | :--- | :--- |
| **0:00 - 0:35** | **Mission Control UI** (`localhost:5173`) | *"Alexa, plan Dad's 60th birthday this Saturday, 25 people, budget 40,000 rupees."*<br>Atlas analyzes options using Google Gemini (`gemini-3.5-flash`), verifies constraints through `atlas-plan-validator`, and selects Garden Hall. | Planned commitment: ₹12,000.<br>Remaining buffer: ₹28,000.<br>Status: `awaiting_approval`. |
| **0:35 - 1:00** | **Options Comparison Panel** | *"Why not the palace?"*<br>Atlas explains: Royal Heritage Palace costs ₹35,000, leaving only ₹5,000 for catering and cake, exceeding our budget. Garden Hall preserves safety margins. | Rejection reason counterexample clearly displayed on screen. |
| **1:00 - 1:30** | **Voice Console / Approval Dialog** | *"Book it."* Atlas prompts: *"Say confirm booking within 5 minutes to execute."*<br>Say: *"Yes."* -> Atlas rejects generic confirmation.<br>Say: *"Confirm booking."* | Single-use token validation.<br>Role policy check (requires adult).<br>Rejection of vague approvals. |
| **1:30 - 2:05** | **Browser Worker & Venue Portal** | Watch headless Playwright worker navigate to *The Grand Orchid*, fill occasion details, and click *Confirm Booking*.<br>Switch to Venue Portal tab to show reservation `#ATLAS-DAD60` and Action Ledger entry #1. | Real Playwright accessibility snapshot.<br>Persistent booking ref.<br>SHA-256 chain verified. |
| **2:05 - 2:30** | **Undo / Saga Compensation** | *"Undo the booking."* Atlas prompts: *"Say confirm cancellation."*<br>Speak confirmation. Browser worker triggers *Cancel Reservation*; provider refunds booking; ledger records `-₹12,000`. | Net ledger balance: ₹0.<br>Reversible autonomous action. |
| **2:30 - 2:50** | **Learned Skills Forge** | Switch to **Learned Skills**. Demonstrate `party_portion_calculator` running safe declarative test fixtures and verified by adult authorization. | Safe math evaluation (no arbitrary eval).<br>Adult approval policy gate. |
| **2:50 - 3:00** | **Protocol Inspector & Conclusion** | Show live JSON-RPC 2.0 traffic log in Protocol Inspector. Highlight: Atlas delivers safe, verifiable, and reversible household autonomy for Alexa+. | Authentic MCP transport.<br>Zero secret exposure.<br>Open-source validator contribution. |
