# Gemini setup

1. Create a Gemini API key in Google AI Studio: https://aistudio.google.com/apikey
2. Copy .env.example to .env in this Atlas folder. Set PLANNER_MODE=gemini, GEMINI_API_KEY to your private key, and GEMINI_MODEL to a generateContent model ID available to your account. Use the model ID, not its display label.
3. Restart npm run dev:server. The entry point loads .env using Node's built-in loader; use Node 22+.
4. Check /health: planner should be gemini and model should match your configuration. Create a mission to verify actual inference. Missing keys, quotas, invalid plans, or inaccessible models produce errors; there is no silent switch to fixtures.

Keep the key in .env, which is ignored. Do not paste keys into chat or use a VITE_ variable. Gemini runs on the backend. Voice, browser actions, ledger, and approval controls retain their MCP interfaces.

Gemini proposes a validated plan for the currently supported fictional inventory. It does not create arbitrary tools or operate unimplemented services. The existing conversational intent handler remains bounded; adding a model planner alone does not make voice understanding unrestricted.

Tests mock Gemini responses. A live inference run requires your local key and model configuration. API documentation: https://ai.google.dev/api/generate-content
