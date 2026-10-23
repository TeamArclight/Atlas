import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from './index.js';
import { MissionStore } from './missions.js';
import type { Mission } from '../shared/contracts.js';

test('real MCP HTTP client initializes, validates origins, and completes approval/undo', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-protocol-'));
  const listener = createApp(new MissionStore(directory)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => listener.once('listening', resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const client = new Client({ name: 'atlas-test-client', version: '1.0.0' });
  try {
    const blocked = await fetch(url, { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(blocked.status, 403);
    await client.connect(new StreamableHTTPClientTransport(url));
    assert.equal(client.getServerVersion()?.name, 'atlas');
    const tools = await client.listTools();
    assert.ok(tools.tools.some(tool => tool.name === 'approve_mission'));
    const created = await client.callTool({ name: 'create_mission', arguments: { goal: 'Birthday for Dad', budget: 40000 } });
    const m = (created.structuredContent as { result: Mission }).result;
    assert.equal(m.state, 'awaiting_approval');
    const premature = await client.callTool({ name: 'undo_mission', arguments: { missionId: m.id, tokenOrPhrase: 'confirm cancellation' } });
    assert.equal(premature.isError, true);
    for (let i = 0; i < 2; i++) {
      const approved = await client.callTool({ name: 'approve_mission', arguments: { missionId: m.id, tokenOrPhrase: m.pendingApproval?.token } });
      assert.equal((approved.structuredContent as { result: Mission }).result.ledger.length, 1);
    }
    const undone = await client.callTool({ name: 'undo_mission', arguments: { missionId: m.id, tokenOrPhrase: 'confirm cancellation' } });
    assert.equal((undone.structuredContent as { result: Mission }).result.state, 'undone');
    const invalid = await client.callTool({ name: 'approve_mission', arguments: { missionId: 'bad-id', tokenOrPhrase: 'dummy' } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
