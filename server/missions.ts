import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Mission, MissionStep, LedgerEntry, MissionState } from '../shared/contracts.js';
import { MissionPlanner } from './planner.js';
import { ApprovalManager, ApprovalPolicyError } from './approvals.js';
import { FictionalVenueProvider } from './provider.js';

export class MissionStore {
  private missions: Mission[];
  private planner: MissionPlanner;
  public readonly approvals: ApprovalManager;
  public readonly provider: FictionalVenueProvider;

  constructor(
    private directory = 'data',
    planner?: MissionPlanner,
    approvals?: ApprovalManager,
    provider?: FictionalVenueProvider
  ) {
    mkdirSync(directory, { recursive: true });
    this.planner = planner ?? new MissionPlanner();
    this.approvals = approvals ?? new ApprovalManager();
    this.provider = provider ?? new FictionalVenueProvider(directory);

    const file = join(directory, 'missions.json');
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      // Migrate and ensure backward-compatible defaults
      this.missions = raw.map((m: any) => this.migrateRecord(m));
    } else {
      this.missions = [];
    }

    this.reconcileIntents();
  }

  private migrateRecord(raw: any): Mission {
    return {
      id: raw.id,
      goal: raw.goal,
      budget: raw.budget,
      state: raw.state || 'awaiting_approval',
      simulated: true,
      plannedCost: raw.plannedCost ?? 12000,
      planner: raw.planner || { mode: 'fixture' },
      steps: (raw.steps || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        state: s.state,
        tool: s.tool || (s.id === 'venue' ? 'fictional_venue_book' : undefined),
        costBound: s.costBound ?? (s.id === 'venue' ? 12000 : 0),
        dependencies: s.dependencies ?? [],
        requiresApproval: s.requiresApproval ?? true,
      })),
      ledger: raw.ledger || [],
      pendingApproval: raw.pendingApproval,
      executionIntent: raw.executionIntent,
    };
  }

  /**
   * Reconciles any interrupted intents on startup (e.g. crash after provider effect but before ledger commit).
   */
  private reconcileIntents() {
    let modified = false;
    for (const m of this.missions) {
      if (m.executionIntent && m.executionIntent.status === 'effect_completed') {
        const ref = `ATLAS-${m.id.slice(0, 8).toUpperCase()}`;
        const booking = this.provider.getBooking(ref);

        if (m.executionIntent.action === 'book' && booking?.status === 'confirmed') {
          if (!m.ledger.some((e) => e.idempotencyKey === m.executionIntent?.idempotencyKey)) {
            this.append(m, 'fictional_venue_booked', m.plannedCost, m.executionIntent.idempotencyKey);
            m.state = 'completed';
            if (m.steps[0]) m.steps[0].state = 'completed';
            m.executionIntent.status = 'ledger_written';
            modified = true;
          }
        } else if (m.executionIntent.action === 'cancel' && booking?.status === 'cancelled') {
          if (!m.ledger.some((e) => e.idempotencyKey === m.executionIntent?.idempotencyKey)) {
            this.append(m, 'fictional_venue_cancelled', -m.plannedCost, m.executionIntent.idempotencyKey);
            m.state = 'undone';
            if (m.steps[0]) m.steps[0].state = 'undone';
            m.executionIntent.status = 'ledger_written';
            modified = true;
          }
        }
      }
    }
    if (modified) this.save();
  }

  private save() {
    const file = join(this.directory, 'missions.json');
    writeFileSync(file + '.tmp', JSON.stringify(this.missions, null, 2));
    renameSync(file + '.tmp', file);
  }

  list(): Mission[] {
    return structuredClone(this.missions);
  }

  get(id: string): Mission {
    const mission = this.missions.find((m) => m.id === id);
    if (!mission) throw new Error('Mission not found');
    return structuredClone(mission);
  }

  /**
   * Creates a mission by formulating a plan with Bedrock or the scenario planner.
   */
  async createAsync(goal: string, budget: number): Promise<Mission> {
    if (!goal || !goal.trim() || !Number.isSafeInteger(budget) || budget < 12000) {
      throw new Error('Enter a goal and a budget of at least INR 12,000 for this venue scenario.');
    }

    const planResult = await this.planner.planMission(goal.trim(), budget);
    const missionId = randomUUID();

    // Create a pending approval token bound to this mission
    const pendingApproval = this.approvals.createPendingApproval(
      missionId,
      'book_venue',
      planResult.plannedCost,
      'adult'
    );

    const mission: Mission = {
      id: missionId,
      goal: goal.trim(),
      budget,
      plannedCost: planResult.plannedCost,
      state: 'awaiting_approval',
      simulated: true,
      planner: {
        mode: planResult.mode,
        model: planResult.model,
        evaluatedAlternatives: planResult.evaluatedAlternatives,
      },
      steps: planResult.steps,
      ledger: [],
      pendingApproval,
    };

    this.missions.push(mission);
    this.save();
    return structuredClone(mission);
  }

  /**
   * Synchronous create for backward compatibility with existing tests.
   */
  create(goal: string, budget: number): Mission {
    if (!goal || !goal.trim() || !Number.isSafeInteger(budget) || budget < 12000) {
      throw new Error('Enter a goal and a budget of at least INR 12,000 for this venue scenario.');
    }

    const planResult = (this.planner as any).planWithFixtures(goal.trim(), budget);
    const missionId = randomUUID();

    const pendingApproval = this.approvals.createPendingApproval(
      missionId,
      'book_venue',
      planResult.plannedCost,
      'adult'
    );

    const mission: Mission = {
      id: missionId,
      goal: goal.trim(),
      budget,
      plannedCost: planResult.plannedCost,
      state: 'awaiting_approval',
      simulated: true,
      planner: {
        mode: 'fixture',
        model: 'deterministic-scenario-planner',
        evaluatedAlternatives: planResult.evaluatedAlternatives,
      },
      steps: planResult.steps,
      ledger: [],
      pendingApproval,
    };

    this.missions.push(mission);
    this.save();
    return structuredClone(mission);
  }

  private append(m: Mission, action: string, cost: number, idempotencyKey?: string) {
    const entry: Omit<LedgerEntry, 'hash'> = {
      sequence: m.ledger.length + 1,
      action,
      cost,
      previousHash: m.ledger.at(-1)?.hash ?? 'GENESIS',
      timestamp: new Date().toISOString(),
      idempotencyKey,
    };
    m.ledger.push({
      ...entry,
      hash: createHash('sha256').update(JSON.stringify(entry)).digest('hex'),
    });
  }

  /**
   * Approves a mission. Supports optional contextual approval verification and role checks.
   */
  approve(
    id: string,
    options?: { tokenOrPhrase?: string; role?: 'adult' | 'child' }
  ): Mission {
    const m = this.missions.find((item) => item.id === id);
    if (!m) throw new Error('Mission not found');

    // Idempotent return if already completed
    if (m.state === 'completed') return structuredClone(m);
    if (m.state !== 'awaiting_approval') {
      throw new Error('This mission cannot be approved in its current state');
    }
    if (m.plannedCost > m.budget) throw new Error('Budget exceeded');

    // If options are provided, verify contextual approval token/phrase and role policy
    if (options?.tokenOrPhrase || options?.role) {
      this.approvals.verifyAndConsume(id, options.tokenOrPhrase, options.role ?? 'adult');
    }

    const idempotencyKey = randomUUID();
    const ref = `ATLAS-${m.id.slice(0, 8).toUpperCase()}`;

    // Record execution intent
    m.state = 'executing';
    m.executionIntent = {
      stepId: m.steps[0]?.id ?? 'venue_booking',
      action: 'book',
      idempotencyKey,
      status: 'started',
    };
    this.save();

    // Commit to persistent fictional booking provider
    this.provider.createOrConfirm({
      ref,
      occasion: m.goal,
      guests: 25,
      cost: m.plannedCost,
      idempotencyKey,
    });
    m.executionIntent.status = 'effect_completed';
    this.save();

    // Commit to Action Ledger
    this.append(m, 'fictional_venue_booked', m.plannedCost, idempotencyKey);
    m.state = 'completed';
    if (m.steps[0]) m.steps[0].state = 'completed';
    m.executionIntent.status = 'ledger_written';
    m.pendingApproval = undefined;

    this.save();
    return structuredClone(m);
  }

  /**
   * Undoes a completed booking with compensation saga in reverse order.
   */
  undo(
    id: string,
    options?: { tokenOrPhrase?: string; role?: 'adult' | 'child' }
  ): Mission {
    const m = this.missions.find((item) => item.id === id);
    if (!m) throw new Error('Mission not found');

    if (m.state === 'undone') return structuredClone(m);
    if (m.state !== 'completed') {
      throw new Error('Only completed bookings can be undone');
    }

    if (options?.tokenOrPhrase || options?.role) {
      this.approvals.verifyAndConsume(id, options.tokenOrPhrase, options.role ?? 'adult');
    }

    const idempotencyKey = randomUUID();
    const ref = `ATLAS-${m.id.slice(0, 8).toUpperCase()}`;

    // Record compensation intent
    m.state = 'compensating';
    m.executionIntent = {
      stepId: m.steps[0]?.id ?? 'venue_booking',
      action: 'cancel',
      idempotencyKey,
      status: 'started',
    };
    this.save();

    // Reversible compensation with persistent fictional provider
    this.provider.cancel(ref, idempotencyKey);
    m.executionIntent.status = 'effect_completed';
    this.save();

    // Record reversal in Action Ledger
    this.append(m, 'fictional_venue_cancelled', -m.plannedCost, idempotencyKey);
    m.state = 'undone';

    // Compensate steps in reverse order
    for (let i = m.steps.length - 1; i >= 0; i--) {
      if (m.steps[i].state === 'completed') {
        m.steps[i].state = 'undone';
      }
    }

    m.executionIntent.status = 'ledger_written';
    this.save();
    return structuredClone(m);
  }
}
