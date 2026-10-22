import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from './missions.js';

test('approval, retry, persistence, and compensation preserve one booking', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-test-'));
  try {
    const store = new MissionStore(directory);
    const m = store.create('Plan Dad birthday', 40000);
    assert.equal(m.state, 'awaiting_approval');
    assert.equal(m.ledger.length, 0);
    assert.throws(() => store.undo(m.id));
    store.approve(m.id); store.approve(m.id);
    const recovered = new MissionStore(directory);
    assert.equal(recovered.get(m.id).ledger.length, 1);
    recovered.undo(m.id); recovered.undo(m.id);
    const final = recovered.get(m.id);
    assert.equal(final.state, 'undone');
    assert.equal(final.ledger.length, 2);
    assert.equal(final.ledger.reduce((total, entry) => total + entry.cost, 0), 0);
    assert.equal(final.ledger[1].previousHash, final.ledger[0].hash);
    assert.throws(() => recovered.approve(m.id));
    assert.throws(() => recovered.create('Unsafe budget', 100));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
