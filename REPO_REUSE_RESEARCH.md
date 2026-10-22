# GitHub reuse research for Atlas

Reviewed October 13, 2026. Target: demo ready October 15 IST.

These are shortlisted upstream components, not integrated code. Repository READMEs, example directories, selected source files, and licenses were inspected through GitHub. No full repository audit or runtime integration has been performed. Pin exact releases or commits and record attribution when adopting code.

## Adopt first

### 1. Official MCP TypeScript SDK

Repository: https://github.com/modelcontextprotocol/typescript-sdk

Atlas uses the v1 package @modelcontextprotocol/sdk. Use v1.x source examples, not main's split-package APIs:

- Server: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStreamableHttp.ts
- Client: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/client/simpleStreamableHttp.ts
- Form elicitation: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/elicitationFormExample.ts
- URL elicitation: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/elicitationUrlExample.ts

Reuse transport/session lifecycle patterns, client tool calls, capability detection, and approval elicitation. Adapt the client example to browser UI; it is an interactive Node example, not a drop-in React component. Sessionless calls currently work for the Atlas scaffold; bidirectional elicitation and notifications need a deliberate transport/session design and integration tests.

License verified: v1.x LICENSE is MIT. Main has different licensing and APIs. Preserve the copyright and license for copied v1 code.

### 2. Official MCP Apps SDK and examples

Repository: https://github.com/modelcontextprotocol/ext-apps

Useful source:

- https://github.com/modelcontextprotocol/ext-apps/blob/main/examples/basic-host/src/implementation.ts
- https://github.com/modelcontextprotocol/ext-apps/blob/main/examples/basic-host/src/index.tsx
- https://github.com/modelcontextprotocol/ext-apps/blob/main/examples/basic-host/src/sandbox.ts
- https://github.com/modelcontextprotocol/ext-apps/blob/main/examples/basic-server-react/server.ts
- https://github.com/modelcontextprotocol/ext-apps/blob/main/examples/basic-server-react/src/mcp-app.tsx
- https://github.com/modelcontextprotocol/ext-apps/blob/main/examples/basic-server-react/vite.config.ts

Reuse the host's MCP connection and AppBridge integration, React useApp hook, UI resource registration, and sandboxed widget rendering. Build Atlas's mission cards and timeline ourselves. Check dependency compatibility with our v1 MCP SDK before importing examples. A normal React dashboard can ship first; embedded MCP Apps are an enhancement, and Alexa host support must not be assumed.

License file inspected: Apache-2.0 for new code, MIT for existing code; documentation separately CC-BY-4.0. Check headers and preserve applicable upstream notices for each copied file.

### 3. Microsoft Playwright MCP

Repository: https://github.com/microsoft/playwright-mcp

Reuse the published browser tool server as an internal worker dependency if it fits the agent loop. Its accessibility snapshots and navigation/click/fill tools support Atlas's browser observe-act-verify flow. Keep the public Atlas mission server separate from the internal browser server. For the controlled fictional venue flow, ordinary Playwright scripts are likely quicker than adding a second MCP server; this is an implementation recommendation, not a benchmark result.

License verified from repository: Apache-2.0. Browser automation does not provide Atlas's spending policy, transaction ledger, or tool sandbox. Those remain our responsibility.

### 4. Strands TypeScript for Bedrock planning

Current source: https://github.com/strands-agents/harness-sdk/tree/main/strands-ts

Start with strands-ts/examples and the BedrockModel, structured-output, streaming, and MCP integration patterns. Use this to replace the current deterministic planner with validated Bedrock plans. Keep AWS credentials and model calls on the server.

The old https://github.com/strands-agents/sdk-typescript repository is archived and points to this monorepo. Its Apache-2.0 license is verified. The new strands-ts/LICENSE is listed but its contents could not be fetched in this review; confirm that file at the selected commit before copying code. Current README requires Node 22+ and configured AWS model access. Do not copy stale model IDs from old examples.

## Conditional enhancements

### 5. AWS AgentCore MCP Apps sample

Repository: https://github.com/aws-samples/sample-agentcore-mcp-apps

Source areas: src/ and infrastructure/. Adapt TypeScript MCP tools and widget resources, DynamoDB booking records, and CDK infrastructure to Atlas if AWS access is ready. Repository reports MIT-0; raw license retrieval failed, so retain and inspect LICENSE at the pinned commit before reuse.

This is a booking/return sample, a close functional starting point for venue booking/undo. It also includes Python Lambda, Gateway, WAF, S3, and CloudFront. Adopting the whole stack would expand our two-day scope. The default WAF rules allow selected host egress ranges and can block our own simulator; revise deployment configuration deliberately. Do not run deployment scripts during research.

### 6. DBOS durable TypeScript workflows

Repository: https://github.com/dbos-inc/dbos-transact-ts

Reuse the library's workflow/step, durable notification, queue, and recovery patterns for missions that wait for approval or resume after a crash. Requires Postgres. Our JSON store preserves mission records but is not a durable workflow engine. DBOS does not automatically undo external business actions; implement explicit saga compensation and provider idempotency.

License verified: MIT. Adopt only if Postgres can be set up without putting the core demo at risk.

### 7. E2B sandbox SDK

Repository: https://github.com/e2b-dev/E2B

Use the JavaScript SDK under packages/ for isolated execution of generated learned-tool code. This is a possible tool-forge backend rather than a tool generator. Generation, effect declarations, tests, approval, signing, and revocation remain Atlas code. Hosted use requires an account/API key and evaluation of network controls and cost; self-hosting is outside the first demo scope.

License inspected: Apache-2.0. Never substitute a local JavaScript eval or Node vm for an isolated sandbox.

### 8. Cedar policy engine

Repository: https://github.com/cedar-policy/cedar

Use Cedar for household authorization as a later enhancement. This repository implements the policy language; it does not prove budgets or plan ordering. Rust integration or a separate service adds work to our TypeScript demo. Keep explicit, tested household rules first and add Cedar after the complete mission flow.

License inspected: Apache-2.0.

## Recommended combination for October 15

MCP v1 examples + MCP Apps React/host patterns + Playwright for the fictional venue + Strands/Bedrock planning if credentials are ready. Add a real sandbox for generated tools only when configured; otherwise label a constrained template-based skill demonstration accurately. Keep Atlas's goal handling, approval rules, ledger, and compensation as the project-specific contribution.

Avoid combining multiple full-stack agent platforms or copying another entrant's submission as the base. Prefer official libraries and small examples with clear attribution. No shortlisted component alone implements all of Atlas.

## Adoption checks

For every adopted item, record repository URL, release/commit, files copied, modifications, applicable license, and notices in THIRD_PARTY_NOTICES.md. Use dependencies rather than copying internals where practical. Check Node, Zod, and MCP SDK versions together. Run actual protocol and approval/undo integration tests; a README reference alone does not demonstrate runtime use.

The Antigravity handoff should reference this document and name exact chosen components after compatibility checks. This research does not revise or dispatch the Antigravity prompt yet.
