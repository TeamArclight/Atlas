import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.js';
import { MissionStore } from './missions.js';
import { VenueBrowserWorker } from './browser.js';

test('Playwright fills, books, captures actual accessibility evidence, and cancels fictional venue', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-browser-'));
  const store = new MissionStore(directory);
  const listener = createApp(store).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => listener.once('listening', resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const worker = new VenueBrowserWorker(`http://127.0.0.1:${address.port}/demo/venue`);
    const mission = store.create('Birthday browser test', 40000);
    const booking = await worker.execute(mission, 'book');
    assert.equal(booking.status, 'captured_snapshot');
    assert.match(booking.snapshot ?? '', /Reservation Confirmed/);
    assert.match(booking.snapshot ?? '', /Birthday browser test/);
    const cancellation = await worker.execute(mission, 'cancel');
    assert.match(cancellation.snapshot ?? '', /Reservation Cancelled/);
    assert.throws(() => new VenueBrowserWorker('https://real-venue.example/book'));
  } finally {
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
