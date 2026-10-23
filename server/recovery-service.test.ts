import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MissionStore } from './missions.js';

test('started catering intent cannot recover using a different venue booking', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-service-recovery-'));
  try {
    const store = new MissionStore(directory);
    const mission = store.create('Party', 50000, { guests: 25, services: ['venue', 'catering', 'cake'] });
    const ref = `ATLAS-${mission.id.slice(0, 8).toUpperCase()}`;
    store.provider.createOrConfirm({ ref, occasion: mission.goal, guests: 25, cost: 12000, idempotencyKey: 'venue-only-key', serviceType: 'venue', itemKey: 'garden_hall' });
    const record = (store as any).missions.find((m: any) => m.id === mission.id);
    const catering = record.steps.find((s: any) => s.tool === 'fictional_catering_order');
    assert.ok(catering);
    record.state = 'executing';
    record.executionIntent = { stepId: catering.id, action: 'book', idempotencyKey: `idem-${mission.id}-v${mission.version}-${catering.id}`, status: 'started' };
    (store as any).save();
    const recovered = new MissionStore(directory).get(mission.id);
    assert.equal(recovered.state, 'awaiting_approval');
    assert.equal(recovered.steps.find(s => s.id === catering.id)?.state, 'pending');
    assert.equal(recovered.ledger.length, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
