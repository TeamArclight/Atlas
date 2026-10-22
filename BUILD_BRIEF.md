# Atlas hackathon build brief

## Objective

Build Atlas for the Amazon Developer Hackathon Alexa+ track: a working remote MCP server with a simulator that demonstrates a household mission from planning through approval, execution, and undo.

Source requirements: C:/Users/user/Downloads/Atlas_Project_Summary.docx. Treat the document as a proposed product specification; its technical claims require verification against official documentation.

## Shared workspace

Codex and Antigravity should open this same Atlas directory. Coordination is through reviewed files and explicit ownership. Direct communication with Antigravity has not been established. Do not assume that either agent has received messages from the other.

Proposed ownership, pending coordination:

- Codex: MCP server, mission state, policy checks, action ledger, compensation, integration tests.
- Antigravity: simulator UI, mission dashboard, protocol inspector, fictional venue site.
- Shared contracts must be agreed before simultaneous implementation. Avoid editing the other agent's files without coordinating.

## First working demo

Use one mission: plan Dad's birthday for 25 people with a INR 40,000 budget.

1. A real simulator client connects to the MCP server using Streamable HTTP.
2. The user creates a mission and sees its plan and budget.
3. Atlas requests approval before committing a fictional venue booking.
4. A browser worker completes the booking on the fictional site.
5. The ledger records the booking and its compensation.
6. The user requests undo and sees the booking cancelled.
7. A constrained learned skill is tested and approved before use.

Every simulated service and model fallback must be labeled. Do not present scripted planning as Bedrock inference, template selection as arbitrary code generation, or basic budget checks as formal proof.

## Implementation direction

- TypeScript with the official MCP SDK; verify supported protocol versions and transport APIs before implementation.
- React and Vite for the simulator and dashboard.
- Persist mission and ledger state locally for the first demo; add AWS integration after the core flow works.
- Use stable learned-skill meta-tools rather than mutating the public tool list for Alexa compatibility.
- Model approval, execution, cancellation, failure, and compensation as explicit states.
- Use idempotency keys for actions and compensation.
- Keep optional AWS configuration outside source control; never commit credentials.
- Test approval enforcement, restart recovery, duplicate requests, and undo failures.

## Scope after the first demo

Add Bedrock planning, richer household permissions, rehearsal mode, budget verification, replay, and repeatable evaluation. Phone calls, multi-household coordination, voice identity, arbitrary generated-code sandboxes, and formal verification are stretch work until the core demo is complete.

## Verified hackathon references

- Official resources reviewed: https://amazonappdev2026.devpost.com/resources/ — see OFFICIAL_RESOURCES.md for implementation guidance, SDK compatibility, and AWS setup references.

- Official rules: https://amazonappdev2026.devpost.com/rules
- FAQ: https://amazonappdev2026.devpost.com/details/faqs
- Track requires a working Agent Skill or MCP server implementing at least MCP 2025-11-25; verify the full current submission requirements before delivery.
- FAQ states Alexa+ preview developer tools are unavailable to hackathon participants. Use the simulated-experience path unless the team already has access.
- Published deadline: October 23, 2026 at noon PDT, equivalent to October 24 at 00:30 IST. Confirm the user's intended event.

## Pending information

Antigravity installation and shared-folder access; confirmation of the event; AWS access and credits; existing teammates and work; final submission constraints.
