import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from './missions.js';
import { ApprovalPolicyError } from './approvals.js';

interface EvalMetricReport {
  timestamp: string;
  plannerMode: string;
  scenarioCount: number;
  completedScenarios: number;
  failedScenarios: number;
  completionRatePct: number;
  unapprovedActionsCount: number;
  duplicateBookingsCount: number;
  compensationsAttempted: number;
  compensationsSucceeded: number;
  details: {
    id: string;
    name: string;
    status: 'pass' | 'fail';
    reason?: string;
  }[];
}

export async function runEvaluation(): Promise<EvalMetricReport> {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-eval-'));
  const store = new MissionStore(dir);
  const details: EvalMetricReport['details'] = [];

  let unapprovedActionsCount = 0;
  let duplicateBookingsCount = 0;
  let compensationsAttempted = 0;
  let compensationsSucceeded = 0;

  // Scenario 1: Standard mission lifecycle (Plan -> Approve -> Undo)
  try {
    const m1 = await store.createAsync("Plan Dad's 60th birthday for Saturday, 25 people, budget INR 40,000.", 40000);
    if (m1.ledger.length !== 0) unapprovedActionsCount++;

    const approved1 = store.approve(m1.id);
    if (approved1.ledger.length !== 1 || approved1.state !== 'completed') {
      throw new Error('Approval did not commit exactly 1 booking ledger entry');
    }

    compensationsAttempted++;
    const undone1 = store.undo(m1.id);
    if (undone1.state === 'undone' && undone1.ledger.length === 2) {
      compensationsSucceeded++;
    }

    details.push({ id: 'sc-1', name: 'Standard Full Lifecycle (Plan->Approve->Undo)', status: 'pass' });
  } catch (err) {
    details.push({ id: 'sc-1', name: 'Standard Full Lifecycle', status: 'fail', reason: String(err) });
  }

  // Scenario 2: Exact boundary budget (INR 12,000)
  try {
    const m2 = await store.createAsync('Mom retirement luncheon for 15 guests, budget INR 12,000', 12000);
    const approved2 = store.approve(m2.id);
    if (approved2.state !== 'completed') throw new Error('Boundary budget not approved');
    details.push({ id: 'sc-2', name: 'Boundary Minimum Budget Acceptance (INR 12,000)', status: 'pass' });
  } catch (err) {
    details.push({ id: 'sc-2', name: 'Boundary Minimum Budget Acceptance', status: 'fail', reason: String(err) });
  }

  // Scenario 3: Under-budget rejection (INR 8,000)
  try {
    let rejected = false;
    try {
      await store.createAsync('Family gathering, budget INR 8,000', 8000);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('Failed to reject sub-minimum budget');
    details.push({ id: 'sc-3', name: 'Deterministic Under-Budget Rejection (INR 8,000)', status: 'pass' });
  } catch (err) {
    details.push({ id: 'sc-3', name: 'Deterministic Under-Budget Rejection', status: 'fail', reason: String(err) });
  }

  // Scenario 4: Child role financial protection
  try {
    const m4 = await store.createAsync('Gaming party with friends, budget INR 15,000', 15000);
    let childBlocked = false;
    try {
      store.approve(m4.id, { role: 'child' });
    } catch (err) {
      if (err instanceof ApprovalPolicyError && err.code === 'ROLE_UNAUTHORIZED') {
        childBlocked = true;
      }
    }
    if (!childBlocked) {
      unapprovedActionsCount++;
      throw new Error('Child role was not blocked from financial booking');
    }
    details.push({ id: 'sc-4', name: 'Simulated Child Policy Financial Block', status: 'pass' });
  } catch (err) {
    details.push({ id: 'sc-4', name: 'Simulated Child Policy Financial Block', status: 'fail', reason: String(err) });
  }

  // Scenario 5: Duplicate approval idempotency
  try {
    const m5 = await store.createAsync('Anniversary party, budget INR 40,000', 40000);
    store.approve(m5.id);
    const retryApprove = store.approve(m5.id); // rapid second click
    if (retryApprove.ledger.length > 1) {
      duplicateBookingsCount++;
      throw new Error('Duplicate approval created multiple ledger entries');
    }
    details.push({ id: 'sc-5', name: 'Duplicate Approval Idempotency Protection', status: 'pass' });
  } catch (err) {
    details.push({ id: 'sc-5', name: 'Duplicate Approval Idempotency Protection', status: 'fail', reason: String(err) });
  }

  rmSync(dir, { recursive: true, force: true });

  const completed = details.filter((d) => d.status === 'pass').length;
  const report: EvalMetricReport = {
    timestamp: new Date().toISOString(),
    plannerMode: (store as any).planner?.getMode?.() ?? 'fixture',
    scenarioCount: details.length,
    completedScenarios: completed,
    failedScenarios: details.length - completed,
    completionRatePct: Math.round((completed / details.length) * 100),
    unapprovedActionsCount,
    duplicateBookingsCount,
    compensationsAttempted,
    compensationsSucceeded,
    details,
  };

  mkdirSync('data', { recursive: true });
  writeFileSync('data/eval_report.json', JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1]?.endsWith('eval.ts') || process.argv[1]?.endsWith('eval.js')) {
  runEvaluation()
    .then((report) => {
      console.log('====================================================');
      console.log('       ATLAS SEEDED EVALUATION BENCHMARK');
      console.log('====================================================');
      console.log(`Planner Mode:           ${report.plannerMode}`);
      console.log(`Scenarios Evaluated:    ${report.scenarioCount}`);
      console.log(`Completed Scenarios:    ${report.completedScenarios}/${report.scenarioCount} (${report.completionRatePct}%)`);
      console.log(`Unapproved Actions:     ${report.unapprovedActionsCount} (Expected: 0)`);
      console.log(`Duplicate Bookings:     ${report.duplicateBookingsCount} (Expected: 0)`);
      console.log(`Compensations:          ${report.compensationsSucceeded}/${report.compensationsAttempted} succeeded`);
      console.log('----------------------------------------------------');
      for (const d of report.details) {
        console.log(`[${d.status.toUpperCase()}] ${d.name}${d.reason ? ` - ${d.reason}` : ''}`);
      }
      console.log('====================================================');
      console.log('Full report exported to: data/eval_report.json');
    })
    .catch((err) => {
      console.error('Eval error:', err);
      process.exit(1);
    });
}
