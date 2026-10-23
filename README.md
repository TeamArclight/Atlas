# Atlas — Autonomous Household Mission Platform

**Amazon Developer Hackathon — Alexa+ Track (October 2026)**  
*Submission Deadline Target: October 15, 2026 IST*

Atlas is an agentic household mission coordination system built on the **Model Context Protocol (MCP)**. It enables proactive, multi-step household execution—such as milestone event planning—while enforcing strict human approval policies, transaction budget guardrails, reversible business compensation, and cryptographically verified audit trails.

---

## The Demo Journey

### Voice Commands & Conversational Flow

Open the microphone console in the header. Say or type:
1. *“Alexa, plan Dad's 60th birthday this Saturday, 25 people, budget 40,000 rupees.”*  
   Atlas creates a structured multi-step plan, evaluates venue, catering, and cake options, and rejects over-budget alternatives (such as Royal Heritage Palace).
2. *“Make it cheaper”* / *“Only vegetarian food”* / *“Change it to 30 guests”*  
   Atlas dynamically revises preferences into versioned plans (`v1 -> v2`), updates cost breakdowns, invalidates stale approvals, and summarizes exact changes.
3. *“What have you booked?”* / *“What's the status?”*  
   Atlas reports booked services, current mission state, planned commitment, and remaining budget buffer.
4. *“Why did you pick Garden Hall?”*  
   Atlas explains the counterexample: Royal Heritage Palace (INR 35,000) leaves insufficient buffer for catering and cake, exceeding budget boundaries.
5. *“Book it”*  
   Atlas issues a single-use contextual approval token bound to the exact plan version and prompts for explicit confirmation. Saying generic *"yes"* is rejected.
6. *“Confirm booking”*  
   Playwright executes the booking on the fictional venue portal, the persistent provider confirms the reservation, and the Action Ledger writes an immutable SHA-256 canonical chained entry.
7. *“Undo the booking”* → *“Confirm cancellation”*  
   Atlas compensates the reservation in reverse dependency order, restoring the ledger balance to net INR 0.

---

## Truthful Feature Matrix

In adherence to hackathon integrity guidelines, all system capabilities are truthfully labeled:

| Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| **MCP Streamable HTTP Transport** | **Live** | Implemented using official `@modelcontextprotocol/sdk` v1.26.0 on `/mcp`. |
| **AWS Bedrock Planner** | **Supported / Dual-Mode** | Integrates `@aws-sdk/client-bedrock-runtime` for generative planning, with an offline deterministic fixture mode (`PLANNER_MODE=fixture\|bedrock`). |
| **Google Gemini Planner** | **Live Integration / Dual-Mode** | Direct REST integration in `server/gemini.ts` using structured `responseSchema`, strict typing, and timeout. Verified via mocked unit tests; live inference requires local `.env` (see `GEMINI_SETUP.md`). |
| **Deterministic Plan Validation** | **Live / Reusable Package** | Validates budget bounds, acyclic DAG dependencies, tool allowlist, and mandatory approval gates via the extracted `atlas-plan-validator` package. |
| **Persistent Fictional Provider** | **Live** | Persistent provider (`server/provider.ts`) on disk (`data/fictional_bookings.json`) with idempotency keys and refund tracking. |
| **Headless Browser Worker** | **Live** | Playwright fills and clicks the fictional venue page, checks confirmation, and captures actual accessibility evidence (`get_browser_worker_status`). |
| **Contextual Approvals & Roles** | **Live** | Single-use random tokens, 5-minute expiration, and simulated child policy enforcement (blocks financial commitments without adult role). |
| **Conversational Tool (`converse`)** | **Live** | MCP `converse` tool handling goal extraction, questions, options comparison, single-use confirmations, and command deduplication. |
| **Server-Backed Learned Skills** | **Live** | 6 MCP meta-tools with safe mathematical evaluation (no arbitrary eval or system calls), test fixture execution, adult approval gate, and revocation controls. |
| **Cryptographic Action Ledger** | **Live** | SHA-256 hash chaining linking each entry to previous block (`GENESIS` verified). |
| **Saga Compensation (Undo)** | **Live** | Idempotent undo method that compensates bookings with negative balance ledger entries. |
| **Live Protocol Inspector** | **Live** | Custom fetch instrumentation capturing actual JSON-RPC 2.0 requests & responses in real time with credential redaction. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser Simulator                     │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │   Mission Control UI  │       │  Protocol Inspector   │  │
│  │   (React 19 + Vite 6) │       │  (Live JSON-RPC Feed) │  │
│  └───────────┬───────────┘       └───────────▲───────────┘  │
│              │                               │              │
│              ▼                               │              │
│  ┌───────────────────────────────────────────┴───────────┐  │
│  │       Instrumented Streamable HTTP Client             │  │
│  │       (@modelcontextprotocol/sdk/client v1.26)        │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ HTTP POST /mcp
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Atlas MCP Server (Node 22)                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Express Server (:3001)                                │  │
│  │   - /health (Status, Planner Mode, Browser Worker)    │  │
│  │   - /mcp (StreamableHTTPServerTransport)              │  │
│  │   - /demo/api/venue/:ref (Persistent Booking State)   │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ MCP Tools Registry                                    │  │
│  │   - create_mission, list_missions, get_mission_status │  │
│  │   - revise_plan, verify_ledger                        │  │
│  │   - approve_mission, undo_mission                     │  │
│  │   - converse (Conversational Voice/Text Handler)      │  │
│  │   - get_browser_worker_status (Playwright Evidence)   │  │
│  │   - list/create/test/approve/run/revoke_learned_skill │  │
│  └───────────────┬───────────────────────────┬───────────┘  │
│                  ▼                           ▼              │
│  ┌───────────────────────────┐  ┌────────────────────────┐  │
│  │ MissionPlanner            │  │ FictionalVenueProvider │  │
│  │ - Bedrock Runtime SDK     │  │ - Persistent Bookings  │  │
│  │ - Deterministic Graph     │  │ - Idempotency Keys     │  │
│  │   Validator (DAG, Bounds) │  │ - Refund Accounting    │  │
│  └───────────────┬───────────┘  └────────────────────────┘  │
│                  ▼                                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ MissionStore & Cryptographic Ledger                   │  │
│  │   - SHA-256 Hash Chained Audit Trail                  │  │
│  │   - Execution Intent Persistence & Crash Recovery     │  │
│  │   - Contextual Approval Token Manager                 │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Quickstart & Run Commands

