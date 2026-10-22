# Third-Party Notices and Open Source Attribution

Atlas incorporates and adapts architectural patterns and code patterns from the following open-source projects under their respective licenses.

---

### 1. Model Context Protocol TypeScript SDK
* **Repository**: https://github.com/modelcontextprotocol/typescript-sdk
* **Release / Branch**: `v1.x` (`@modelcontextprotocol/sdk` v1.26.0)
* **License**: MIT License
* **Copyright**: (c) Anthropic, PBC
* **Adaptation & Modifications**:
  - Adapted the `StreamableHTTPClientTransport` client patterns from `src/examples/client/simpleStreamableHttp.ts` for browser execution.
  - Implemented custom instrumentation within the client transport fetch handler (`simulator/mcp/client.ts`) to intercept raw JSON-RPC 2.0 messages, measure round-trip latency, redact sensitive authorization headers, and publish live traffic events to the Protocol Inspector.
  - Retained sessionless transport compatibility for local development matching the server scaffold.

---

### 2. Model Context Protocol Extension Apps (MCP Apps)
* **Repository**: https://github.com/modelcontextprotocol/ext-apps
* **Commit / Reference**: `main` (`examples/basic-host`, `examples/basic-server-react`)
* **License**: Apache-2.0 / MIT
* **Copyright**: (c) Model Context Protocol Authors
* **Adaptation & Modifications**:
  - Reused React dashboard host layout concepts, live status badge indicators, and sandboxed iframe isolation patterns for the embedded fictional venue view.
  - Maintained clean separation between host UI and sandboxed demonstration widgets while staying on SDK v1 / Zod 3 peer dependencies to prevent v2 peer resolution conflicts.

---

### 3. Microsoft Playwright MCP
* **Repository**: https://github.com/microsoft/playwright-mcp
* **License**: Apache-2.0
* **Copyright**: (c) Microsoft Corporation
* **Adaptation & Modifications**:
  - Implemented accessible semantic DOM structure and ARIA labels (`role="button"`, `role="status"`, `aria-label`, `data-testid`) within `simulator/sites/fictional-venue.html` to serve as a target for automated Playwright agent navigation and accessibility snapshots (`observe-act-verify` loop).
  - Designed the venue booking state machine (`available` -> `reserved` -> `cancelled`) to distinguish visual front-end presentation from Codex's headless browser worker.

---

### 4. Strands Agents SDK
* **Repository**: https://github.com/strands-agents/harness-sdk (`strands-ts`)
* **License**: Apache-2.0
* **Copyright**: (c) Strands Agents Authors
* **Adaptation & Modifications**:
  - Reused structured output schemas and agent planning patterns for household mission execution.
  - Integrated deterministic graph validation and alternative evaluation structures.

---

### 5. AWS SDK for JavaScript v3 (Bedrock Runtime)
* **Repository**: https://github.com/aws/aws-sdk-js-v3
* **Package**: `@aws-sdk/client-bedrock-runtime` (`^3.1150.0`)
* **License**: Apache-2.0
* **Copyright**: (c) Amazon.com, Inc. or its affiliates
* **Usage**: Server-side AWS Bedrock Runtime client invoking generative foundation models for household mission planning.

---

### 6. React & React DOM
* **Version**: `^19.1.0`
* **License**: MIT
* **Copyright**: (c) Meta Platforms, Inc.

---

### 7. Vite & @vitejs/plugin-react
* **Version**: Vite `^6.3.0`, `@vitejs/plugin-react` `^4.7.0`
* **License**: MIT
* **Copyright**: (c) Evan You & Vite Contributors
* **Configuration**:
  - Configured reverse proxies for `/mcp` and `/health` routing to the local Express/MCP server on `127.0.0.1:3001`.

---

### 8. Google Gemini REST API Client
* **API Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
* **Integration**: Server-side native `fetch` client in `server/gemini.ts` using structured `responseSchema`, system instructions, and runtime validation with Zod.
* **Security & Credential Management**: `GEMINI_API_KEY` is loaded exclusively via Node's local `.env` loader on the backend. No keys are exposed to the client bundle or logs.

---

### 9. Atlas Plan Validator (`atlas-plan-validator`)
* **Location**: `contributions/atlas-plan-validator/`
* **License**: MIT License
* **Copyright**: (c) 2026 Atlas Project Contributors
* **Description**: Extracted standalone package providing deterministic DAG validation, Kahn's algorithm cycle detection, budget checks, tool allowlists, and human approval enforcement. Consumed by Atlas via local workspace reference.
