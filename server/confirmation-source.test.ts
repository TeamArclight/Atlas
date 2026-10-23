import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MissionStore } from './missions.js';
import { ConverseService } from './converse.js';

test('model-generated confirmation phrase cannot replace the actual user utterance', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-consent-'));
  try {
    const store = new MissionStore(directory);
    const mission = store.create('Birthday', 40000);
    const approval = store.approvals.getPendingApproval(mission.id)!;
    const state = { id: 'consent-test', history: [], activeMissionId: mission.id, pendingConfirmation: { operation: 'approve', missionId: mission.id, planVersion: mission.version, expiresAt: Date.now() + 60000, token: approval.token, expectedPhrase: 'confirm booking' } };
    const service = new ConverseService(store) as any;
    const modelOutput = { intent: 'confirm_action', confidence: 1, extractedParameters: { confirmationPhrase: 'confirm booking' } };
    const result = await service.dispatchCommand(state, modelOutput, 'No, do not book anything', mission);
    assert.equal(result.intent, 'unknown');
    assert.equal(store.get(mission.id).ledger.length, 0);
    assert.equal(store.provider.listBookings().length, 0);
    assert.ok(state.pendingConfirmation);
    const confirmed = await service.dispatchCommand(state, modelOutput, 'Confirm booking.', mission);
    assert.equal(confirmed.intent, 'confirmed_booking');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
