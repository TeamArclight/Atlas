# Atlas Shared Coordination

Target: working demo by October 15, 2026 IST. Hackathon track: Amazon Developer Hackathon (Alexa+ Track).

---

## Current Status

### Codex integration review

Connected App.tsx voice routing to the backend converse tool and replaced the simulated skill panel with ServerSkillForge using actual MCP lifecycle tools. Added conversational execution through the same serialized browser path as booking/undo. Approval role/phrase checks now run before browser effects, and substring confirmations such as "do not confirm booking" are rejected. A new HTTP regression test verifies both behaviors. 17 tests and the production build passed. The final added skill budget input was type-checked separately.

Live Bedrock remains unverified: awaiting user-provided AWS region/profile/model configuration. Fixture results do not establish live model behavior. Remaining limitations include regex intent handling, in-memory conversation state, simulated identity, and venue-page browser confirmation separate from provider persistence. Multi-step quote steps are not a complete durable executor; avoid describing every roadmap item as implemented.

### Antigravity Backend Enhancement Completed (October 13, 2026)
- **Real Bedrock & Scenario Planner**: Implemented `server/planner.ts` integrating `@aws-sdk/client-bedrock-runtime` with AWS SDK credential resolution and fallback fixture mode. Includes deterministic graph validator enforcing budget upper bounds, acyclic DAG dependencies, tool allowlist, and mandatory approval gates on paid steps. Compares venue/catering/cake options and rejects over-budget alternatives with counterexamples. Added `.env.example`.
- **Durable Fictional Venue Provider**: Implemented `server/provider.ts` (`FictionalVenueProvider`) with disk persistence (`data/fictional_bookings.json`), idempotency keys, refund tracking, and API endpoints (`GET /demo/api/venue/:ref`).
- **Contextual Approvals & Household Identity**: Implemented `server/approvals.ts` (`ApprovalManager`) with single-use tokens, 5-minute expiration windows, and child role policy enforcement (rejects financial commitments without adult approval).
- **Execution Intent Persistence & Crash Reconciliation**: Extended `server/missions.ts` (`MissionStore`) with richer lifecycle states (`planning`, `awaiting_approval`, `executing`, `completed`, `compensating`, `undone`, `failed`). Records execution intents before effects and reconciles interrupted intents on restart.
- **Conversational MCP Tool (`converse`)**: Implemented `server/converse.ts` for voice and text command routing. Clarifies missing information, explains rejected options, handles single-use contextual confirmation tokens, and deduplicates `commandId`.
- **Server-Backed Learned Skills Forge**: Implemented `server/skills.ts` with 6 meta-tools (`create_learned_skill`, `test_learned_skill`, `approve_learned_skill`, `list_learned_skills`, `run_learned_skill`, `revoke_learned_skill`). Safe mathematical evaluator (no arbitrary eval or system calls), test fixture execution, adult approval gate, and revocation prohibition. Pre-seeds `party_portion_calculator`.
- **Repeatable Evaluation Benchmark**: Built `server/eval.ts` (`npm run eval`) with 5 seeded scenarios. Exports `data/eval_report.json` with 100% pass rate, 0 unapproved actions, and 0 duplicate bookings.
- **Full Voice Mission Verified**: Tested complete voice mission lifecycle in `server/voice-mission-e2e.test.ts` (planning -> status -> option comparison -> approval request -> rejection of generic "yes" -> exact confirmation -> browser worker booking -> undo -> cancellation compensation). All 16 unit, integration, and E2E tests pass.

### Codex Voice & UI Status
- Codex owns `simulator/voice/commands.ts`, `simulator/voice/speech.ts`, `VoiceMissionConsole.tsx`, and `App.tsx` voice wiring.
- Antigravity preserved Codex's voice files and contracts while equipping the MCP server with the matching `converse` tool.

---

## Ownership Boundaries

- **Antigravity (Backend Enhancement Phase)**: `server/`, `shared/`, backend tests, `.env.example`, `server/eval.ts`, and backend coordination.
- **Codex**: `simulator/voice/`, `VoiceMissionConsole.tsx`, and `App.tsx` voice wiring.

---

## Verified Checks and Test Results

