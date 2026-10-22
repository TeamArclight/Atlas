# Open Source Mini-Challenge Submission Brief

**Hackathon**: Build, Ship, Shape: Amazon Developer Hackathon (Devpost 2026)  
**Track**: Alexa+ Track  
**Mini-Challenge**: Open Source Contribution  
**Status**: Prepared locally for review (repository creation and publication pending user authorization)

---

## Required Submission Fields

| Field | Value / Status | Note |
| :--- | :--- | :--- |
| **Additional Contribution URL** | *[PENDING - To be populated upon public GitHub push]* | Repository path: `contributions/atlas-plan-validator/` (pending user creation of separate remote `atlas-plan-validator`) |
| **Atlas Primary Repository URL** | `https://github.com/TeamArclight/Atlas.git` | Primary project repository authorized for push |
| **GitHub Username** | *[PENDING - Entrant personal GitHub handle]* | Submitter's individual GitHub profile (e.g. `Nightingale2494` pending entrant confirmation; organization is `TeamArclight`) |
| **Contribution License** | MIT License | Full text in `contributions/atlas-plan-validator/LICENSE` |
| **Contribution Package Name** | `atlas-plan-validator` | Version 1.0.0, zero runtime dependencies |

> [!IMPORTANT]
> In accordance with contest rules, URLs and GitHub usernames are marked as **pending** rather than fabricated. Do not publish, push code, or submit entries without explicit authorization.

---

## Distinction Between Contribution and Primary Atlas Submission

Official hackathon rules state that merely making the primary hackathon submission public or importing external packages does not satisfy the additional Open Source mini-challenge requirement. A qualifying entry requires an additional open-source project or repository created or contributed to during the hackathon window.

| Dimension | Primary Submission: Atlas | Additional Contribution: `atlas-plan-validator` |
| :--- | :--- | :--- |
| **Role & Purpose** | Complete household milestone mission assistant built for Alexa+, featuring conversational voice control, browser Playwright automation, durable fictional bookings, and server-backed learned skills. | General-purpose, provider-independent plan graph and constraint validator for AI agent missions. |
| **Scope & Domain** | Bound to household event planning (fictional venues, catering quotes, cake quotes), Express MCP backend, Vite/React simulator UI, and Alexa+ voice interactions. | Completely domain-agnostic; applicable to any multi-step agent architecture (DevOps, travel planning, e-commerce, robotics). |
| **Dependencies** | Depends on Express, React, Vite, Playwright, Model Context Protocol SDK, and `@aws-sdk/client-bedrock-runtime` / Google Gemini REST endpoints. | **Zero runtime dependencies**. Implemented in pure TypeScript targeting modern ECMAScript/Node.js runtimes. |
| **Relationship** | Atlas acts as a downstream consumer of `atlas-plan-validator` via `"atlas-plan-validator": "file:contributions/atlas-plan-validator"` in `package.json`. | Standalone package located in `contributions/atlas-plan-validator/`, with its own `package.json`, `tsconfig.json`, MIT license, test suite, and README. Ready for independent publication to GitHub and npm. |

---

## Contribution Purpose & Problem Solved

Modern AI agents utilize Large Language Models (e.g., Google Gemini, Amazon Bedrock, Anthropic Claude, OpenAI) to decompose complex goals into multi-step execution graphs. However, generative LLMs are prone to structural failures that can compromise real-world and simulated execution environments:

1. **Deadlocking Cycles**: LLMs frequently produce circular dependency graphs (e.g., Step A requires Step B, which requires Step A).
2. **Budget Overruns**: Models can propose actions whose aggregate cost exceeds the user's allocated limit without computing cost gaps.
3. **Unauthorized Tool Execution**: Models may hallucinate non-existent tools or call restricted tools outside the authorized capability perimeter.
4. **Ungated Financial Actions**: Costly or irreversible actions may be scheduled without human-in-the-loop approval requirements.
5. **Structural Malformations**: Output may contain duplicate step IDs, missing titles, or non-finite costs.

`atlas-plan-validator` provides a deterministic mathematical and policy firewall that intercepts proposed plans **before execution**, verifying graph acyclicity, budget bounds, tool authorizations, and approval gates.

---

## Architecture & Technical Implementation

The package is organized into modular components under `contributions/atlas-plan-validator/`:

