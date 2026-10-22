import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceCommand } from './voice/commands.js';

test('voice commands distinguish goals, status, undo, and contextual confirmations', () => {
  assert.deepEqual(parseVoiceCommand('Alexa, plan Dad birthday, budget INR 40,000'), { kind: 'create', goal: 'plan Dad birthday, budget INR 40,000', budget: 40000 });
  assert.equal((parseVoiceCommand('Plan a party under 40k') as { budget: number }).budget, 40000);
  assert.equal(parseVoiceCommand('Atlas, where are we on the party?').kind, 'status');
  assert.equal(parseVoiceCommand('Undo the booking').kind, 'undo');
  assert.equal(parseVoiceCommand('yes').kind, 'unknown');
  assert.deepEqual(parseVoiceCommand('Confirm booking'), { kind: 'confirm', operation: 'approve' });
  assert.equal(parseVoiceCommand('plan a party').kind, 'create');
});
