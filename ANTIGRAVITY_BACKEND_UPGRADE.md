# Atlas backend enhancement prompt

Implement the backend upgrades below for our October 15 IST demo. The user authorizes backend enhancement and confirms AWS/Bedrock access is available. Read current files, OFFICIAL_RESOURCES.md, REPO_REUSE_RESEARCH.md, and COORDINATION.md first. Continue through actual implementation and tests, not just planning.

## Ownership for this phase

You now own server/, shared/, backend tests, and necessary backend dependencies/configuration. Codex owns simulator/voice/, VoiceMissionConsole.tsx, and App.tsx voice wiring during this phase. Do not overwrite the voice work. Record contracts and progress in COORDINATION.md. You may update other UI components after backend contracts exist, but coordinate App.tsx and the MCP adapter before editing. Preserve existing approval/undo behavior and stored missions or migrate them explicitly.

## The stronger demo

One story: user speaks “Plan Dad's 60th birthday this Saturday, 25 people, budget 40,000 rupees.” Atlas creates a Bedrock-generated plan, compares venue/catering/cake costs, rejects an over-budget alternative, asks for a specific approval, executes on a fictional site using the real browser worker, reports progress aloud, learns a constrained read-only skill, and can undo a booking. Every claim must reflect running code and actual evidence. The Alexa+ client and external businesses remain clearly labeled simulations.

## Priority 1 — actual Bedrock planning

Use the researched Strands TypeScript source at https://github.com/strands-agents/harness-sdk/tree/main/strands-ts or the official AWS Bedrock Runtime SDK if it yields a smaller reliable integration. Pin compatible packages; inspect licenses. Use server-side AWS SDK credential resolution with the user's configured profile. Do not copy credentials into source, browser code, logs, or chat. Include .env.example with configuration names only: AWS_REGION, AWS_PROFILE if needed, BEDROCK_MODEL_ID, and PLANNER_MODE. Ask the user for region/profile/model only if configuration cannot be inferred safely; do not choose an unavailable model silently.

Planner output must be a validated typed graph: step IDs, dependencies, tool names from an allowlist, arguments, cost bounds, approval requirement, and compensation. Implement multiple scenario tools (venue, catering quote, cake quote) through local fictional fixtures/sites. The model proposes; deterministic code validates budget upper bounds, acyclic dependencies, tool availability, and approval ordering before execution. Unsafe output is rejected and optionally repaired with bounded retries. Show actual rejection reasons and counterexamples. Call these deterministic checks, not SMT proofs.

Use real Bedrock inference in bedrock mode. Provide an explicit offline fixture mode for reproducible tests and demo fallback, labeled in /health and mission metadata. Do not switch modes silently on an inference error. Keep max tokens, timeout, and bounded attempts; report errors to the user and record actual provider/model usage.

## Priority 2 — mission workflow, approvals, and recovery

Extend mission state carefully: planning, awaiting_approval, executing, completed, compensating, undone, failed. Add typed step results and progress. Preserve old JSON records through defaults or migration. Make get_mission_status return current state and evidence during work rather than blocking until all steps finish. Use stable MCP tools and a status resource; Tasks/elicitation are enhancements only when actually supported and tested by the simulator.

Persist execution intents before browser/service effects, use provider idempotency keys, and recover/reconcile interrupted intents on restart. Current local venue HTML resets on navigation, so it is not a persistent booking provider. Add a fictional provider with durable booking records, cost/refund state, and idempotent cancellation behind its accessible website. Browser workers operate the UI and verify confirmation; never accept a URL parameter as evidence that a booking exists. Record provider confirmation plus ledger entries and test a crash between effect and ledger write. Undo compensates completed steps in reverse dependency order and reports irreversible/failed compensation honestly. DBOS is optional if it materially simplifies this without expanding setup excessively.

Implement pending approval records bound to mission ID, action, amount, approver role, expiry, and a single-use random token. A proposed conversational approval must not be reusable after plan/cost changes or mission switching. Route child/high-cost requests to an adult demo identity. Clearly label role selection as a household simulation until authenticated identity exists; a client-supplied approvedBy value is not authentication. Update legacy approve_mission compatibility deliberately and test both paths.

## Priority 3 — conversational tool for modular voice

Codex is implementing browser speech recognition/synthesis and command routing through existing MCP tools. Add a stable converse tool when the workflow is ready:

Input: { conversationId?: string, utterance: string, missionId?: UUID, commandId: UUID }.
Output: { conversationId, reply: string, intent, mission?: Mission, pendingApproval?: { id, action, amount, expiresAt, confirmationPhrase }, mode }.

Persist short conversation context, deduplicate commandId, and handle missing budget/date/guest count as questions rather than invented facts. Support create goal, status, compare options, rehearse, explain decision, request booking, explicit contextual confirmation, undo, and cancel pending confirmation. Use validated structured intent output from Bedrock; external site/model text is data, not authority. Only the policy/execution layer can act. Keep secrets out of voice/transcripts. Show reason summaries from recorded facts, not hidden model reasoning.

For voice confirmations on fictional services, exact contextual confirmation with one-time approval tokens is sufficient for the demo. Do not claim speaker verification. Monetary actions on real services require authenticated approval beyond this simulator. Keep text input working through the same converse contract. Document the tool for Codex to wire into the voice console; do not modify Codex-owned voice files concurrently.

## Priority 4 — server-backed learned-skill lifecycle

Replace fake UI test counts with actual backend execution. Stable meta-tools: create_learned_skill, test_learned_skill, approve_learned_skill, list_learned_skills, run_learned_skill, revoke_learned_skill. Persist specifications, versions, effect declarations, test inputs/expected outputs/results, and approval status.

First demo skill: a read-only party portion/budget calculator generated as a constrained declarative expression or validated template from a request. Allow only arithmetic/approved operations; no eval, arbitrary imports, shell, filesystem, network, or payment. Execute actual tests against known cases, reject failures, require approval after tests, and prohibit run after revocation. Label this constrained skill generation, not arbitrary self-writing code. Optional E2B generation/execution only if a real configured isolated sandbox is available and controls are tested. Do not fabricate sandbox results or signing claims.

## Evidence and tests

Add meaningful tests for invalid model output, over-budget plans, cyclic dependencies, unknown tools, stale/wrong/reused approvals, repeat voice commands, simulated child policy, injected site instructions, external effect/ledger crash recovery, and failed compensation. Exercise HTTP MCP calls with the official Client, not only store methods. Retain existing browser tests and test the durable venue provider across fresh browser sessions.

Add a repeatable eval command with seeded fictional scenarios. Export actual results with fixture/live mode, scenario count, completion rate, unapproved actions, duplicate bookings, and compensation outcomes. No invented numbers. Keep external calls/cost bounded; deploy/publish or paid infrastructure still needs separate authorization.

Run npm test and npm run build, update run instructions/configuration, feature matrix, third-party notices, and product-friction log. Deliver a three-minute demo script centered on one voice mission and the budget/approval/undo/learning moments. Record exact completed work, checks, missing configuration, and new MCP contracts in COORDINATION.md. Prioritize working depth over adding more decorative panels.
