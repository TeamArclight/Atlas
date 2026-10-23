import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from './missions.js';
import { MissionPlanner } from './planner.js';
import { ConverseService } from './converse.js';
import { LearnedSkillStore, evaluateSafeExpression, SkillExecutionError } from './skills.js';
import { canonicalJsonStringify, computeCanonicalV2Hash, verifyLedger } from './ledger.js';
import { ApprovalManager, ApprovalPolicyError } from './approvals.js';
import { FictionalVenueProvider } from './provider.js';
import type { LedgerEntry } from '../shared/contracts.js';

test('1. Gemini-powered conversation: follow-ups, option explanation, status query, and cancellation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-converse-v2-'));
  try {
    const planner = new MissionPlanner();
    (planner as any).mode = 'fixture';
    const store = new MissionStore(dir, planner);
    const converse = new ConverseService(store);

    // Initial mission formulation
    const m1 = await converse.converse({
      commandId: 'cmd-1',
      utterance: 'Plan Dad’s 60th birthday with a budget of 40,000 rupees for 25 people',
    });
    assert.equal(m1.intent, 'create_mission');
    assert.ok(m1.mission);
    assert.equal(m1.mission.version, 1);
    assert.equal(m1.mission.preferences?.guests, 25);
    const missionId = m1.mission.id;

    // Follow-up 1: "only vegetarian food"
    const mVeg = await converse.converse({
      commandId: 'cmd-2',
      conversationId: m1.conversationId,
      missionId,
      utterance: 'only vegetarian food',
    });
    assert.equal(mVeg.intent, 'revise_plan');
    assert.ok(mVeg.mission);
    assert.equal(mVeg.mission.version, 2);
    assert.equal(mVeg.mission.preferences?.dietaryPreferences, 'vegetarian');
    assert.match(mVeg.reply, /version 2/);
    assert.match(mVeg.reply, /vegetarian/i);

    // Follow-up 2: "change it to 30 guests"
    const mGuests = await converse.converse({
      commandId: 'cmd-3',
      conversationId: m1.conversationId,
      missionId,
      utterance: 'change it to 30 guests',
    });
    assert.equal(mGuests.intent, 'revise_plan');
    assert.ok(mGuests.mission);
    assert.equal(mGuests.mission.version, 3);
    assert.equal(mGuests.mission.preferences?.guests, 30);
    assert.match(mGuests.reply, /version 3/);

    // Follow-up 3: "what have you booked?"
    const mBooked = await converse.converse({
      commandId: 'cmd-4',
      conversationId: m1.conversationId,
      missionId,
      utterance: 'what have you booked?',
    });
    assert.equal(mBooked.intent, 'status');
    assert.match(mBooked.reply, /No services have been committed yet/i);

    // Follow-up 4: "why did you pick Garden Hall?" (explain decision / compare options)
    const mExplain = await converse.converse({
      commandId: 'cmd-5',
      conversationId: m1.conversationId,
      missionId,
      utterance: 'why did you pick Garden Hall?',
    });
    assert.equal(mExplain.intent, 'compare_options');
    assert.match(mExplain.reply, /Royal Heritage Palace/);
    assert.match(mExplain.reply, /Garden Hall/);

    // Request booking approval proposes confirmation token
    const mReq = await converse.converse({
      commandId: 'cmd-6',
      conversationId: m1.conversationId,
      missionId,
      utterance: 'book it',
    });
    assert.equal(mReq.intent, 'request_approval');
    assert.ok(mReq.pendingApproval);
    assert.equal(mReq.pendingApproval.confirmationPhrase, 'confirm booking');

    // Cancel pending confirmation
    const mCancelConf = await converse.converse({
      commandId: 'cmd-7',
      conversationId: m1.conversationId,
      missionId,
      utterance: 'cancel',
    });
    assert.equal(mCancelConf.intent, 'cancel');
    assert.match(mCancelConf.reply, /Cancelled the pending confirmation/);

    // Try confirming after cancellation -> fails cleanly
    const mConfFail = await converse.converse({
      commandId: 'cmd-8',
      conversationId: m1.conversationId,
      missionId,
      utterance: 'confirm booking',
    });
    assert.equal(mConfFail.intent, 'no_active_confirmation');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('2. Editable and versioned plans: preference revisions invalidate stale approval tokens and protect committed bookings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-plans-v2-'));
  try {
    const store = new MissionStore(dir);
    const m = store.create('Retirement party for Mom', 40000, { guests: 20, dietaryPreferences: 'regular' });
    assert.equal(m.version, 1);
    const initialApproval = store.approvals.getPendingApproval(m.id);
    assert.ok(initialApproval);
    assert.equal(initialApproval.planVersion, 1);

    // Revising plan bumps version and creates PlanRevision record
    const { mission: rev1, revisionSummary } = await store.revisePlan(m.id, {
      guests: 30,
      dietaryPreferences: 'vegetarian',
      budget: 45000,
    });
    assert.equal(rev1.version, 2);
    assert.equal(rev1.revisions?.length, 1);
    assert.equal(rev1.revisions?.[0].version, 2);
    assert.match(revisionSummary, /Guests: 20 -> 30/);
    assert.match(revisionSummary, /Budget: INR 40,000 -> INR 45,000/);

    // Stale token from plan v1 MUST be rejected on v2
    assert.throws(
      () =>
        store.approve(m.id, {
          tokenOrPhrase: initialApproval.token,
          expectedPlanVersion: 1,
        }),
      (err: any) => err instanceof ApprovalPolicyError && err.code === 'VERSION_MISMATCH'
    );

    // Active token bound to plan v2 succeeds
    const v2Approval = store.approvals.getPendingApproval(m.id);
    assert.ok(v2Approval);
    assert.equal(v2Approval.planVersion, 2);

    const approved = store.approve(m.id, {
      tokenOrPhrase: v2Approval.token,
      expectedPlanVersion: 2,
    });
    assert.equal(approved.state, 'completed');

    // Attempting to revise an already completed booking is strictly rejected
    await assert.rejects(
      async () => store.revisePlan(m.id, { guests: 35 }),
      /Cannot silently revise an already completed mission/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('3. Multi-step execution & compensation: inventory, crash reconciliation, and reverse dependency undo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-multi-step-'));
  try {
    const provider = new FictionalVenueProvider(dir);

    // 1. Verify selectable inventory
    const venue = provider.getInventoryItem('venue', 'garden_hall');
    assert.equal(venue?.basePrice, 12000);
    const catering = provider.getInventoryItem('catering', 'gourmet_buffet');
    assert.equal(catering?.pricePerGuest, 600);
    const vegFeast = provider.getInventoryItem('catering', 'veg_feast');
    assert.equal(vegFeast?.pricePerGuest, 480);
    const cake = provider.getInventoryItem('cake', 'milestone_truffle_3kg');
    assert.equal(cake?.basePrice, 3500);

    const store = new MissionStore(dir, undefined, undefined, provider);

    // 2. Multi-service planning: venue + catering + cake
    const m = store.create('Grand Milestone Gala', 45000, {
      guests: 25,
      services: ['venue', 'catering', 'cake'],
    });
    assert.equal(m.plannedCost, 30500); // 12000 + 15000 + 3500
    assert.equal(m.steps.length, 3);
    assert.deepEqual(m.steps[0].dependencies, []);
    assert.deepEqual(m.steps[1].dependencies, ['venue_booking']);
    assert.deepEqual(m.steps[2].dependencies, ['catering_booking']);

    const approval = store.approvals.getPendingApproval(m.id);
    assert.ok(approval);

    // 3. Approval token enforcement: missing, stale, wrong-action, amount-mismatch, child role
    assert.throws(
      () => store.approve(m.id),
      (err: any) => err instanceof ApprovalPolicyError && err.code === 'TOKEN_INVALID'
    );
    assert.throws(
      () => store.approve(m.id, { tokenOrPhrase: 'wrong-token' }),
      (err: any) => err instanceof ApprovalPolicyError && err.code === 'TOKEN_INVALID'
    );
    assert.throws(
      () => store.approve(m.id, { tokenOrPhrase: approval.token, expectedPlanVersion: 99 }),
      (err: any) => err instanceof ApprovalPolicyError && err.code === 'VERSION_MISMATCH'
    );
    assert.throws(
      () => store.approve(m.id, { tokenOrPhrase: approval.token, expectedAction: 'wrong_action' }),
      (err: any) => err instanceof ApprovalPolicyError && err.code === 'ACTION_MISMATCH'
    );
    assert.throws(
      () => store.approve(m.id, { tokenOrPhrase: approval.token, expectedAmount: 1000 }),
      (err: any) => err instanceof ApprovalPolicyError && err.code === 'ACTION_MISMATCH'
    );
    assert.throws(
      () => store.approve(m.id, { tokenOrPhrase: approval.token, role: 'child' }),
      (err: any) => err instanceof ApprovalPolicyError && err.code === 'ROLE_UNAUTHORIZED'
    );

    // 4. Multi-service execution with valid approval token
    const approved = store.approve(m.id, {
      tokenOrPhrase: approval.token,
      role: 'adult',
      expectedPlanVersion: 1,
      expectedAmount: 30500,
    });
    assert.equal(approved.state, 'completed');
    assert.equal(approved.steps.every((s) => s.state === 'completed'), true);

    // Assert 3 distinct provider records created
    const bookings = provider.listBookingsForMission(m.id);
    assert.equal(bookings.length, 3);
    const venueBooking = bookings.find((b) => b.serviceType === 'venue');
    const cateringBooking = bookings.find((b) => b.serviceType === 'catering');
    const cakeBooking = bookings.find((b) => b.serviceType === 'cake');
    assert.ok(venueBooking);
    assert.ok(cateringBooking);
    assert.ok(cakeBooking);
    assert.equal(venueBooking?.cost, 12000);
    assert.equal(cateringBooking?.cost, 15000);
    assert.equal(cakeBooking?.cost, 3500);

    // Assert 3 distinct ledger entries recorded
    assert.equal(approved.ledger.length, 3);
    assert.equal(approved.ledger[0].action, 'fictional_venue_booked');
    assert.equal(approved.ledger[1].action, 'fictional_catering_booked');
    assert.equal(approved.ledger[2].action, 'fictional_cake_booked');

    // Cost breakdown accuracy
    assert.equal(approved.costBreakdown?.venueCommitted, 12000);
    assert.equal(approved.costBreakdown?.cateringCommitted, 15000);
    assert.equal(approved.costBreakdown?.cakeCommitted, 3500);
    assert.equal(approved.costBreakdown?.netSpend, 30500);

    // 5. Reverse-dependency compensation & undo
    const undoApproval = store.approvals.getPendingApproval(m.id);
    assert.ok(undoApproval);
    assert.equal(undoApproval.action, 'undo');

    // Missing token on undo rejected
    assert.throws(
      () => store.undo(m.id),
      (err: any) => err instanceof ApprovalPolicyError && err.code === 'TOKEN_INVALID'
    );

    // Undo with valid phrase / token
    const undone = store.undo(m.id, { tokenOrPhrase: undoApproval.confirmationPhrase, role: 'adult' });
    assert.equal(undone.state, 'undone');
    assert.equal(undone.steps.every((s) => s.state === 'undone'), true);

    // Assert 3 provider bookings cancelled
    const updatedBookings = provider.listBookingsForMission(m.id);
    assert.equal(updatedBookings.every((b) => b.status === 'cancelled'), true);

    // Assert cancellation entries in reverse order: cake -> catering -> venue
    assert.equal(undone.ledger.length, 6);
    assert.equal(undone.ledger[3].action, 'fictional_cake_cancelled');
    assert.equal(undone.ledger[4].action, 'fictional_catering_cancelled');
    assert.equal(undone.ledger[5].action, 'fictional_venue_cancelled');

    // Verify cryptographic Action Ledger integrity
    const ledgerReport = verifyLedger(undone.ledger);
    assert.equal(ledgerReport.valid, true);
    assert.equal(undone.ledger.reduce((sum, e) => sum + e.cost, 0), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('3b. Crash recovery across started and effect_completed windows with stable idempotency keys', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-crash-recovery-'));
  try {
    const provider = new FictionalVenueProvider(dir);
    const store1 = new MissionStore(dir, undefined, undefined, provider);
    const m = store1.create('Crash Recovery Test', 45000, { guests: 25 });
    const approval = store1.approvals.getPendingApproval(m.id)!;

    // Crash Window 1: intent marked "started", provider effect completed, but process killed before "effect_completed" or ledger saved
    const stableKey = `idem-${m.id}-v1-venue_booking`;
    const ref = `ATLAS-${m.id.slice(0, 8).toUpperCase()}`;
    provider.createOrConfirm({
      ref,
      occasion: m.goal,
      guests: 25,
      cost: 12000,
      idempotencyKey: stableKey,
      serviceType: 'venue',
      itemKey: 'garden_hall',
    });

    const target = (store1 as any).missions.find((x: any) => x.id === m.id);
    target.state = 'executing';
    target.executionIntent = {
      stepId: 'venue_booking',
      action: 'book',
      idempotencyKey: stableKey,
      status: 'started', // Window: started
    };
    (store1 as any).save();

    // Restart server: reconcileIntents must reconcile provider booking using stableKey
    const store2 = new MissionStore(dir, undefined, undefined, provider);
    const recovered1 = store2.get(m.id);
    assert.equal(recovered1.state, 'completed');
    assert.equal(recovered1.ledger.length, 1);
    assert.equal(recovered1.ledger[0].action, 'fictional_venue_booked');
    assert.equal(recovered1.ledger[0].idempotencyKey, stableKey);
    assert.equal(recovered1.executionIntent?.status, 'ledger_written');

    // Crash Window 2: intent marked "started" but provider call NEVER executed before crash
    const m2 = store2.create('Uncommitted Intent Test', 40000);
    const target2 = (store2 as any).missions.find((x: any) => x.id === m2.id);
    target2.state = 'executing';
    target2.executionIntent = {
      stepId: 'venue_booking',
      action: 'book',
      idempotencyKey: `idem-${m2.id}-v1-venue_booking`,
      status: 'started',
    };
    (store2 as any).save();

    // Restart server: uncommitted started intent rolls back cleanly to awaiting_approval
    const store3 = new MissionStore(dir, undefined, undefined, provider);
    const recovered2 = store3.get(m2.id);
    assert.equal(recovered2.state, 'awaiting_approval');
    assert.equal(recovered2.executionIntent, undefined);
    assert.equal(recovered2.ledger.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('4. Declarative AST math evaluator: ops, Math functions, prototype protection, complexity limits, and test fixtures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-evaluator-'));
  try {
    // Basic arithmetic and modulo
    assert.equal(evaluateSafeExpression('10 + 5 * 2', {}), 20);
    assert.equal(evaluateSafeExpression('(10 + 5) * 2', {}), 30);
    assert.equal(evaluateSafeExpression('25 % 4', {}), 1);

    // Safe Math functions: Math.ceil, Math.floor, Math.round, Math.max, Math.min, Math.abs
    assert.equal(evaluateSafeExpression('Math.ceil(guests * 0.6)', { guests: 25 }), 15);
    assert.equal(evaluateSafeExpression('Math.floor(guests * 0.4)', { guests: 25 }), 10);
    assert.equal(evaluateSafeExpression('Math.round(2.7)', {}), 3);
    assert.equal(evaluateSafeExpression('Math.max(100, 250)', {}), 250);
    assert.equal(evaluateSafeExpression('Math.min(100, 250)', {}), 100);
    assert.equal(evaluateSafeExpression('Math.abs(-45)', {}), 45);

    // Security: Prototype traversal and property access rejection
    assert.throws(() => evaluateSafeExpression('__proto__', {}), /Unsafe keyword detected|Illegal identifier/);
    assert.throws(() => evaluateSafeExpression('constructor', {}), /Unsafe keyword detected|Illegal identifier/);
    assert.throws(() => evaluateSafeExpression('guests.toString()', { guests: 25 }), /Disallowed property access/);
    assert.throws(() => evaluateSafeExpression('eval("1+1")', {}), /Forbidden character|Unsafe keyword|Illegal identifier/);
    assert.throws(() => evaluateSafeExpression('Function("return 1")()', {}), /Forbidden character|Unsafe keyword|Illegal identifier/);

    // Complexity cap: Rejects expressions with excessive tokens
    const longExpr = Array(120).fill('1').join(' + ');
    assert.throws(() => evaluateSafeExpression(longExpr, {}), /maximum complexity limit/);

    // LearnedSkillStore test fixture requirement
    const store = new LearnedSkillStore(dir);
    assert.throws(
      () =>
        store.create({
          name: 'untested_skill',
          description: 'A skill with no tests',
          category: 'venue',
          template: '{"cost": "1000"}',
          parameters: {},
          tests: [],
        }),
      /requires at least one test fixture/
    );

    // Skill update invalidates approval
    const skill = store.get('party_portion_calculator');
    store.testSkill(skill.id);
    store.approveSkill(skill.id, 'adult');
    assert.equal(store.get(skill.id).status, 'approved');

    store.update(skill.id, { description: 'Updated description' });
    assert.equal(store.get(skill.id).status, 'draft'); // Approval invalidated on update
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('5. Cryptographic Action Ledger verification: canonical serialization, tampering detection, and broken links', () => {
  // Test canonical JSON stringification (key ordering independence)
  const obj1 = { b: 2, a: 1, c: { y: 20, x: 10 } };
  const obj2 = { a: 1, c: { x: 10, y: 20 }, b: 2 };
  assert.equal(canonicalJsonStringify(obj1), canonicalJsonStringify(obj2));

  // Build a valid 3-entry canonical v2 ledger
  const e1Core = {
    sequence: 1,
    action: 'fictional_venue_booked',
    cost: 12000,
    previousHash: 'GENESIS',
    timestamp: '2026-10-23T10:00:00.000Z',
    stepId: 'step_1',
    idempotencyKey: 'key_1',
    version: 2,
  };
  const e1: LedgerEntry = { ...e1Core, hash: computeCanonicalV2Hash(e1Core) };

  const e2Core = {
    sequence: 2,
    action: 'fictional_catering_booked',
    cost: 15000,
    previousHash: e1.hash,
    timestamp: '2026-10-23T10:01:00.000Z',
    stepId: 'step_2',
    idempotencyKey: 'key_2',
    version: 2,
  };
  const e2: LedgerEntry = { ...e2Core, hash: computeCanonicalV2Hash(e2Core) };

  const e3Core = {
    sequence: 3,
    action: 'fictional_cake_booked',
    cost: 3000,
    previousHash: e2.hash,
    timestamp: '2026-10-23T10:02:00.000Z',
    stepId: 'step_3',
    idempotencyKey: 'key_3',
    version: 2,
  };
  const e3: LedgerEntry = { ...e3Core, hash: computeCanonicalV2Hash(e3Core) };

  const validChain = [e1, e2, e3];
  const validReport = verifyLedger(validChain);
  assert.equal(validReport.valid, true);
  assert.equal(validReport.algorithm, 'sha256-canonical-v2');
  assert.equal(validReport.checkedEntries, 3);
  assert.equal(validReport.errors.length, 0);

  // Tamper detection 1: Modify a field (e.g. cost changed from 15000 to 1000)
  const tamperedFieldChain = [e1, { ...e2, cost: 1000 }, e3];
  const tamperedReport = verifyLedger(tamperedFieldChain);
  assert.equal(tamperedReport.valid, false);
  assert.equal(tamperedReport.tamperedEntryIndex, 1);
  assert.match(tamperedReport.errors.join('; '), /hash mismatch/i);

  // Tamper detection 2: Broken link (e.g. e3 points to wrong previousHash)
  const brokenLinkChain = [e1, e2, { ...e3, previousHash: '0000000000000000000000000000000000000000000000000000000000000000' }];
  const brokenLinkReport = verifyLedger(brokenLinkChain);
  assert.equal(brokenLinkReport.valid, false);
  assert.match(brokenLinkReport.errors.join('; '), /Linkage broken/i);

  // Tamper detection 3: Reordered entries
  const reorderedChain = [e1, e3, e2];
  const reorderedReport = verifyLedger(reorderedChain);
  assert.equal(reorderedReport.valid, false);
  assert.match(reorderedReport.errors.join('; '), /Sequence mismatch/i);

  // Tamper detection 4: Missing sequence number (gap in sequence)
  const skippedChain = [e1, { ...e2, sequence: 3 }];
  const skippedReport = verifyLedger(skippedChain);
  assert.equal(skippedReport.valid, false);
  assert.match(skippedReport.errors.join('; '), /Sequence mismatch/i);
});

test('6. Concurrent revisions rejected during execution', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-concurrent-rev-'));
  try {
    const store = new MissionStore(dir);
    const m = store.create('Concurrent test', 40000);
    const target = (store as any).missions.find((x: any) => x.id === m.id);
    target.state = 'executing';
    (store as any).save();

    await assert.rejects(
      async () => store.revisePlan(m.id, { budget: 45000 }),
      /Cannot revise plan while mission is currently executing/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('7. Provider price change requires fresh authorization and rejects stale approval', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-price-change-'));
  try {
    const provider = new FictionalVenueProvider(dir);
    const store = new MissionStore(dir, undefined, undefined, provider);
    const m = store.create('Price Change Test', 40000);
    const approval = store.approvals.getPendingApproval(m.id)!;

    // Mutate provider base price in inventory after plan formulation
    const venueItem = (provider as any).bookings; // provider inventory
    const originalVenue = provider.getInventoryItem('venue', 'garden_hall')!;
    const gardenHall = (provider as any).constructor; // FICTIONAL_INVENTORY
    const FICTIONAL_INVENTORY = (await import('./provider.js')).FICTIONAL_INVENTORY;
    const origPrice = FICTIONAL_INVENTORY.venue[0].basePrice;
    FICTIONAL_INVENTORY.venue[0].basePrice = 16000; // price jumped from 12000 to 16000

    try {
      assert.throws(
        () => store.approve(m.id, { tokenOrPhrase: approval.token }),
        /Provider price for .* has changed from INR 12,000 to INR 16,000/
      );
    } finally {
      FICTIONAL_INVENTORY.venue[0].basePrice = origPrice;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('8. Inventory failure triggers automatic reverse dependency saga compensation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-saga-fail-'));
  try {
    const provider = new FictionalVenueProvider(dir);
    const store = new MissionStore(dir, undefined, undefined, provider);
    const m = store.create('Saga Failure Test', 50000, {
      guests: 25,
      services: ['venue', 'catering', 'cake'],
    });
    const approval = store.approvals.getPendingApproval(m.id)!;

    // Mark cake as unavailable to trigger failure on step 3 after steps 1 & 2 succeeded
    const { FICTIONAL_INVENTORY } = await import('./provider.js');
    const origAvailable = FICTIONAL_INVENTORY.cake[0].available;
    FICTIONAL_INVENTORY.cake[0].available = false;

    try {
      assert.throws(
        () => store.approve(m.id, { tokenOrPhrase: approval.token }),
        /currently unavailable/
      );

      const failedMission = store.get(m.id);
      assert.equal(failedMission.state, 'failed');

      // Assert that step 1 (venue) and step 2 (catering) were rolled back / compensated!
      const venueBooking = provider.getBooking(`ATLAS-${m.id.slice(0, 8).toUpperCase()}`);
      const cateringBooking = provider.getBooking(`ATLAS-${m.id.slice(0, 8).toUpperCase()}-CATERING`);
      assert.equal(venueBooking?.status, 'cancelled');
      assert.equal(cateringBooking?.status, 'cancelled');

      // Assert rollback ledger entries exist
      assert.ok(failedMission.ledger.some((e) => e.action === 'fictional_catering_cancelled'));
      assert.ok(failedMission.ledger.some((e) => e.action === 'fictional_venue_cancelled'));
    } finally {
      FICTIONAL_INVENTORY.cake[0].available = origAvailable;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
