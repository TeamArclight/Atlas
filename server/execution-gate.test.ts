import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from './index.js';
import { MissionStore } from './missions.js';
import { VenueBrowserWorker } from './browser.js';
import type { Mission, ConverseOutput } from '../shared/contracts.js';

test('approval checks precede browser effects and conversational confirmation uses worker', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-gate-'));
  const store = new MissionStore(directory);
  let calls = 0;
  const worker = new VenueBrowserWorker();
  worker.execute = async () => { calls++; return { status: 'captured_snapshot', targetUrl: 'http://127.0.0.1:3001/demo/venue', lastAction: 'test worker' }; };
  const listener = createApp(store, worker).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => listener.once('listening', resolve));
  const address = listener.address(); assert.ok(address && typeof address !== 'string');
  const client = new Client({ name: 'gate-test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
    const created = await client.callTool({ name: 'create_mission', arguments: { goal: 'Birthday test', budget: 40000 } });
    const mission = (created.structuredContent as { result: Mission }).result;
    const rejected = await client.callTool({ name: 'approve_mission', arguments: { missionId: mission.id, role: 'child' } });
    assert.equal(rejected.isError, true); assert.equal(calls, 0);
    const negation = await client.callTool({ name: 'approve_mission', arguments: { missionId: mission.id, tokenOrPhrase: 'do not confirm booking' } });
    assert.equal(negation.isError, true); assert.equal(calls, 0);
    const request = await client.callTool({ name: 'converse', arguments: { utterance: 'book it', missionId: mission.id, commandId: randomUUID() } });
    const conversation = (request.structuredContent as { result: ConverseOutput }).result;
    const confirmation = await client.callTool({ name: 'converse', arguments: { conversationId: conversation.conversationId, missionId: mission.id, utterance: 'confirm booking', commandId: randomUUID() } });
    assert.equal((confirmation.structuredContent as { result: ConverseOutput }).result.mission?.state, 'completed');
    assert.equal(calls, 1);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
