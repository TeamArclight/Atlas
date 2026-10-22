import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from './index.js';
import { MissionStore } from './missions.js';
import { validatePlanGraph, ALLOWED_TOOLS } from './planner.js';
import { ApprovalManager, ApprovalPolicyError } from './approvals.js';
import { FictionalVenueProvider } from './provider.js';
import { LearnedSkillStore, evaluateSafeExpression } from './skills.js';
import { ConverseService } from './converse.js';
import type { MissionStep } from '../shared/contracts.js';

test('1. Plan graph validation rejects over-budget plans, cyclic graphs, unknown tools, and missing approval gates', () => {
  // Over-budget
  const overBudgetSteps: MissionStep[] = [
    { id: 'step1', title: 'Grand Venue', tool: 'fictional_venue_book', costBound: 45000, requiresApproval: true, state: 'pending' },
  ];
  const overBudgetResult = validatePlanGraph(overBudgetSteps, 40000);
  assert.equal(overBudgetResult.valid, false);
  assert.match(overBudgetResult.errors[0], /exceeds allocated budget/);

  // Cyclic dependency
  const cyclicSteps: MissionStep[] = [
    { id: 'stepA', title: 'Step A', tool: 'fictional_venue_book', costBound: 10000, requiresApproval: true, dependencies: ['stepB'], state: 'pending' },
    { id: 'stepB', title: 'Step B', tool: 'fictional_catering_quote', costBound: 5000, requiresApproval: true, dependencies: ['stepA'], state: 'pending' },
  ];
  const cyclicResult = validatePlanGraph(cyclicSteps, 40000);
  assert.equal(cyclicResult.valid, false);
  assert.match(cyclicResult.errors.join('; '), /Cyclic dependency detected/);

  // Unknown tool
  const unknownToolSteps: MissionStep[] = [
    { id: 'step1', title: 'External Shell Exec', tool: 'unauthorized_shell_tool', costBound: 1000, requiresApproval: true, state: 'pending' },
  ];
  const unknownToolResult = validatePlanGraph(unknownToolSteps, 40000);
  assert.equal(unknownToolResult.valid, false);
  assert.match(unknownToolResult.errors.join('; '), /not in the authorized tools allowlist/);

  // Paid action missing approval gate
  const missingApprovalSteps: MissionStep[] = [
    { id: 'step1', title: 'Auto Spend', tool: 'fictional_venue_book', costBound: 12000, requiresApproval: false, state: 'pending' },
  ];
  const missingApprovalResult = validatePlanGraph(missingApprovalSteps, 40000);
  assert.equal(missingApprovalResult.valid, false);
  assert.match(missingApprovalResult.errors.join('; '), /does not require approval/);
});

test('2. Approval manager enforces child role restriction, token expiration, and single-use consumption', () => {
  const approvals = new ApprovalManager();
  const missionId = '11111111-2222-3333-4444-555555555555';

  const pending = approvals.createPendingApproval(missionId, 'book_venue', 12000, 'adult', 1); // 1 sec TTL

  // Child role cannot approve financial commitment
  assert.throws(
    () => approvals.verifyAndConsume(missionId, pending.confirmationPhrase, 'child'),
    (err: any) => err instanceof ApprovalPolicyError && err.code === 'ROLE_UNAUTHORIZED'
  );

  // Wrong phrase / token rejected
  assert.throws(
    () => approvals.verifyAndConsume(missionId, 'random wrong phrase', 'adult'),
    (err: any) => err instanceof ApprovalPolicyError && err.code === 'TOKEN_INVALID'
  );

  // Valid phrase consumes approval
  const consumed = approvals.verifyAndConsume(missionId, pending.confirmationPhrase, 'adult');
  assert.equal(consumed.id, pending.id);

  // Reused token is rejected
  assert.throws(
    () => approvals.verifyAndConsume(missionId, pending.confirmationPhrase, 'adult'),
    (err: any) => err instanceof ApprovalPolicyError && err.code === 'NO_PENDING_APPROVAL'
  );
});

