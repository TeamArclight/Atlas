# Official hackathon resources for Atlas

Reviewed October 13, 2026. Entry point: https://amazonappdev2026.devpost.com/resources/

## Alexa track resources

- MCP Apps and agent skills: https://apps.extensions.modelcontextprotocol.io/api/
- Transport specification linked by the event: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP Apps quickstart: https://apps.extensions.modelcontextprotocol.io/api/documents/Quickstart.html

The event explicitly permits an Alexa+ experience simulated in a web app. Its link labeled Build with Agent Skills resolves to the MCP Apps documentation; do not treat it as access to a private Alexa add-on toolkit.

Use the linked transport revision as the baseline. Verify real initialize, tools/list, and tools/call traffic. Support the required Accept headers, negotiated MCP-Protocol-Version, JSON and SSE responses, and prescribed errors. GET may return 405 when no standalone SSE stream is offered. Validate Origin headers and retain localhost binding for local development. Coordinate transport/auth changes in server/ with Codex.

The current MCP Apps overview describes v2 peers and Zod 4, while Atlas uses MCP SDK v1 and Zod 3. Choose an explicitly compatible ext-apps release and matching examples, or coordinate a complete SDK migration. Do not install latest ext-apps and copy main-branch APIs into the existing scaffold without checking peer dependencies. MCP Apps host support varies; the simulator must show what it actually implements.

The MCP Apps documentation offers create-mcp-app, add-app-to-server, convert-web-app, and migrate-oai-app skills. For Atlas, add-app-to-server or convert-web-app is the relevant optional workflow. These upstream skills are development aids, distinct from Atlas's runtime learned-tool feature. Read the selected skill before using it; installation is not assumed.

## Amazon documentation and sample discovery

- Amazon Devices Builder Tools: https://developer.amazon.com/docs/adbt/get-started
- Official sample organization: https://github.com/amazonappdev
- Developer documentation: https://developer.amazon.com/

Builder Tools provide device documentation and development guidance; they are not a replacement for the Atlas MCP runtime. Inspect supported surfaces and prerequisites before configuration. Fire TV sample applications on the resources page do not belong in Atlas's Alexa-only demo unless the user explicitly expands the track.

## AWS enhancement resources

- AWS Builder Center: https://builder.aws.com/
- Learning resources: https://builder.aws.com/learn

Use these for Bedrock, AgentCore, and Strands setup guidance and document any AWS services actually called. The resources page says hackathon credit-code requests closed on October 7 because codes ran out. Do not make the build depend on receiving a new event credit code; use existing account access or a clearly labeled local fallback.

## Submission evidence

Keep a factual log of SDK/API onboarding friction, observed failures, workarounds, and suggestions while building. This supports the required product feedback. Do not invent feedback or performance metrics. Confirm rules against https://amazonappdev2026.devpost.com/rules before submission.
