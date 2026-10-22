# Build Atlas with Codex

Build a working Atlas demo for the Amazon Developer Hackathon Alexa+ track by October 15, 2026 IST. Work in this shared folder and continue through implementation, testing, and fixes. The submission must include runnable source and a demo under three minutes.

## Start with the existing project

Read OFFICIAL_RESOURCES.md first and follow the official Alexa-track links there alongside the repository research. The event links MCP transport revision 2025-11-25 and MCP Apps documentation. Current MCP Apps docs describe SDK v2 peers; our scaffold uses SDK v1. Pin a compatible Apps version and matching source, or coordinate a deliberate migration with Codex. Capture actual onboarding friction for submission feedback. Event credit-code requests have closed; do not depend on new hackathon credits.

Read BUILD_BRIEF.md, REPO_REUSE_RESEARCH.md, package.json, the lockfile, shared/contracts.ts, server/index.ts, and server/missions.ts. The product reference is C:/Users/user/Downloads/Atlas_Project_Summary.docx; it describes a broad roadmap. Prioritize a complete core mission.

Codex owns server/ and shared/. You own simulator/, UI assets/tests, root index.html, vite.config.ts, README, and demo instructions. You may add frontend dependencies while preserving existing scripts. Do not overwrite existing work or reset the repository. Put backend contract requests and progress in COORDINATION.md. Writing a request does not mean Codex has read or implemented it; integrate only when the supporting code exists.

## Reuse the researched upstream code

Use dependencies where practical; adapt small examples rather than combining full applications. Pin versions or commits and record copied files, modifications, licenses, and notices in THIRD_PARTY_NOTICES.md.

### MCP transport and approvals

https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x/src/examples

Use client/simpleStreamableHttp.ts and server/simpleStreamableHttp.ts as references. Adapt the client for the browser, removing Node CLI code. Use server/elicitationFormExample.ts and server/elicitationUrlExample.ts for future approval/OTP interactions. Our backend uses @modelcontextprotocol/sdk v1: do not mix in main's split-package APIs. v1.x is MIT licensed. Coordinate session/transport changes for bidirectional elicitation with Codex; current transport is sessionless.

### React dashboard and MCP Apps host

https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/basic-host
https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/basic-server-react

Reuse patterns from basic-host/src/implementation.ts, src/index.tsx, and src/sandbox.ts; basic-server-react/server.ts, src/mcp-app.tsx, and vite.config.ts. Check SDK compatibility first. Ship a normal React simulator before embedded widgets. Use AppBridge/useApp and sandboxed rendering only when integrated correctly. Preserve applicable Apache-2.0/MIT notices from source headers and LICENSE. Do not assume Alexa+ supports MCP Apps.

### Browser interaction

https://github.com/microsoft/playwright-mcp

Use accessibility snapshots and browser-tool patterns for the fictional venue site. Build the venue page in simulator/sites/ with accessible, stable labels and booking/cancellation states. Codex will own the browser worker. Ordinary Playwright is acceptable for the first demo; a second internal MCP browser server is optional. Apache-2.0 licensed. Browser automation does not enforce our budget/approval policies by itself.

### Bedrock planning

https://github.com/strands-agents/harness-sdk/tree/main/strands-ts

Use examples/, BedrockModel, structured-output, streaming, and MCP integration patterns through the backend. The old sdk-typescript repository is archived. Verify current LICENSE and Node/package requirements before adoption; current README requires Node 22+. AWS credentials and inference stay on the server. Coordinate schemas with Codex and show deterministic planning honestly until real inference exists.

### Conditional enhancements after the core journey works

- https://github.com/aws-samples/sample-agentcore-mcp-apps — src/ and infrastructure/ for booking widgets, DynamoDB, and CDK. Repository reports MIT-0; verify LICENSE at the chosen commit. Default WAF settings can block our simulator. Do not deploy its full infrastructure just to build the UI.
- https://github.com/dbos-inc/dbos-transact-ts — MIT; durable workflows require Postgres and explicit business compensation. Coordinate backend adoption.
- https://github.com/e2b-dev/E2B — Apache-2.0; isolated learned-tool execution requires a configured sandbox service. Never present local eval or Node vm as a secure sandbox.

## The demo journey

User goal: “Plan Dad's 60th birthday for Saturday, 25 people, budget INR 40,000.”

Create mission → display plan and budget → request explicit approval → book fictional venue → show action ledger → undo booking → show compensation. Later add a tested, approved learned skill when its backend is available.

Build a polished responsive React/Vite UI with dark navy, readable typography, restrained amber/teal accents, and a clear mission timeline. The page should explain the mission through actual progress and actions.

Required:

- Prefilled goal and editable budget, with validation.
- MCP connection status; explicit Alexa+ simulator and fictional-service labels.
- Saved mission list, selected mission, steps, planned cost, and status.
- Explicit approval controls and undo after completion; disable repeated clicks while pending.
- Ledger view with action, cost, timestamp, and hash linkage; replay only events that actually occurred.
- Protocol inspector of actual JSON-RPC traffic with summaries and expandable payloads. Instrument transport/fetch and redact sensitive fields. Do not fabricate protocol events.
- Fictional venue website for the upcoming browser worker. Distinguish actual browser operation from visual simulation.
- Loading, empty, disconnected, and error states; keyboard access and mobile layout.

Voice input/output is optional. Feature-detect support and retain a text fallback. Transcribed speech alone must not execute a purchase.

## Current backend contract

Server: http://127.0.0.1:3001/mcp. Use Vite proxies for /mcp and /health. Connect with the official MCP Client and StreamableHTTPClientTransport to the proxied /mcp URL. Do not replace tool calls with a fake REST backend.

- create_mission({ goal: string, budget: integer }): minimum budget currently INR 12,000; creates a fixed fictional venue scenario.
- list_missions({}): saved missions.
- get_mission_status({ missionId: UUID }): mission.
- approve_mission({ missionId: UUID }): commits simulated booking after explicit user approval.
- undo_mission({ missionId: UUID }): simulated cancellation.

Successful results contain structuredContent: { result: value }. Fallback text is JSON.stringify(value), without the wrapper. Handle isError and SDK/protocol exceptions. shared/contracts.ts defines the authoritative Mission type and current states: awaiting_approval, completed, undone.

The current scaffold records a deterministic booking in local JSON. It does not yet run a browser, call Bedrock, implement household identity, generate learned tools, or execute durable background workflows. Do not render these features as working until integrated. Request concrete contracts in COORDINATION.md for browser status, richer mission states, household approval, and learned-skill testing/approval/revocation. Label any template-based skill creation accurately.

## Implementation order and acceptance

1. Complete create → approve → undo through real MCP calls.
2. Add protocol inspector, saved mission recovery, ledger detail, errors, and responsive styling.
3. Build fictional venue UI; integrate Codex's browser worker when available.
4. Integrate actual Bedrock/learned-tool capabilities only when backend contracts support them.
5. Run npm test and npm run build. Add focused integration checks for connection failure, malformed input, repeated approval, and reload recovery. Inspect the running app in a browser and fix console/layout issues.

Keep TypeScript checks enabled; split frontend/backend configurations if needed without removing either from validation. Never invent evaluation metrics or claim a budget check is formal proof.

Finish with run commands, configuration requirements, a truthful feature table, attribution, a timed demo script under three minutes, and a report in COORDINATION.md of files changed, checks run, blockers, and backend requests. Do not publish, submit, send external messages, or create paid infrastructure without user authorization.
