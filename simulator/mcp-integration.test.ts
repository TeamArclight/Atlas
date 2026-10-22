import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from '../server/missions.js';

test('1. Malformed input validation rejects invalid budgets and empty goals', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-input-test-'));
  try {
    const store = new MissionStore(dir);

    // Budget below minimum INR 12,000
    assert.throws(
      () => store.create("Plan Dad's 60th birthday", 8000),
      /budget of at least INR 12,000/
    );

    // Empty goal
    assert.throws(
      () => store.create('   ', 40000),
      /Enter a goal and a budget/
    );

    // Negative or float budget
    assert.throws(
      () => store.create("Plan Dad's 60th birthday", -500),
      /budget of at least INR 12,000/
    );
    assert.throws(
      () => store.create("Plan Dad's 60th birthday", 40000.5),
      /budget of at least INR 12,000/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('2. Missing or invalid mission ID throws not found error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-notfound-test-'));
  try {
    const store = new MissionStore(dir);
    assert.throws(() => store.get('non-existent-uuid'), /Mission not found/);
    assert.throws(() => store.approve('non-existent-uuid'), /Mission not found/);
    assert.throws(() => store.undo('non-existent-uuid'), /Mission not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('3. Repeated approval is idempotent and prevents duplicate booking entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-idempotent-test-'));
  try {
    const store = new MissionStore(dir);
    const m = store.create("Plan Dad's 60th birthday for Saturday, 25 people, budget INR 40,000.", 40000);
    assert.equal(m.state, 'awaiting_approval');
    assert.equal(m.ledger.length, 0);

    // First approval
    const approved1 = store.approve(m.id);
    assert.equal(approved1.state, 'completed');
    assert.equal(approved1.ledger.length, 1);
    assert.equal(approved1.ledger[0].action, 'fictional_venue_booked');
    assert.equal(approved1.ledger[0].cost, 12000);

    // Repeated approval (simulating rapid user double-click or network retry)
    const approved2 = store.approve(m.id);
    assert.equal(approved2.state, 'completed');
    assert.equal(approved2.ledger.length, 1); // Ledger NOT duplicated
    assert.equal(approved2.ledger[0].hash, approved1.ledger[0].hash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('4. Full lifecycle create -> approve -> undo -> reload recovery preserves ledger hash chain', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-lifecycle-test-'));
  try {
    const store = new MissionStore(dir);
    const m = store.create("Plan Dad's 60th birthday for Saturday, 25 people, budget INR 40,000.", 40000);

    // Undo before approval should fail
    assert.throws(() => store.undo(m.id), /Only completed bookings can be undone/);

    // Approve booking
    store.approve(m.id);

    // Reload recovery: simulate page refresh / new server instance reading stored data
    const recoveredStore = new MissionStore(dir);
    const recoveredMission = recoveredStore.get(m.id);
    assert.equal(recoveredMission.state, 'completed');
    assert.equal(recoveredMission.ledger.length, 1);
    assert.equal(recoveredMission.ledger[0].previousHash, 'GENESIS');

    // Compensate / undo booking
    const undone = recoveredStore.undo(m.id);
    assert.equal(undone.state, 'undone');
    assert.equal(undone.ledger.length, 2);
    assert.equal(undone.ledger[1].action, 'fictional_venue_cancelled');
    assert.equal(undone.ledger[1].cost, -12000);

    // Verify hash linkage
    assert.equal(undone.ledger[1].previousHash, undone.ledger[0].hash);

    // Net financial balance is 0
    const netCost = undone.ledger.reduce((sum, item) => sum + item.cost, 0);
    assert.equal(netCost, 0);

    // Repeated undo is idempotent
    const undoneRepeat = recoveredStore.undo(m.id);
    assert.equal(undoneRepeat.ledger.length, 2);

    // Cannot approve an undone mission
    assert.throws(() => recoveredStore.approve(m.id), /cannot be approved in its current state/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
