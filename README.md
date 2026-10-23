# Atlas: Household Milestone Mission Assistant

> Autonomous milestone event coordination for the Alexa+ ecosystem, engineered with the Model Context Protocol (MCP), generative planning, deterministic plan validation, contextual human approval gates, and cryptographic auditability.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.26.0-green.svg)](https://modelcontextprotocol.io/)
[![Google Gemini](https://img.shields.io/badge/Gemini-2.5--Flash-orange.svg)](https://ai.google.dev/)
[![Tests](https://img.shields.io/badge/Tests-43%20passed-brightgreen.svg)]()

---

## 1. Project Overview

Coordinating milestone household events—such as a parent's 60th birthday, a silver wedding anniversary, or a graduation banquet—is complex, stressful, and fraught with financial and logistical risk. A single celebration requires orchestrating multiple interdependent services: securing an appropriate venue, booking catering aligned with dietary requirements and guest counts, ordering custom milestone cakes, tracking strict household budgets, and maintaining audit trails.

Traditional voice assistants and chat interfaces can search for restaurants or set calendar reminders, but they cannot:
1. **Formulate structured multi-service execution graphs** with topological dependencies.
2. **Dynamically adapt to budget revisions and preference updates** without risking orphaned reservations.
3. **Enforce hard financial firewalls and approval gates** that prevent autonomous agents from incurring unauthorized spending.
4. **Execute coordinated compensations (undo sagas)** across multiple independent vendors when plans change.
5. **Provide tamper-evident cryptographic ledgers** documenting every action, authorization token, and provider outcome.

**Atlas** solves this household challenge. Built as an agentic assistant for the **Alexa+ Track** of the Amazon Developer Hackathon, Atlas transforms conversational intent into safely validated, versioned, and human-authorized multi-service execution plans.

---

## 2. Current Capabilities

- **Natural Voice & Conversational Control**: Interprets natural speech and text to create missions, answer inquiries, compare service options, revise parameters, and handle contextual confirmations.
- **Dual-Mode Multi-Service Planning**:
  - **Live Google Gemini Planner**: Generates structured, dependency-aware multi-service execution plans via server-side Google Gemini REST integration (`gemini-2.5-flash`).
  - **Deterministic Scenario Planner**: Generates offline, reliable execution graphs when offline or during zero-cost testing.
- **Dynamic Plan Versioning & Preference Revisions**: Supports follow-up modifications (e.g., *"change it to 30 vegetarian guests"*, *"make it cheaper"*). Automatically computes cost deltas, creates before/after diffs, increments plan versions ($v1 \to v2$), and immediately invalidates stale approval tokens.
- **Independent Three-Service Execution Engine**: Dispatches distinct, realistic bookings for:
  1. **Venues**: Base venue bookings with capacity bounds and refund terms.
  2. **Catering**: Per-guest pricing with standard and vegetarian menu tiers.
  3. **Custom Bakeries**: Milestone specialty cakes with tiering and custom print options.
- **Strict Human-in-the-Loop Trust & Safety Controls**:
  - Financial actions require explicit approval.
  - Contextual single-use approval tokens with 5-minute expirations.
  - Confirmation checks verified against the user's actual utterance (`rawText`), preventing model hallucination from authorizing spending.
  - Household role policies enforcing adult-only spending authorization (rejecting child roles with HTTP 403).
- **Reverse-Dependency Compensation (Saga Undo)**: Cancels multi-service bookings in reverse topological order (cake $\to$ catering $\to$ venue), calculating provider-specific cancellation fees and crediting refunds.
- **Automated Browser Verification Evidence**: Headless Playwright worker navigates semantic DOM attributes, capturing accessibility snapshots and booking states.
- **Cryptographic Action Ledger**: SHA-256 hash-chained immutable audit log with on-demand mathematical verification to detect runtime tampering or data corruption.
- **Safe Learned Skills Forge**: Declarative AST mathematical evaluator allowing household users to register, test against automated fixtures, adult-authorize, execute, and revoke custom skills with zero `eval()` vulnerabilities.

---

## 3. Implementation Boundaries & System Scope

To ensure complete transparency and fidelity:

- **Browser Web Speech & Local Simulator**: Voice interactions use the browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) with an accessible keyboard fallback within a local Alexa-inspired simulator. **There is no claim of deployed physical Alexa hardware integration or proprietary Alexa voice services.**
- **Fictional Vendors & Financial Simulation**: Providers (Emerald Garden Hall, Gourmet Celebration Buffet, Royal Vegetarian Feast, Sweet Delights Bakery) simulate realistic inventory, contracts, pricing, and cancellation policies. **No real payment gateways, credit cards, or actual financial transactions take place.**
- **Local Identity & Role Policy**: Household roles (`adult` vs. `child`) are passed contextually to demonstrate role-based authorization policy. **Production cryptographic identity verification, biometric voiceprint matching, and multi-tenant authentication are outside the current local prototype scope.**
- **Local Hash Chain Persistence**: Action ledger entries are hash-chained using SHA-256 and persisted to local JSON storage (`data/missions.json`). While mathematically tamper-evident against runtime manipulation, it does not constitute a distributed Byzantine consensus blockchain.

---

## 4. Architecture & Data Flow

```
                                  TALK TO ATLAS / WEB SIMULATOR
                                 (Browser Speech / React 19 UI)
                                               │
                                       JSON-RPC 2.0 (HTTP)
                                               ▼
                              ATLAS EXPRESS MCP SERVER (Port 3001)
                         ┌───────────────────────────────────────────┐
                         │  Registered Tools:                        │
                         │  - converse         - approve_mission     │
                         │  - create_mission   - undo_mission        │
                         │  - revise_plan      - verify_ledger       │
                         │  - list_missions    - learned_skills_*    │
                         └─────────────────────┬─────────────────────┘
                                               │
                                 CONVERSATIONAL INTENT ROUTER
                                               │
                      ┌────────────────────────┴────────────────────────┐
                      ▼                                                 ▼
          GOOGLE GEMINI PLANNER                           DETERMINISTIC PLANNER
       (REST / gemini-2.5-flash)                       (Deterministic Scenarios)
                      └────────────────────────┬────────────────────────┘
                                               │ Unvalidated Plan Graph
                                               ▼
                                 ATLAS PLAN VALIDATOR (Standalone)
                               ┌─────────────────────────────────────────┐
                               │ • Kahn's Algorithm DAG Cycle Detection  │
                               │ • Budget Upper Bounds & Cost Gaps       │
                               │ • Tool Allowlist Enforcement            │
                               │ • Mandatory Human Approval Flags        │
                               └───────────────────┬─────────────────────┘
                                                   │ Validated Plan Graph
                                                   ▼
                                      APPROVAL MANAGER (Tokens & Roles)
                               ┌─────────────────────────────────────────┐
                               │ • 5-Minute Token Expiration             │
                               │ • Single-Use Token Consumption          │
                               │ • Actual Utterance Matching (rawText)   │
                               │ • Adult vs Child Role Enforcement       │
                               └───────────────────┬─────────────────────┘
                                                   │ Approved Execution
                                                   ▼
                                     MULTI-SERVICE EXECUTION ENGINE
                               ┌─────────────────────────────────────────┐
                               │ • Dependency Order (Venue->Cater->Cake) │
                               │ • Stable Idempotency Keys               │
                               │ • Reverse Saga Compensation (Undo)      │
                               └───────┬─────────────────────────┬───────┘
                                       │                         │
                                       ▼                         ▼
                           FICTIONAL SERVICE PROVIDERS   PLAYWRIGHT BROWSER WORKER
                           (Persistent JSON Provider)    (DOM Accessibility Snapshots)
                                       │                         │
                                       └───────────┬─────────────┘
                                                   │
                                                   ▼
                                      SHA-256 CRYPTOGRAPHIC LEDGER
                                        (Local Immutable Chain)
```

### End-to-End Data Flow
1. **User Utterance**: User speaks (*"Plan Dad's 60th birthday for 25 guests with budget INR 40,000"*) or enters text into the simulator.
2. **Intent Routing**: The `converse` tool routes the utterance to either Gemini or the deterministic planner.
3. **Plan Formulation**: A multi-step execution plan is formulated with distinct steps, estimated costs, dependencies, and approval requirements.
4. **Deterministic Validation**: `atlas-plan-validator` checks the plan for DAG acyclicity, budget limits, tool allowlists, and approval gates.
5. **Approval Gate**: If costly actions exist, the mission enters `awaiting_approval`. A contextual single-use approval token is generated.
6. **Authorization**: The user provides approval (*"Yes, book it"* or enters the token). The server verifies the token, matches the raw utterance, and confirms the plan version.
7. **Execution**: The multi-service engine invokes the fictional providers in topological order using deterministic idempotency keys (`${missionId}:${serviceType}:${itemKey}:${planVersion}`).
8. **Browser Evidence**: The Playwright worker executes headless DOM interactions against the venue portal, capturing accessibility snapshots.
9. **Ledger Audit**: Each action generates a cryptographically hashed ledger entry linked to the previous entry hash.
10. **State Persistence**: The updated mission, plan versions, and bookings are persisted to `data/missions.json` and `data/fictional_bookings.json`.

---

## 5. User Interface & Controls

The Atlas Simulator provides four dedicated application tabs and a floating conversational assistant:

### 1. Mission Control Tab (`mission`)
- **Left Column**:
  - **Mission Creator**: Input fields for goal description and monetary budget. Supports preset sample missions.
  - **Mission List**: Displays all saved missions with real-time status badges (`awaiting_approval`, `completed`, `undone`, `failed`). Includes a refresh button.
- **Middle Column**:
  - **Active Mission Details**: Shows the active mission ID, current plan version ($v1, v2\dots$), and goal summary.
  - **Plan Revision Bar**: Quick-revision inputs allowing immediate adjustments to guest counts, dietary preferences, dates, or budgets.
  - **Execution Plan Graph**: Step-by-step breakdown indicating tool name, dependency prerequisites, cost, and approval gates.
  - **Cost Breakdown Card**: Displays planned cost, executed gross spend, refunded amounts, and net spend.
  - **Human Approval Controls**: Input for confirmation phrase or single-use token, role selector (`adult` vs. `child`), and an **Approve Mission** button.
  - **Compensation Controls**: Single-click **Compensate / Undo Mission** button with confirmation phrase check.
  - **Action Ledger**: Chronological log of all system transitions and transactions, complete with a **Verify Ledger** button that recomputes the SHA-256 chain in real time.
- **Right Column**:
  - **Protocol Inspector Feed**: Live telemetry log showing JSON-RPC 2.0 requests, responses, latency measurements, and payload inspectors.

### 2. Venue Portal View Tab (`venue`)
- Renders an embedded, sandboxed iframe viewing `simulator/sites/fictional-venue.html`.
- Displays the real-time visual state of the reservation (`available` $\to$ `reserved` $\to$ `cancelled`), customer name, guest count, and reservation reference.
- Shows semantic accessibility attributes (`role="status"`, `data-testid="booking-status"`) inspected by Playwright.

### 3. Protocol Inspector Tab (`protocol`)
- Full-screen protocol monitoring console.
- Displays raw JSON-RPC 2.0 payloads for all MCP operations.
- Automatically redacts sensitive authorization headers (`Bearer ***`).
- Features latency tracking, request/response correlation, and log clearing.

### 4. Learned Skills Forge Tab (`skills`)
- Interface for inspecting, testing, and managing template-based learned skills.
- **Run Verification Fixtures**: Evaluates declared mathematical test inputs against expected outputs using the safe AST evaluator.
- **Authorize Skill**: Human approval gate requiring adult role confirmation.
- **Execute Skill**: Dispatches approved skills with live parameter inputs.
- **Revoke Skill**: Immediately revokes execution authorization with a documented audit reason.

### Talk to Atlas Modal Overlay
- Floating voice assistant console triggered via the header microphone button or keyboard shortcut.
- Displays live speech synthesis status, microphone toggling, real-time transcription, and conversational assistant replies.
- Provides contextual suggestion pills (*"Plan Dad's 60th birthday"*, *"Change to 30 vegetarian guests"*, *"Yes, book it"*, *"Undo booking"*).
- Seamlessly falls back to typed input if microphone permissions are unavailable.

---

## 6. Installation & Quick Start

### Prerequisites
- **Node.js**: Version **22.0.0** or higher (required for native `.env` loading via `process.loadEnvFile`).
- **npm**: Version **9.0.0** or higher.
- **Operating System**: Windows, macOS, or Linux.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/TeamArclight/Atlas.git
   cd Atlas
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```
   *(This automatically builds the local standalone `atlas-plan-validator` package via npm's `prepare` lifecycle script).*

3. **Install Playwright browsers** (for headless venue automation):
   ```bash
   npx playwright install chromium
   ```

### Running the Application

Atlas requires two concurrent local processes: the backend MCP Express server and the frontend Vite simulator.

**Terminal 1 — Backend MCP Server**:
```bash
npm run dev:server
```
*Starts the Express server with live file watching on `http://127.0.0.1:3001/mcp`.*

**Terminal 2 — Frontend Simulator UI**:
```bash
npm run dev:ui
```
*Starts the Vite development server on `http://127.0.0.1:5173`.*

Open your browser to `http://127.0.0.1:5173` to interact with Atlas.

---

## 7. Environment Variables & Configuration

Atlas ships with sensible defaults and runs entirely offline out-of-the-box using deterministic scenario planning. To enable live Google Gemini planning, configure a local `.env` file.

### Safe Configuration Example (`.env.example`)
Create a `.env` file in the project root:

```ini
# ==============================================================================
# ATLAS CONFIGURATION
# ==============================================================================

# Planner Mode: 'gemini' for live AI planning, 'fixture' for offline deterministic planning
PLANNER_MODE=gemini

# Google Gemini API Configuration (loaded server-side only)
# Obtain a key from Google AI Studio: https://aistudio.google.com/apikey
GEMINI_API_KEY=your-google-ai-studio-gemini-api-key-here
GEMINI_MODEL=gemini-2.5-flash

# Optional: AWS Bedrock Configuration (if using Bedrock runtime)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
```

### Security & Credential Isolation
- `GEMINI_API_KEY` is loaded **exclusively on the backend** via Node's `loadEnvFile('.env')` in `server/start.ts`.
- It is **never** prefixed with `VITE_`, never bundled into client-side code, and never exposed in browser logs, protocol telemetry, or chat transcripts.
- The `.env` file is explicitly ignored in `.gitignore`. **Never commit API keys or private credentials.**

---

## 8. End-to-End Walkthrough

Here is a step-by-step journey demonstrating creation, revision, approval, execution, and compensation:

### Step 1: Create the Mission
- **Utterance**: *"Plan Dad's 60th birthday for Saturday, 25 people, budget INR 40,000."*
- **Action**: Atlas creates a mission with Plan Version 1:
  - Step 1: `fictional_venue_book` — Garden Hall (₹12,000)
  - Step 2: `fictional_catering_quote` — Gourmet Celebration Buffet for 25 guests (₹15,000)
  - Step 3: `fictional_cake_order` — Milestone Truffle Cake (₹3,500)
  - **Total Planned Cost**: **₹30,500** (within ₹40,000 budget).
- **Status**: Enters `awaiting_approval`. Generates single-use approval token `CONFIRM-...`.

### Step 2: Revise the Plan
- **Utterance**: *"Change it to 30 vegetarian guests."*
- **Action**: Atlas updates mission preferences and increments to Plan Version 2:
  - Step 1: `fictional_venue_book` — Garden Hall (₹12,000)
  - Step 2: `fictional_catering_quote` — Royal Vegetarian Feast for 30 guests (₹14,400)
  - Step 3: `fictional_cake_order` — Milestone Truffle Cake (₹3,500)
  - **New Total Planned Cost**: **₹29,900**.
  - **Safety Action**: The previous approval token is invalidated. A fresh token is issued for Plan Version 2.

### Step 3: Explicit Human Approval
- **Utterance**: *"Yes, book it"* (or enters the token and clicks Approve with role `adult`).
- **Action**:
  - The server verifies that the user utterance contains affirmative confirmation (*"yes"*, *"book"*, *"confirm"*).
  - Verifies that the approver role is `adult`.
  - Verifies that the approval token matches Plan Version 2 and the exact amount (₹29,900).
  - The token is consumed (single-use).

### Step 4: Three-Service Execution
- **Action**: The execution engine executes bookings in dependency order:
  1. Books **Garden Hall** via `fictional_venue_book` (Ref: `VEN-...`).
  2. Books **Royal Vegetarian Feast** via `fictional_catering_quote` (Ref: `CAT-...`).
  3. Orders **Milestone Truffle Cake** via `fictional_cake_order` (Ref: `CAKE-...`).
- **Browser Automation**: Playwright navigates to the venue portal, submits the reservation form, and captures a DOM accessibility snapshot.
- **Status**: Transitions to `completed`. Gross spend: ₹29,900.

### Step 5: Evidence & Ledger Inspection
- **Action**:
  - Click the **Venue Simulator** tab to inspect the live reservation card in the venue portal.
  - Click **Verify Ledger** in Mission Details. The system recomputes all SHA-256 hashes across the chain, displaying `Status: VALID (Chain intact)`.

### Step 6: Coordinated Compensation (Undo)
- **Utterance**: *"Undo booking"* (or clicks Compensate / Undo Mission).
- **Action**:
  - The engine dispatches cancellations in reverse topological order:
    1. Cancels Cake (`CAKE-...`) $\to$ 100% refund (₹3,500).
    2. Cancels Catering (`CAT-...`) $\to$ 100% refund (₹14,400).
    3. Cancels Venue (`VEN-...`) $\to$ 100% refund (₹12,000).
  - Playwright cancels the reservation on the venue portal.
  - Refund records are appended to the Action Ledger. Net spend returns to **₹0**.
  - Status transitions to `undone`.

---

## 9. Pricing Structure & Refund Policies

Atlas enforces realistic mathematical pricing models across all supported fictional inventory:

### Pricing Examples

| Scenario | Service 1: Venue | Service 2: Catering | Service 3: Bakery | Total Cost |
| :--- | :--- | :--- | :--- | :--- |
| **25 Guests (Regular)** | Garden Hall<br>₹12,000 base | Gourmet Celebration Buffet<br>25 guests × ₹600 = ₹15,000 | Milestone Truffle Cake (3kg)<br>₹3,500 base | **₹30,500** |
| **30 Guests (Vegetarian)** | Garden Hall<br>₹12,000 base | Royal Vegetarian Feast<br>30 guests × ₹480 = ₹14,400 | Milestone Truffle Cake (3kg)<br>₹3,500 base | **₹29,900** |

### Provider Cancellation & Refund Policies

Each provider defines its own contractual refund rate and cancellation penalty:

1. **Garden Hall (The Grand Orchid)**:
   - *Policy*: 100% refundable prior to event date.
   - *Refund Rate*: $1.0$ (Full ₹12,000 refunded).
2. **Royal Heritage Palace Grand Lawn**:
   - *Policy*: 50% non-refundable deposit.
   - *Refund Rate*: $0.5$ (50% cancellation fee retained).
3. **Gourmet Celebration Buffet & Royal Vegetarian Feast**:
   - *Policy*: 100% refundable prior to ingredient provisioning.
   - *Refund Rate*: $1.0$ (Full catering cost refunded).
4. **Milestone Belgian Chocolate Truffle Cake**:
   - *Policy*: 100% refundable if cancelled prior to baking start.
   - *Refund Rate*: $1.0$ (Full ₹3,500 refunded).
5. **Personalized Photo Celebration Cake**:
   - *Policy*: Custom print fee non-refundable.
   - *Refund Rate*: $0.75$ (75% refunded, 25% custom print setup fee retained).

---

## 10. Model Context Protocol (MCP) Tool Reference

All backend capabilities are registered as typed tools on the Model Context Protocol server in `server/index.ts`:

### Mission Management Tools

| Tool Name | Input Schema | Description |
| :--- | :--- | :--- |
| `create_mission` | `goal` (string, 1-2000 chars)<br>`budget` (positive integer)<br>`guests` (optional integer)<br>`dietaryPreferences` (optional string)<br>`eventDate` (optional string)<br>`notes` (optional string) | Creates a simulated milestone mission, formulating a validated multi-step plan. |
| `revise_plan` | `missionId` (UUID string)<br>`budget` (optional integer)<br>`guests` (optional integer)<br>`eventDate` (optional string)<br>`dietaryPreferences` (optional string)<br>`notes` (optional string)<br>`instruction` (optional string) | Revises mission preferences, produces before/after diffs, increments plan version, and invalidates stale approvals. |
| `list_missions` | *(none)* | Returns all persisted missions. |
| `get_mission_status` | `missionId` (UUID string) | Retrieves the current state, execution plan, ledger, and evidence for a mission. |
| `approve_mission` | `missionId` (UUID string)<br>`tokenOrPhrase` (string)<br>`role` (optional: `'adult' \| 'child'`)<br>`planVersion` (optional integer) | Validates approval token/phrase, checks role, and commits multi-service bookings in dependency order. |
| `undo_mission` | `missionId` (UUID string)<br>`tokenOrPhrase` (string)<br>`role` (optional: `'adult' \| 'child'`) | Validates confirmation and executes reverse-dependency compensation across all booked services. |
| `verify_ledger` | `missionId` (UUID string) | Cryptographically recalculates SHA-256 hash chains across the mission's action ledger to verify integrity. |
| `get_browser_worker_status` | `missionId` (UUID string) | Returns Playwright DOM accessibility snapshots and booking execution evidence. |

### Conversational Interface Tool

| Tool Name | Input Schema | Description |
| :--- | :--- | :--- |
| `converse` | `utterance` (string)<br>`commandId` (string)<br>`conversationId` (optional string)<br>`missionId` (optional UUID string) | Unified conversational router handling voice/text planning, follow-ups, option comparison, and confirmations. |

### Learned Skills Meta-Tools

| Tool Name | Input Schema | Description |
| :--- | :--- | :--- |
| `list_learned_skills` | *(none)* | Lists all registered learned skills with test verification status and approval state. |
| `create_learned_skill` | `name` (string)<br>`description` (string)<br>`category` (string)<br>`template` (string expression)<br>`parameters` (key-value string record)<br>`tests` (array of input/expected records) | Registers a declarative template skill with automated mathematical test fixtures. |
| `test_learned_skill` | `skillId` (string) | Executes test fixtures using the safe AST expression evaluator; marks skill as tested if all fixtures pass. |
| `approve_learned_skill` | `skillId` (string)<br>`approverRole` (`'adult' \| 'child'`) | Authorizes a tested skill for household execution. Rejects child roles with HTTP 403. |
| `run_learned_skill` | `skillId` (string)<br>`input` (key-value number record) | Evaluates an approved skill with runtime inputs. Rejects unapproved or revoked skills. |
| `revoke_learned_skill` | `skillId` (string)<br>`reason` (string) | Immediately revokes an authorized skill, halting future execution. |

---

## 11. Learned Skills & Constrained AST Evaluator

To safely support user-defined household logic without opening arbitrary code execution vulnerabilities, Atlas implements a custom **declarative Abstract Syntax Tree (AST) evaluator** (`evaluateAstMath` in `server/skills.ts`).

### Safety Guarantees
- **No `eval()` or `Function()`**: The parser constructs an in-memory syntax tree using recursive tokenization. No JavaScript code is ever dynamically evaluated.
- **Allowed Operations**:
  - Arithmetic operators: `+`, `-`, `*`, `/`, `%`, and unary `-`.
  - Safe mathematical functions: `round`, `floor`, `ceil`, `min`, `max`, `abs`, `sqrt`.
  - Floating-point numbers and named parameters.
- **Prototype Pollution Defense**: Explicitly rejects identifiers matching `__proto__`, `prototype`, `constructor`, or global objects (`window`, `process`, `global`).
- **Resource Exhaustion Limits**: Enforces a maximum recursion depth of 32 levels and a maximum total node limit of 128 nodes to prevent denial-of-service via deeply nested expressions.

### Skill Lifecycle
1. **Creation**: Registered with formula template and test fixtures (e.g., Budget Per Guest Calculator: `round(budget / guests)`).
2. **Testing**: `test_learned_skill` executes the formula against declared test fixtures. All test cases must match before approval is allowed.
3. **Approval Gate**: Requires explicit authorization by an `adult` role.
4. **Execution**: `run_learned_skill` executes the formula with live inputs.
5. **Revocation**: Any adult can revoke the skill at any time with an explanatory reason.

---

## 12. Trust, Safety, & Recovery Architecture

### Contextual Approval & Token Security
- **Single-Use Tokens**: When a plan is proposed, Atlas issues a random token (`CONFIRM-<UUID>`). Once consumed, it cannot be reused.
- **5-Minute Expiration**: Tokens expire 300,000 ms after creation. Expired tokens are rejected.
- **Plan-Version & Amount Binding**: Approval tokens are strictly bound to the specific `missionId`, `planVersion`, and `expectedAmount`. If a plan is revised, the plan version increments and all prior tokens are immediately invalidated.
- **Actual Utterance Verification**: The conversational router validates that the user's actual voice transcript (`rawText`) contains explicit confirmation intent, preventing hallucinated model text from authorizing bookings.

### Idempotency & Crash Recovery
- **Stable Idempotency Keys**: Every service booking generates a deterministic idempotency key:
  $$\text{IdempotencyKey} = \text{missionId} : \text{serviceType} : \text{itemKey} : \text{planVersion}$$
  Submitting repeated approval requests does not create duplicate reservations or double-spend funds.
- **Service-Specific Crash Reconciliation**: On startup, Atlas inspects interrupted intents. If a crash occurred after a provider completed a booking but before the ledger entry was written, the reconciliation engine matches the exact service reference and idempotency key. A venue booking is never mistakenly matched to an unfulfilled catering or cake step.

### Cryptographic Action Ledger
- Every state transition, booking, approval, and refund appends an immutable block to the mission's action ledger.
- Each entry contains an index, timestamp, action type, amount, details payload, the `previousHash`, and its own computed SHA-256 hash:
  $$\text{EntryHash} = \text{SHA256}(\text{index} \parallel \text{timestamp} \parallel \text{action} \parallel \text{amount} \parallel \text{payload} \parallel \text{previousHash})$$
- Clicking **Verify Ledger** recalculates every hash in sequence. Any altered amount, mutated timestamp, or inserted record breaks the hash chain and is flagged immediately.
- *Auditability Boundary*: While tamper-evident against runtime data corruption, local JSON persistence does not prevent an attacker with root filesystem write permissions from rewriting the file and recalculating the entire chain.

---

## 13. Project Structure & Standalone Contribution

```
Atlas/
├── package.json                     # Root configuration, scripts, dependencies
├── tsconfig.json                    # Root TypeScript configuration
├── vite.config.ts                   # Vite frontend configuration & reverse proxies
├── index.html                       # Web entrypoint for Vite
├── LICENSE                          # MIT License for Atlas
├── THIRD_PARTY_NOTICES.txt          # Open-source attribution & upstream notices
├── data/                            # Persistent JSON databases (git-ignored)
│   ├── missions.json                # Saved missions & cryptographic ledgers
│   └── fictional_bookings.json      # Fictional vendor booking database
├── server/                          # Backend Express & MCP Server
│   ├── index.ts                     # MCP server setup & registered tool definitions
│   ├── start.ts                     # Server entrypoint with Node .env loader
│   ├── missions.ts                  # Multi-service mission state machine & recovery
│   ├── planner.ts                   # Mission planner dispatcher (Gemini & Fixture)
│   ├── gemini.ts                    # Server-side Google Gemini REST client & schemas
│   ├── provider.ts                  # Persistent fictional vendor provider & inventory
│   ├── approvals.ts                 # Approval token manager & role policies
│   ├── converse.ts                  # Conversational intent router & utterance parser
│   ├── skills.ts                    # Learned skills store & declarative AST evaluator
│   ├── ledger.ts                    # SHA-256 cryptographic action ledger verification
│   ├── browser.ts                   # Headless Playwright venue automation worker
│   └── eval.ts                      # Automated benchmark evaluation suite
├── simulator/                       # Frontend React 19 Application
│   ├── index.tsx                    # React client entrypoint
│   ├── App.tsx                      # Main simulator container & tab routing
│   ├── types.ts                     # Frontend TypeScript types
│   ├── mcp/
│   │   └── client.ts                # Instrumented browser MCP client transport
│   ├── sites/
│   │   └── fictional-venue.html     # Semantic fictional venue booking portal
│   └── components/
│       ├── Header.tsx               # Status indicators & microphone controls
│       ├── MissionCreator.tsx       # Mission creation form & preset scenarios
│       ├── MissionList.tsx          # Saved mission history list
│       ├── MissionDetails.tsx       # Plan steps, versioning, approvals, & ledger
│       ├── ActionLedger.tsx         # Ledger visualization & SHA-256 verification
│       ├── VenueSimulator.tsx       # Sandboxed venue portal iframe view
│       ├── ProtocolInspector.tsx    # Live JSON-RPC 2.0 telemetry stream
│       ├── ServerSkillForge.tsx     # Learned skills test, approval, & run console
│       └── VoiceMissionConsole.tsx  # Floating Talk to Atlas voice modal
└── contributions/
    └── atlas-plan-validator/        # STANDALONE OPEN-SOURCE CONTRIBUTION
        ├── package.json             # Independent package metadata (v1.0.0)
        ├── tsconfig.json            # Independent build configuration
        ├── LICENSE                  # Standalone MIT License
        ├── README.md                # Standalone package documentation
        ├── src/
        │   ├── types.ts             # Plan graph contracts
        │   ├── errors.ts            # Typed error hierarchy
        │   ├── validator.ts         # Kahn's DAG cycle & budget validator
        │   └── index.ts             # Library entrypoint
        └── test/
            └── validator.test.ts    # 11 unit tests for graph invariants
```

### Standalone Open-Source Contribution: `atlas-plan-validator`
As part of our entry into the Open Source mini-challenge, we decoupled Atlas's core plan validation logic into a general-purpose, zero-dependency package:
- **Repository**: [https://github.com/TeamArclight/atlas-plan-validator](https://github.com/TeamArclight/atlas-plan-validator)
- **Features**: Topological cycle detection via Kahn's algorithm, budget upper-bound validation with informative counterexample gaps, tool allowlists, and human approval enforcement.
- **Consumption**: Atlas consumes this package directly via `"atlas-plan-validator": "file:contributions/atlas-plan-validator"`.

---

## 14. Verification Commands & Test Suite

### Running the Test Suite
Atlas includes 43 automated unit and integration tests across backend services, MCP tools, browser automation, and plan validation:

```bash
npm test
```

**Results**:
- **43 tests passed (100%)**, 0 failed, 0 skipped.
- Tests cover DAG cycle detection, budget boundary enforcement, Playwright browser execution, raw utterance confirmation matching, Gemini schema validation, crash recovery, AST math evaluation, and ledger verification.

### Running the Seeded Benchmark Evaluation
Atlas includes an automated benchmark evaluating five standard household milestone scenarios:

```bash
npm run eval
```

**Results**:
- **5 / 5 scenarios passed (100%)**.
- **0 unapproved actions**, **0 duplicate bookings**, **1/1 compensations succeeded**.
- Exports full evaluation report to `data/eval_report.json`.

### Running the Production Build
```bash
npm run build
```

**Results**:
- Compiles standalone validator (`tsc`).
- Checks root TypeScript types (`tsc --noEmit`).
- Bundles Vite production assets with 0 errors.

---

## 15. Troubleshooting & FAQ

### 1. Backend Connection Refused (`ECONNREFUSED 127.0.0.1:3001`)
- **Cause**: The Vite frontend cannot connect to the MCP server.
- **Fix**: Ensure `npm run dev:server` is running in a separate terminal. Check that port 3001 is not occupied by another process.

### 2. Microphone or Voice Recognition Not Working
- **Cause**: Browser permissions are blocking microphone access or the browser lacks Web Speech API support.
- **Fix**: Click the microphone icon in your browser's address bar to grant permission. Chrome, Edge, and Safari natively support the Web Speech API. If using an unsupported browser, use the typed input box in the Talk to Atlas overlay.

### 3. Playwright Browser Worker Errors
- **Cause**: Playwright's Chromium browser binary has not been installed.
- **Fix**: Run `npx playwright install chromium`.

### 4. Approval Fails with "Stale Approval Token" or "Expired Token"
- **Cause**: The plan was revised after the token was issued, or more than 5 minutes elapsed.
- **Fix**: Revisions increment the plan version, invalidating older tokens. Check the **Human Approval** section in Mission Details to view the active single-use token for the current plan version.

### 5. Google Gemini HTTP 429 (`RESOURCE_EXHAUSTED`)
- **Cause**: The configured Gemini API key has exceeded Google AI Studio's free-tier requests per minute or daily quota.
- **Fix**: Atlas explicitly surfaces this error rather than silently masking it. To continue testing without API quota, set `PLANNER_MODE=fixture` in `.env` and restart `npm run dev:server`.

---

## 16. Verification Status & Known Limitations

### Current Verification Status
- **Automated Tests**: **43 / 43 tests pass (100%)**.
- **Evaluation Runner**: **5 / 5 benchmark scenarios pass (100%)**.
- **Production Build**: Vite build succeeds with **0 errors**.
- **Live Gemini Verification**:
  - Direct live API request successfully generated a three-service execution plan totaling **₹30,500**.
  - A subsequent live revision request encountered Google AI Studio free-tier daily rate limits (`HTTP 429 RESOURCE_EXHAUSTED`).
  - **The full live revision $\to$ booking $\to$ undo journey has NOT been verified end-to-end against live Gemini without hitting quota.**
  - Atlas explicitly surfaces provider errors; no mock fixtures are silently substituted for live inference failures.

### Known Limitations
1. **Single-Tenant Prototype**: Designed for local development and simulation; multi-user session isolation requires an external database.
2. **Local Hash Chain Boundary**: The action ledger detects tampering within the application lifecycle but is persisted to local disk without distributed consensus.
3. **Template-Based Skills**: Learned skills are constrained to safe mathematical expressions; dynamic arbitrary code generation would require an external microVM sandbox (e.g., E2B).

---

## 17. License & Third-Party Attribution

- **Project License**: Atlas is licensed under the [MIT License](LICENSE).
- **Standalone Contribution**: `atlas-plan-validator` is licensed under the [MIT License](contributions/atlas-plan-validator/LICENSE).
- **Third-Party Notices**: Full upstream attributions and open-source licenses for the Model Context Protocol SDK, Playwright MCP, React, Vite, AWS SDK, and Google Gemini API client are documented in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