### Prerequisites
- Node.js v20+ or v22+
- npm v10+
- Microsoft Edge or Playwright Chromium installed

### 1. Installation & Environment Configuration
```bash
npm install
cp .env.example .env
```
*(To use Google Gemini, set `PLANNER_MODE=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL` in `.env`. See [GEMINI_SETUP.md](GEMINI_SETUP.md). If unconfigured, Atlas runs in deterministic scenario planner mode without silent fallbacks).*

### 2. Run the MCP Backend Server
```bash
npm run dev:server
```
*The server listens at `http://127.0.0.1:3001/mcp` and provides health status at `http://127.0.0.1:3001/health`.*

### 3. Run the Simulator UI
In a second terminal:
```bash
npm run dev:ui
```
*Open your browser at `http://127.0.0.1:5173/`.*

### 4. Run Tests & Validation
```bash
# Run 36 unit, integration, validator, and E2E tests
npm test

# Run repeatable benchmark on seeded scenarios
npm run eval

# Run TypeScript type-checking and Vite production build
npm run build
```

---

## Open Source Mini-Challenge Contribution

As an additional submission for the Devpost Open Source Mini-Challenge, Atlas has extracted its provider-independent plan graph and constraint validator into a standalone, zero-dependency package:

- **Package**: `atlas-plan-validator` (located under [`contributions/atlas-plan-validator/`](contributions/atlas-plan-validator/))
- **License**: MIT License
- **Features**: Deterministic DAG cycle detection (Kahn's algorithm), budget bounds with counterexample gaps, tool authorization allowlists, and human approval gates for financial steps.
- **Consumption**: Reused directly by Atlas in `server/planner.ts` via local dependency.
- **Submission Details**: See [OPEN_SOURCE_SUBMISSION.md](OPEN_SOURCE_SUBMISSION.md).

---

## Timed Demo Script (< 3 Minutes)

This script is designed for the official video submission (under 180 seconds):

| Time | Phase | Action & Narration |
| :--- | :--- | :--- |
| **0:00 - 0:35** | **Voice Mission Formulation** | Open `http://127.0.0.1:5173`. Open the voice console in the header and speak: *"Alexa, plan Dad's 60th birthday this Saturday, 25 people, budget 40,000 rupees."* Show Atlas generating the plan with **Planned Commitment: ₹12,000** and **₹28,000 remaining buffer**. |
| **0:35 - 1:00** | **Options Comparison** | Ask aloud: *"Why not the palace?"* Atlas explains: Royal Heritage Palace (₹35,000) was rejected because it leaves only ₹5,000 for catering and cake, which violates the budget constraint. Garden Hall was selected. |
| **1:00 - 1:30** | **Contextual Approval Gate** | Say: *"Book the venue."* Atlas generates a one-time approval token and responds: *"Say confirm booking within 5 minutes to execute."* Say *"yes"* — Atlas rejects generic confirmation. Say *"Confirm booking"*. |
| **1:30 - 2:05** | **Execution & Evidence** | Watch the headless Playwright browser worker navigate to *The Grand Orchid*, fill the form, click *Confirm Booking*, and capture accessibility evidence. Switch to the **Venue Portal** tab to show actual reservation `#ATLAS-DAD60`. Show the **Action Ledger** with entry #1 and **SHA-256 Chain Verified**. |
| **2:05 - 2:35** | **Compensation / Reversible Undo** | Say: *"Undo the booking."* Atlas prompts: *"Say confirm cancellation."* Confirm it. The browser worker and persistent provider cancel the booking, issuing a negative balance reversal (`-₹12,000`) in the ledger, restoring net balance to **₹0**. |
| **2:35 - 2:50** | **Learned Skills Forge** | Switch to **Learned Skills**. Show `party_portion_calculator` running safe mathematical tests and authorized with adult household approval. |
| **2:50 - 3:00** | **Conclusion** | Highlight the Protocol Inspector showing authentic JSON-RPC 2.0 traffic. Summarize: Atlas delivers verifiable, reversible, and safe autonomous missions for Alexa+. |

---

## Third-Party Notices & Attribution

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for full licensing information and upstream repository attributions including:
- Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk` v1.x, MIT)
- Model Context Protocol Extension Apps (`ext-apps`, Apache-2.0)
- Microsoft Playwright MCP (`playwright-mcp`, Apache-2.0)
- Strands Agents SDK (`strands-ts`, Apache-2.0)
- AWS SDK Bedrock Runtime (`@aws-sdk/client-bedrock-runtime`, Apache-2.0)
- Google Gemini REST API (`generativelanguage.googleapis.com`)
- Atlas Plan Validator (`atlas-plan-validator`, MIT)
