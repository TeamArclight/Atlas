# Open Source Mini-Challenge Submission Brief

**Hackathon**: Build, Ship, Shape: Amazon Developer Hackathon (Devpost 2026)  
**Track**: Alexa+ Track  
**Mini-Challenge**: Open Source Contribution  
**Status**: Contribution published to GitHub; Devpost entry and video submission remain manual.

---

## Required Submission Fields

| Field | Value / Status | Note |
| :--- | :--- | :--- |
| **Additional Contribution URL** | https://github.com/TeamArclight/atlas-plan-validator | Published commit: cad7c4a |
| **Atlas Primary Repository URL** | `https://github.com/TeamArclight/Atlas.git` | Primary project repository authorized for push |
| **GitHub Username** | Nightingale2494 | https://github.com/Nightingale2494 |
| **Contribution License** | MIT License | Full text in `contributions/atlas-plan-validator/LICENSE` |
| **Contribution Package Name** | `atlas-plan-validator` | Version 1.0.0, zero runtime dependencies |

> [!IMPORTANT]
> The user provided both repository URLs and confirmed the entrant profile. The standalone contribution is published; the Devpost entry has not been submitted.

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

The standalone repository installs its own development dependencies, builds successfully, and passes all 12 tests, including a regression against malformed approval flags and missing allowlisted tools. Its original MIT license commit is preserved.

Atlas consumes the same validator source as a local package. The last full verification passed 31 tests and the production build. The seeded evaluation contains five fixture scenarios; it is separate from live Gemini verification.

## Publication

- Repository: https://github.com/TeamArclight/atlas-plan-validator
- Contribution commit: cad7c4a
- Primary project: https://github.com/TeamArclight/Atlas
- Entrant: https://github.com/Nightingale2494
- License: MIT
- npm registry publication: not performed or required for this GitHub contribution.

Use these verified links in the Devpost Open Source fields. Review the final entry and upload a demo video under three minutes. No Devpost submission has been made by this agent.