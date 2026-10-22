import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from './missions.js';
import { ConverseService } from './converse.js';
import { VenueBrowserWorker } from './browser.js';
import { createApp } from './index.js';

test('Complete Voice Mission E2E: plan -> status -> compare options -> book -> confirm -> undo -> confirm compensation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-voice-e2e-'));
  const store = new MissionStore(dir);
  const app = createApp(store);
  const listener = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => listener.once('listening', resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');

  const worker = new VenueBrowserWorker(`http://127.0.0.1:${address.port}/demo/venue`);
  const converse = new ConverseService(store);

  try {
    // Turn 1: User speaks: "Alexa, plan Dad's 60th birthday this Saturday, 25 people, budget 40,000 rupees."
    const turn1 = await converse.converse({
      commandId: 'cmd-turn-1',
      utterance: "Alexa, plan Dad's 60th birthday this Saturday, 25 people, budget 40,000 rupees.",
    });
    assert.equal(turn1.intent, 'create_mission');
    assert.ok(turn1.mission);
    assert.equal(turn1.mission.budget, 40000);
    assert.equal(turn1.mission.plannedCost, 12000);
    assert.match(turn1.reply, /Garden Hall/);
    const missionId = turn1.mission.id;
    const conversationId = turn1.conversationId;

    // Turn 2: User asks for status: "What's the status?"
    const turn2 = await converse.converse({
      commandId: 'cmd-turn-2',
      conversationId,
      missionId,
      utterance: "What's the status?",
    });
    assert.equal(turn2.intent, 'status');
    assert.match(turn2.reply, /awaiting approval/i);

    // Turn 3: User asks to compare options: "Why did you choose Garden Hall and why not the palace?"
    const turn3 = await converse.converse({
      commandId: 'cmd-turn-3',
      conversationId,
      missionId,
      utterance: 'Why did you choose Garden Hall and why not the palace?',
    });
    assert.equal(turn3.intent, 'compare_options');
    assert.match(turn3.reply, /Royal Heritage Palace/);
    assert.match(turn3.reply, /rejected/);

    // Turn 4: User requests booking: "Book the venue"
    const turn4 = await converse.converse({
      commandId: 'cmd-turn-4',
      conversationId,
      missionId,
      utterance: 'Book the venue',
    });
    assert.equal(turn4.intent, 'request_approval');
    assert.ok(turn4.pendingApproval);
    assert.equal(turn4.pendingApproval.amount, 12000);
    assert.equal(turn4.pendingApproval.confirmationPhrase, 'confirm booking');

    // Turn 5: User says generic "yes" -> Must be rejected as unknown or incomplete confirmation
    const turn5 = await converse.converse({
      commandId: 'cmd-turn-5',
      conversationId,
      missionId,
      utterance: 'yes',
    });
    assert.equal(turn5.intent, 'unknown');
    // Mission is STILL awaiting approval
    assert.equal(store.get(missionId).state, 'awaiting_approval');

    // Turn 6: User says exact confirmation: "Confirm booking"
    // Also run browser worker to emulate actual browser execution
    await worker.execute(store.get(missionId), 'book');
    const turn6 = await converse.converse({
      commandId: 'cmd-turn-6',
      conversationId,
      missionId,
      utterance: 'Confirm booking',
    });
    assert.equal(turn6.intent, 'confirmed_booking');
    assert.equal(turn6.mission?.state, 'completed');
    assert.equal(turn6.mission?.ledger.length, 1);
    assert.equal(turn6.mission?.ledger[0].action, 'fictional_venue_booked');
    assert.equal(turn6.mission?.ledger[0].cost, 12000);

    // Verify persistent booking exists in provider
    const ref = `ATLAS-${missionId.slice(0, 8).toUpperCase()}`;
    const persistentBooking = store.provider.getBooking(ref);
    assert.ok(persistentBooking);
    assert.equal(persistentBooking.status, 'confirmed');

    // Turn 7: User requests undo: "Undo the booking"
    const turn7 = await converse.converse({
      commandId: 'cmd-turn-7',
      conversationId,
      missionId,
      utterance: 'Undo the booking',
    });
    assert.equal(turn7.intent, 'request_undo');
    assert.ok(turn7.pendingApproval);
    assert.equal(turn7.pendingApproval.confirmationPhrase, 'confirm cancellation');

    // Turn 8: User confirms cancellation: "Confirm cancellation"
    await worker.execute(store.get(missionId), 'cancel');
    const turn8 = await converse.converse({
      commandId: 'cmd-turn-8',
      conversationId,
      missionId,
      utterance: 'Confirm cancellation',
    });
    assert.equal(turn8.intent, 'confirmed_undo');
    assert.equal(turn8.mission?.state, 'undone');
    assert.equal(turn8.mission?.ledger.length, 2);
    assert.equal(turn8.mission?.ledger[1].action, 'fictional_venue_cancelled');
    assert.equal(turn8.mission?.ledger[1].cost, -12000);

    // Net balance is INR 0
    const netCost = turn8.mission.ledger.reduce((sum, item) => sum + item.cost, 0);
    assert.equal(netCost, 0);

    // Persistent provider has cancelled status and refund amount
    const cancelledBooking = store.provider.getBooking(ref);
    assert.equal(cancelledBooking?.status, 'cancelled');
    assert.equal(cancelledBooking?.refundAmount, 12000);
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((err) => (err ? reject(err) : resolve())));
    rmSync(dir, { recursive: true, force: true });
  }
});