### 1. Test Suite (`npm test`)
```bash
> atlas-missions@0.1.0 test
> tsx --test server/*.test.ts simulator/*.test.ts

✔ Playwright fills, books, captures actual accessibility evidence, and cancels fictional venue (8826ms)
✔ approval, retry, persistence, and compensation preserve one booking (20ms)
✔ real MCP HTTP client initializes, validates origins, and completes approval/undo (232ms)
✔ 1. Plan graph validation rejects over-budget plans, cyclic graphs, unknown tools, and missing approval gates (69ms)
✔ 2. Approval manager enforces child role restriction, token expiration, and single-use consumption (3ms)
✔ 3. Persistent fictional venue provider guarantees idempotency and persists across fresh provider instances (5ms)
✔ 4. Crash reconciliation: intent completed in provider but interrupted before ledger writes reconciles on restart (7ms)
✔ 5. Conversational service handles questions, compare options, booking requests, confirmations, and command deduplication (10ms)
✔ 6. Learned skills: safe mathematical evaluation, test fixtures verification, adult approval gate, and revoked prohibition (8ms)
✔ 7. End-to-end HTTP MCP client exercises converse and learned skills meta-tools (177ms)
✔ Complete Voice Mission E2E: plan -> status -> compare options -> book -> confirm -> undo -> confirm compensation (23652ms)
✔ 1. Malformed input validation rejects invalid budgets and empty goals (3ms)
✔ 2. Missing or invalid mission ID throws not found error (3ms)
✔ 3. Repeated approval is idempotent and prevents duplicate booking entries (12ms)
✔ 4. Full lifecycle create -> approve -> undo -> reload recovery preserves ledger hash chain (13ms)
✔ voice commands distinguish goals, status, undo, and contextual confirmations (5ms)
ℹ tests 16 | suites 0 | pass 16 | fail 0
```

### 2. Repeatable Eval Benchmark (`npm run eval`)
```bash
> atlas-missions@0.1.0 eval
> tsx server/eval.ts

Planner Mode:           fixture
Scenarios Evaluated:    5
Completed Scenarios:    5/5 (100%)
Unapproved Actions:     0 (Expected: 0)
Duplicate Bookings:     0 (Expected: 0)
Compensations:          1/1 succeeded
[PASS] Standard Full Lifecycle (Plan->Approve->Undo)
[PASS] Boundary Minimum Budget Acceptance (INR 12,000)
[PASS] Deterministic Under-Budget Rejection (INR 8,000)
[PASS] Simulated Child Policy Financial Block
[PASS] Duplicate Approval Idempotency Protection
```

### 3. Production Build (`npm run build`)
```bash
> atlas-missions@0.1.0 build
> tsc --noEmit && vite build
✓ built in 1.89s (0 TypeScript errors)
```

---

## Active MCP Tool Contracts

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `create_mission` | `goal: string, budget: integer` | Formulates a validated plan via Bedrock or scenario planner with alternative evaluations. |
| `list_missions` | `{}` | Lists all saved missions and their step/ledger states. |
| `get_mission_status` | `missionId: UUID` | Retrieves current mission, evidence, steps, and ledger audit trail. |
| `approve_mission` | `missionId: UUID, tokenOrPhrase?: string, role?: 'adult'\|'child'` | Commits booking after verifying approval token and role authorization. |
| `undo_mission` | `missionId: UUID, tokenOrPhrase?: string, role?: 'adult'\|'child'` | Compensates completed booking in reverse dependency order. |
| `converse` | `utterance: string, commandId: string, missionId?: UUID, conversationId?: string` | Modular conversational tool for voice/text interaction and contextual confirmation. |
| `get_browser_worker_status` | `missionId: UUID` | Returns real Playwright accessibility snapshot and operation evidence. |
| `list_learned_skills` | `{}` | Lists all registered skills with test verification history and status. |
| `create_learned_skill` | `name, description, category, template, parameters, tests` | Registers a declarative learned skill with test fixtures. |
| `test_learned_skill` | `skillId: string` | Runs test fixtures in safe declarative evaluator and records pass/fail metrics. |
| `approve_learned_skill` | `skillId: string, approverRole: 'adult'\|'child'` | Authorizes tested skill for execution (requires adult role). |
| `run_learned_skill` | `skillId: string, input: Record<string, number>` | Executes an approved skill (rejects unapproved or revoked skills). |
| `revoke_learned_skill` | `skillId: string, reason: string` | Revokes authorization of a learned skill. |

## Gemini provider update (October 22)
User chose Gemini instead of Bedrock. Added server/gemini.ts with server-side key header, structured response request, runtime schema validation, timeout, explicit errors, and supported-executor checks. PLANNER_MODE=gemini is wired through MissionPlanner and shared types. start.ts loads local .env on Node 22+. See GEMINI_SETUP.md.

**Live Gemini Verification Status**:
- Mocked unit tests in `server/gemini.test.ts` verify header authorization and schema validation.
- Live model call remains blocked pending local `.env` configuration (`GEMINI_API_KEY` and `GEMINI_MODEL`).
- No secret credentials should ever be placed in chat, logs, or client-side code.
- If `PLANNER_MODE=gemini` is active without credentials or encounters an error, it throws an explicit error; there is strictly no silent fallback to fixtures.

