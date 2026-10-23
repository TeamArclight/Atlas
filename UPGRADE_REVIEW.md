# Four upgrade review

Independent review of the current local changes on October 23, 2026. The existing 36 tests and production build passed. These checks do not establish full implementation of every requested feature.

## Implemented

Gemini intent interpretation, revision UI/version history, structured preferences, an AST math evaluator, and recomputed ledger verification are present. Changes remain local and have not been pushed.

## Critical correction made during review

Conversational confirmation previously accepted a confirmation phrase from the model's extractedParameters instead of requiring it in the original utterance. A model could turn a user's refusal into a matching confirmation. The dispatcher now checks the actual utterance and a regression test covers malicious model classification. A model may interpret a request but cannot supply user consent.

## Remaining gaps

1. server/missions.ts approve still writes only a Garden Hall venue booking. It then marks pending companion steps complete. Catering/cake inventory exists but no actual multi-service executor dispatches those bookings. Undo cancels one provider reference and marks step states undone; this is not reverse dependency compensation of independent services.
2. Tokenless legacy paths remain. MissionStore.approve can invalidate a pending approval and execute when options are omitted. ApprovalManager verifies provided tokens only conditionally. MCP approve/undo schemas allow omitted token fields. Equivalent approval enforcement across direct calls, UI and voice is incomplete.
3. Crash recovery still scans a single effect_completed executionIntent. It does not reconcile a provider effect when the persisted intent remains started, and keys are regenerated at execution. Tests manually create effect_completed records rather than covering every crash window.
4. Status during work, provider price-change approval, concurrent revisions versus execution, inventory failure compensation, and a three-service live voice journey need further evidence.
5. The Word report was created before these changes and is now partly outdated. Regenerate it after stabilization, not before the final behavior is settled.

## Required next verification

Require distinct venue/catering/cake provider records and ledger entries; assert actual booked amounts, reverse cancellation order and partial refunds. Test missing/stale/wrong-action/incorrect-amount tokens before any browser effect. Fault-inject between provider effect and intent/ledger saves and retry with the same key. Exercise the live Gemini revision plus full execution/undo path separately from fixture tests.

Do not publish a claim that all four upgrades are complete while these gaps remain.