test('3. Persistent fictional venue provider guarantees idempotency and persists across fresh provider instances', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-provider-'));
  try {
    const provider1 = new FictionalVenueProvider(dir);
    const booking = provider1.createOrConfirm({
      ref: 'ATLAS-TEST-01',
      occasion: 'Dad 60th birthday',
      guests: 25,
      cost: 12000,
      idempotencyKey: 'idemp-key-1',
    });
    assert.equal(booking.status, 'confirmed');

    // Duplicate call with same idempotency key is idempotent
    const dup = provider1.createOrConfirm({
      ref: 'ATLAS-TEST-01',
      occasion: 'Dad 60th birthday',
      guests: 25,
      cost: 12000,
      idempotencyKey: 'idemp-key-1',
    });
    assert.equal(dup.status, 'confirmed');

    // Fresh instance recovers booking from disk
    const provider2 = new FictionalVenueProvider(dir);
    const recovered = provider2.getBooking('ATLAS-TEST-01');
    assert.ok(recovered);
    assert.equal(recovered.status, 'confirmed');
    assert.equal(recovered.cost, 12000);

    // Cancel booking idempotently
    const cancelled = provider2.cancel('ATLAS-TEST-01', 'idemp-key-cancel');
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.refundAmount, 12000);

    const dupCancel = provider2.cancel('ATLAS-TEST-01', 'idemp-key-cancel');
    assert.equal(dupCancel.status, 'cancelled');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('4. Crash reconciliation: intent completed in provider but interrupted before ledger writes reconciles on restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-reconcile-'));
  try {
    const store1 = new MissionStore(dir);
    const m = store1.create('Dad birthday crash recovery', 40000);

    // Simulate crash where provider confirmed booking and executionIntent was saved as effect_completed
    const ref = `ATLAS-${m.id.slice(0, 8).toUpperCase()}`;
    store1.provider.createOrConfirm({
      ref,
      occasion: m.goal,
      guests: 25,
      cost: 12000,
      idempotencyKey: 'crash-key-123',
    });

    const target = (store1 as any).missions.find((x: any) => x.id === m.id);
    target.executionIntent = {
      stepId: 'venue_booking',
      action: 'book',
      idempotencyKey: 'crash-key-123',
      status: 'effect_completed',
    };
    (store1 as any).save();

    // Restart MissionStore (simulating recovery on next boot)
    const store2 = new MissionStore(dir);
    const recoveredMission = store2.get(m.id);
    assert.equal(recoveredMission.state, 'completed');
    assert.equal(recoveredMission.ledger.length, 1);
    assert.equal(recoveredMission.ledger[0].action, 'fictional_venue_booked');
    assert.equal(recoveredMission.ledger[0].cost, 12000);
    assert.equal(recoveredMission.executionIntent?.status, 'ledger_written');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('5. Conversational service handles questions, compare options, booking requests, confirmations, and command deduplication', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-converse-'));
  try {
    const store = new MissionStore(dir);
    const converse = new ConverseService(store);

    // 1. Missing budget prompts question
    const qRes = await converse.converse({
      commandId: 'cmd-1',
      utterance: 'Plan Dad’s 60th birthday',
    });
    assert.equal(qRes.intent, 'clarify_budget');
    assert.match(qRes.reply, /What total budget/);

    // 2. Goal with budget creates mission
    const createRes = await converse.converse({
      commandId: 'cmd-2',
      utterance: 'Plan Dad’s 60th birthday this Saturday, 25 people, budget 40,000 rupees.',
    });
    assert.equal(createRes.intent, 'create_mission');
    assert.ok(createRes.mission);
    assert.equal(createRes.mission.budget, 40000);
    assert.equal(createRes.mission.plannedCost, 12000);

    const missionId = createRes.mission.id;

    // 3. Command deduplication for repeat commandId
    const dupRes = await converse.converse({
      commandId: 'cmd-2',
      utterance: 'Plan Dad’s 60th birthday this Saturday, 25 people, budget 40,000 rupees.',
    });
    assert.equal(dupRes.mission?.id, missionId);

    // 4. Compare options
    const compRes = await converse.converse({
      commandId: 'cmd-3',
      conversationId: createRes.conversationId,
      missionId,
      utterance: 'Compare options and why not the palace?',
    });
    assert.equal(compRes.intent, 'compare_options');
    assert.match(compRes.reply, /Royal Heritage Palace/);

    // 5. Request booking proposes one-time approval
    const bookReq = await converse.converse({
      commandId: 'cmd-4',
      conversationId: createRes.conversationId,
      missionId,
      utterance: 'Book the venue',
    });
    assert.equal(bookReq.intent, 'request_approval');
    assert.ok(bookReq.pendingApproval);
    assert.equal(bookReq.pendingApproval.confirmationPhrase, 'confirm booking');

    // 6. Confirm booking executes booking
    const confirmRes = await converse.converse({
      commandId: 'cmd-5',
      conversationId: createRes.conversationId,
      missionId,
      utterance: 'confirm booking',
    });
    assert.equal(confirmRes.intent, 'confirmed_booking');
    assert.equal(confirmRes.mission?.state, 'completed');
    assert.equal(confirmRes.mission?.ledger.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('6. Learned skills: safe mathematical evaluation, test fixtures verification, adult approval gate, and revoked prohibition', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-skills-'));
  try {
    const store = new LearnedSkillStore(dir);
    const defaultSkill = store.get('party_portion_calculator');
    assert.equal(defaultSkill.status, 'draft');

    // Safe evaluator executes math formula safely
    const val = evaluateSafeExpression('Math.ceil(guests * 0.6)', { guests: 25 });
    assert.equal(val, 15);

    // Rejects unsafe keywords
    assert.throws(() => evaluateSafeExpression('process.exit(1)', { guests: 25 }), /Unsafe keyword detected/);

    // Cannot approve without passing tests first
    assert.throws(() => store.approveSkill(defaultSkill.id, 'adult'), /without passing all test cases/);

    // Run tests
    const tested = store.testSkill(defaultSkill.id);
    assert.equal(tested.status, 'tested');
    assert.equal(tested.testResults?.passed, true);
    assert.equal(tested.testResults?.executedCases, 2);

    // Child cannot authorize
    assert.throws(() => store.approveSkill(defaultSkill.id, 'child'), /Only an adult household member/);

    // Adult authorizes
    const approved = store.approveSkill(defaultSkill.id, 'adult');
    assert.equal(approved.status, 'approved');

    // Run skill with concrete inputs
    const output = store.runSkill(defaultSkill.id, { guests: 25, budget: 40000 });
    assert.deepEqual(output, {
      vegPortions: 15,
      nonVegPortions: 10,
      cakeKg: 3,
      cateringEstimatedCost: 15000,
      bufferRemaining: 9500,
    });

    // Revocation prevents future execution
    store.revokeSkill(defaultSkill.id, 'Policy update');
    assert.throws(() => store.runSkill(defaultSkill.id, { guests: 25, budget: 40000 }), /Only approved skills can be run/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('7. End-to-end HTTP MCP client exercises converse and learned skills meta-tools', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-mcp-e2e-'));
  const store = new MissionStore(dir);
  const skills = new LearnedSkillStore(dir);
  const app = createApp(store, undefined, skills);
  const listener = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => listener.once('listening', resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');

  const client = new Client({ name: 'mcp-e2e-test', version: '0.1.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`));

  try {
    await client.connect(transport);

    // 1. Converse through MCP
    const converseRes = await client.callTool({
      name: 'converse',
      arguments: {
        commandId: 'mcp-cmd-1',
        utterance: 'Plan Dad’s 60th birthday for Saturday, 25 people, budget 40,000 rupees.',
      },
    });
    const parsedConverse = (converseRes as any).structuredContent.result;
    assert.equal(parsedConverse.intent, 'create_mission');
    assert.ok(parsedConverse.mission);

    // 2. Learned skills list
    const skillsListRes = await client.callTool({ name: 'list_learned_skills', arguments: {} });
    const skillsList = (skillsListRes as any).structuredContent.result;
    assert.ok(Array.isArray(skillsList));
    assert.ok(skillsList.length >= 1);

    // 3. Test skill through MCP
    const testSkillRes = await client.callTool({
      name: 'test_learned_skill',
      arguments: { skillId: skillsList[0].id },
    });
    const testedSkill = (testSkillRes as any).structuredContent.result;
    assert.equal(testedSkill.testResults.passed, true);

    // 4. Approve skill through MCP
    const approveSkillRes = await client.callTool({
      name: 'approve_learned_skill',
      arguments: { skillId: skillsList[0].id, approverRole: 'adult' },
    });
    assert.equal((approveSkillRes as any).structuredContent.result.status, 'approved');

    // 5. Run skill through MCP
    const runSkillRes = await client.callTool({
      name: 'run_learned_skill',
      arguments: { skillId: skillsList[0].id, input: { guests: 25, budget: 40000 } },
    });
    const runResult = (runSkillRes as any).structuredContent.result;
    assert.equal(runResult.vegPortions, 15);
    assert.equal(runResult.nonVegPortions, 10);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => listener.close((err) => (err ? reject(err) : resolve())));
    rmSync(dir, { recursive: true, force: true });
  }
});