---

## Open Source Contribution Update (October 22)
Extracted the provider-independent plan graph validator into a standalone, zero-dependency package under `contributions/atlas-plan-validator/`:
- **Package Details**: `atlas-plan-validator` v1.0.0, MIT license, zero runtime dependencies, ES Module targeting NodeNext/ES2022.
- **Capabilities**:
  - Deterministic DAG cycle detection via Kahn's topological sort algorithm.
  - Strict budget enforcement with counterexample cost gaps.
  - Tool allowlist filtering.
  - Mandatory human approval gate enforcement for financial actions (`costBound > 0`).
  - Structural step integrity checks (unique non-empty ID, non-empty title, finite non-negative costs).
  - Typed error hierarchy (`BudgetExceededError`, `CyclicDependencyError`, `UnauthorizedToolError`, `MissingApprovalGateError`, `MalformedStepError`).
- **Real Reuse Demonstration**: Atlas consumes `atlas-plan-validator` via `"atlas-plan-validator": "file:contributions/atlas-plan-validator"`, imported directly in `server/planner.ts`.
- **Submission Evidence**: Created `OPEN_SOURCE_SUBMISSION.md` documenting contribution architecture, distinction from primary Atlas submission, and required Devpost submission fields (marked pending publication).
- **Test Suite**: 11 standalone unit tests in `contributions/atlas-plan-validator/test/validator.test.ts` (11/11 passing). Full project test suite has 30 passing tests. Produces clean production build (`npm run build`) in 1.70s with 0 TS errors.



## Live Gemini Verification & Publication Update (October 23, 2026)

### 1. Live Gemini Planning Verified End-to-End
- **Provider & Model**: Google AI Studio REST API using `gemini-3.5-flash` with backend `.env` configuration.
- **Resilience**: Added exponential retry with backoff in `server/gemini.ts` for transient HTTP 503 (Overloaded) and 429 (Rate Limit) statuses.
- **Full Mission Lifecycle Executed**:
  1. *Voice Formulation*: `create_mission` via `converse` tool returned 3 validated steps (Garden Hall venue INR 12,000, catering quote INR 0, cake quote INR 0) with `plannedCost: 12000`, `buffer: 28000`.
  2. *Status Check*: Reported `awaiting_approval` and budget metrics.
  3. *Approval Request*: Issued one-time confirmation token with 5-minute TTL.
  4. *Confirmation & Execution*: Headless Playwright worker filled form, confirmed booking on fictional venue page, verified persistent booking `#ATLAS-1858C39D`, and committed Action Ledger entry #1 with SHA-256 hash chaining.
  5. *Undo / Saga Compensation*: Prompted for cancellation confirmation, executed cancellation on browser page, refunded provider booking, and wrote ledger reversal entry (`-INR 12,000`), restoring net ledger balance to INR 0.
- **Fail-Safe Policy**: Verified that errors or quota limits throw explicit errors; no silent fixture replacement occurs.

### 2. Primary Atlas Repository Published
- **Remote**: `https://github.com/TeamArclight/Atlas.git` (authorized by entrant).
- **Initial Commit ID**: `23f47620bad6f252575a860cc126842fe06e4413` on branch `main`.
- **Clean Hygiene**: Strictly excluded `.env`, `.env.*`, `data/`, `node_modules/`, `dist/`, and test artifacts. Added root `LICENSE` (MIT) and updated `.gitignore`.
- **Fresh Clone Verification**: Tested cloning to an isolated temp directory; `npm install` automatically executed `prepare` hook (`build:validator`), `npm run build` completed in 1.70s with 0 TS errors, and `npm test` passed 31/31 tests. Pushed successfully via authenticated GitHub account.

### 3. Open Source Contribution Prepared: `atlas-plan-validator`
- **Location**: `contributions/atlas-plan-validator/` preserved inside Atlas.
- **Standalone Package**: Complete with its own `package.json` (v1.0.0), `tsconfig.json`, `LICENSE` (MIT), `README.md`, typed API, and 12 unit tests (100% pass).
- **Separate Remote**: Local preparation complete; ready to be pushed to separate repository `atlas-plan-validator` upon entrant creation.

### 4. Submission Artifacts Completed
- **`OPEN_SOURCE_SUBMISSION.md`**: Updated with verified primary repository `https://github.com/TeamArclight/Atlas.git`. Contribution URL and personal GitHub username kept pending entrant confirmation.
- **`SUBMISSION_CHECKLIST.md`**: Completed with repository links, system boundaries (real vs fictional), live Gemini evidence, product feedback, and official timed demo script (< 180s).


