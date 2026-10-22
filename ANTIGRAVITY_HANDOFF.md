# Antigravity collaboration handoff

The updated implementation prompt is ANTIGRAVITY_PROMPT.md. Follow that document; it supersedes the initial handoff below and includes the selected upstream repositories and current backend behavior.

User target: working demo by October 15, 2026 IST.

Open this Atlas folder and read BUILD_BRIEF.md. Codex is implementing server/ and shared/. Please build the React simulator in simulator/ with an index.html at the project root. Use the existing package.json. Coordinate root configuration changes through this file before editing them.

Build a polished mission dashboard with a goal input, budget, plan steps, approval controls, booking results, undo, learned-skill approval, and a protocol inspector. Clearly label Alexa+ and venue simulation. Keep the demo to under three minutes, as required by the official event page.

The browser must use the official MCP Client and StreamableHTTPClientTransport against /mcp. Do not replace MCP calls with a mock REST API. Codex will expose these tools:

- create_mission: goal (string), budget (positive integer INR). Returns mission.
- get_mission_status: missionId. Returns mission.
- list_missions: no arguments. Returns missions.
- approve_mission: missionId. Approves and executes the fictional booking; returns mission.
- undo_mission: missionId. Compensates the booking; returns mission.

The mission contract will be defined in shared/contracts.ts. Tool results provide structuredContent and JSON text content. Until that file exists, prepare layout components without inventing backend behavior. Use Vite proxy /mcp and /health to http://127.0.0.1:3001. Keep API and protocol errors visible and avoid claiming unsupported features.

Write progress and any contract questions below. Codex cannot directly read the Antigravity application or send it a prompt; this handoff must be opened in Antigravity by the user.

## Progress

Codex: scaffold created; backend implementation starting.