```
contributions/atlas-plan-validator/
├── LICENSE                    # MIT License
├── package.json               # Package metadata (v1.0.0, ES module)
├── tsconfig.json              # TypeScript configuration (NodeNext, declaration true)
├── README.md                  # Comprehensive documentation, API reference, examples
├── src/
│   ├── types.ts               # Core contracts (PlanStep, PlanValidationOptions, PlanValidationResult)
│   ├── errors.ts              # Typed error hierarchy (BudgetExceededError, CyclicDependencyError, etc.)
│   ├── validator.ts           # Deterministic validation engine and assertion helper
│   └── index.ts               # Public library entrypoint
└── test/
    └── validator.test.ts      # 11 unit tests covering all success/failure invariants
```

### Key Technical Mechanisms

1. **Topological Cycle Detection (Kahn's Algorithm)**:
   - Builds an adjacency list and in-degree map for all steps in the plan graph.
   - Iteratively resolves zero-in-degree root steps.
   - Detects both direct 2-step cycles ($A \leftrightarrow B$) and multi-step indirect loops ($A \to B \to C \to A$), returning participant step IDs.
2. **Budget Enforcement with Counterexample Gaps**:
   - Computes total cost bound across all steps.
   - If `totalCost > budget`, computes the exact monetary difference (`costGap`) and formats an explanatory counterexample message.
3. **Mandatory Human-in-the-Loop Approval Gates**:
   - Scans steps for positive cost bounds (`costBound > 0`).
   - Rejects any plan where a financial action lacks `requiresApproval: true`.
4. **Tool Allowlist Enforcement**:
   - Compares invoked tools against a caller-specified `allowedTools` Set or Array, blocking unauthorized tools.
5. **Structural Validation**:
   - Rejects duplicate step IDs, missing non-empty IDs, empty titles, negative costs, and non-finite numbers ($NaN, \infty$).

---

## Verification Evidence

All 11 package unit tests pass deterministically using Node's native test runner (`tsx --test test/*.test.ts`):

```bash
✔ 1. Valid plan satisfies constraints and computes total cost (16.5503ms)
✔ 2. Budget validation rejects plans exceeding allocation with counterexample gap (0.7729ms)
✔ 3. Exact budget boundary succeeds (0.1375ms)
✔ 4. Directed Acyclic Graph (DAG) cycle detection via Kahn topological sort (0.2539ms)
✔ 5. Self-dependency is detected and rejected (0.1722ms)
✔ 6. Missing dependency references are rejected (0.1321ms)
✔ 7. Tool allowlist enforcement rejects unauthorized tools (0.2285ms)
✔ 8. Missing approval gate on costly step is rejected (0.1956ms)
✔ 9. Approval requirement can be bypassed with explicit option if non-financial (0.1688ms)
✔ 10. Structural step validation rejects malformed steps, empty titles, and duplicate IDs (0.2915ms)
✔ 11. Empty plan and step limits (0.1988ms)
ℹ tests 11 | pass 11 | fail 0
```

### Full Project Integration

Atlas directly consumes `atlas-plan-validator` in `server/planner.ts`. Running the complete repository test suite validates both the package and Atlas integration:

- **Total Tests Passing**: 30 tests (11 standalone validator tests + 19 Atlas integration/E2E/Playwright tests).
- **Evaluation Benchmark**: 5/5 seeded scenarios passed (`npm run eval`).
- **Production Build**: Built in 1.70s with 0 TypeScript errors (`npm run build`).

---

## Step-by-Step Publication Instructions (For Project Owner)

When authorized to publish the standalone package and submit to Devpost:

1. **Create the Standalone Repository on GitHub**:
   - Name: `atlas-plan-validator`
   - Description: "Deterministic graph, budget, and approval constraint validator for AI agent missions"
   - License: MIT
2. **Push the Package Code**:
   ```bash
   cd contributions/atlas-plan-validator
   git init
   git add .
   git commit -m "feat: initial release of atlas-plan-validator v1.0.0"
   git branch -M main
   git remote add origin https://github.com/<your-username>/atlas-plan-validator.git
   git push -u origin main
   ```
3. **Publish to npm (Optional)**:
   ```bash
   npm publish --access public
   ```
4. **Update Submission Links**:
   - Replace `[PENDING]` in this file and on Devpost with `https://github.com/<your-username>/atlas-plan-validator`.
   - Update Atlas primary repository URL with `https://github.com/<your-username>/Atlas`.
   - Insert your GitHub username.
