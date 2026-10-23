import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Mission,
  MissionStep,
  LedgerEntry,
  MissionPreferences,
  PlanRevision,
  CostBreakdown,
  LedgerVerificationResult,
} from '../shared/contracts.js';
import { MissionPlanner } from './planner.js';
import { ApprovalManager, ApprovalPolicyError } from './approvals.js';
import { FictionalVenueProvider } from './provider.js';
import { computeCanonicalV2Hash, verifyLedger } from './ledger.js';

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
      this.missions = raw.map((m: any) => this.migrateRecord(m));
    } else {
      this.missions = [];
    }

    // Rehydrate approvals and reconcile any interrupted intents
    for (const m of this.missions) {
      if (m.pendingApproval) {
        this.approvals.rehydrate(m.pendingApproval);
      } else if (m.state === 'completed') {
        m.pendingApproval = this.approvals.createPendingApproval(
          m.id,
          'undo',
          0,
          m.version,
          'adult',
          'Compensate and cancel completed booking'
        );
      }
    }

    this.reconcileIntents();
  }

  private computeCostBreakdown(m: Mission): CostBreakdown {
    let venueCommitted = 0;
    let cateringCommitted = 0;
    let cakeCommitted = 0;
    let estimatedQuotes = 0;
    let actualSpend = 0;
    let refunds = 0;

    for (const step of m.steps) {
      const bound = step.costBound ?? 0;
      if (step.tool === 'fictional_venue_book' && step.state === 'completed') {
        venueCommitted += bound;
      } else if (step.tool === 'fictional_catering_order' && step.state === 'completed') {
        cateringCommitted += bound;
      } else if (step.tool === 'fictional_cake_order' && step.state === 'completed') {
        cakeCommitted += bound;
      } else if (step.tool?.includes('quote')) {
        const quoteVal = Number((step.args as any)?.price) || 0;
        estimatedQuotes += quoteVal;
      }
    }

    for (const entry of m.ledger) {
      if (entry.cost > 0) {
        actualSpend += entry.cost;
      } else if (entry.cost < 0) {
        refunds += Math.abs(entry.cost);
      }
    }

    return {
      venueCommitted,
      cateringCommitted,
      cakeCommitted,
      estimatedQuotes,
      actualSpend,
      refunds,
      netSpend: actualSpend - refunds,
    };
  }

  private migrateRecord(raw: any): Mission {
    const preferences: MissionPreferences = raw.preferences ?? {
      guests: 25,
      eventDate: 'Saturday evening',
      budget: raw.budget ?? 40000,
      dietaryPreferences: 'regular',
    };

    const mission: Mission = {
      id: raw.id,
      version: raw.version ?? 1,
      goal: raw.goal,
      budget: raw.budget,
      state: raw.state || 'awaiting_approval',
      simulated: true,
      plannedCost: raw.plannedCost ?? 12000,
      preferences,
      revisions: raw.revisions ?? [],
      planner: raw.planner || { mode: 'fixture' },
      steps: (raw.steps || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        state: s.state,
        tool: s.tool || (s.id === 'venue' || s.id === 'venue_booking' ? 'fictional_venue_book' : undefined),
        args: s.args,
        costBound: s.costBound ?? (s.id === 'venue' || s.id === 'venue_booking' ? 12000 : 0),
        dependencies: s.dependencies ?? [],
        requiresApproval: s.requiresApproval ?? true,
        result: s.result,
        error: s.error,
      })),
      ledger: raw.ledger || [],
      pendingApproval: raw.pendingApproval
        ? {
            ...raw.pendingApproval,
            planVersion: raw.pendingApproval.planVersion ?? raw.version ?? 1,
          }
        : undefined,
      executionIntent: raw.executionIntent,
    };

    mission.costBreakdown = this.computeCostBreakdown(mission);
    return mission;
  }

  /**
   * Reconciles any interrupted intents on startup (e.g. crash after provider effect but before ledger commit).
   */
  private reconcileIntents() {
    let modified = false;
    for (const m of this.missions) {
      if (!m.executionIntent) continue;
      const intent = m.executionIntent;
      const ref = `ATLAS-${m.id.slice(0, 8).toUpperCase()}`;

      // A different service's booking cannot prove that this intent took effect.
      const intentStep = m.steps.find((step) => step.id === intent.stepId);
      const serviceRef = intentStep?.tool === 'fictional_catering_order' ? `${ref}-CATERING`
        : intentStep?.tool === 'fictional_cake_order' ? `${ref}-CAKE` : ref;
      const candidate = this.provider.getBooking(serviceRef);
      const booking = this.provider.getBookingByIdempotencyKey(intent.idempotencyKey)
        ?? (candidate?.idempotencyKey === intent.idempotencyKey ? candidate : undefined);

      if (intent.action === 'book') {
        if (booking && booking.status === 'confirmed') {
          if (!m.ledger.some((e) => e.idempotencyKey === intent.idempotencyKey)) {
            const step = m.steps.find((s) => s.id === intent.stepId) ?? m.steps[0];
            const actionName = booking.serviceType === 'venue'
              ? 'fictional_venue_booked'
              : booking.serviceType === 'catering'
              ? 'fictional_catering_booked'
              : 'fictional_cake_booked';
            this.append(m, actionName, booking.cost, intent.idempotencyKey, step?.id, {
              service: booking.serviceType,
              ref: booking.ref,
              recoveredFromCrash: true,
            });
            if (step) step.state = 'completed';
          }
          intent.status = 'ledger_written';
          const allCompleted = m.steps.every((s) => !s.requiresApproval || s.costBound === 0 || s.state === 'completed');
          if (allCompleted) {
            m.state = 'completed';
            m.pendingApproval = this.approvals.createPendingApproval(
              m.id,
              'undo',
              0,
              m.version,
              'adult',
              'Compensate and cancel completed booking'
            );
          } else {
            m.state = 'awaiting_approval';
            m.pendingApproval = this.approvals.createPendingApproval(
              m.id, 'book_venue', m.plannedCost, m.version, 'adult',
              'Resume remaining steps after reconciling an interrupted execution'
            );
          }
          m.costBreakdown = this.computeCostBreakdown(m);
          modified = true;
        } else if (intent.status === 'started' && !booking) {
          // Crashed before provider effect took place. Safe to roll back execution intent
          m.executionIntent = undefined;
          if (m.state === 'executing') {
            m.state = 'awaiting_approval';
          }
          modified = true;
        }
      } else if (intent.action === 'cancel') {
        if (booking && booking.status === 'cancelled') {
          if (!m.ledger.some((e) => e.idempotencyKey === intent.idempotencyKey)) {
            const step = m.steps.find((s) => s.id === intent.stepId) ?? m.steps[0];
            const refund = booking.refundAmount ?? booking.cost;
            const actionName = booking.serviceType === 'venue'
              ? 'fictional_venue_cancelled'
              : booking.serviceType === 'catering'
              ? 'fictional_catering_cancelled'
              : 'fictional_cake_cancelled';
            this.append(m, actionName, -refund, intent.idempotencyKey, step?.id, {
              refundPolicy: booking.cancellationPolicy,
              refundRate: booking.refundPolicyRate,
              service: booking.serviceType,
              ref: booking.ref,
              recoveredFromCrash: true,
            });
            if (step) step.state = 'undone';
          }
          intent.status = 'ledger_written';
          const allUndone = m.steps.every((s) => s.state === 'undone' || s.state === 'pending');
          if (allUndone) {
            m.state = 'undone';
            m.pendingApproval = undefined;
          } else {
            m.state = 'completed';
            m.pendingApproval = this.approvals.createPendingApproval(
              m.id, 'undo', 0, m.version, 'adult',
              'Resume remaining cancellations after an interrupted compensation'
            );
          }
          m.costBreakdown = this.computeCostBreakdown(m);
          modified = true;
        } else if (intent.status === 'started' && (!booking || booking.status === 'confirmed')) {
          // Crashed before provider cancellation occurred
          m.executionIntent = undefined;
          if (m.state === 'compensating') {
            m.state = 'completed';
          }
          modified = true;
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

  verifyMissionLedger(id: string): LedgerVerificationResult {
    const mission = this.get(id);
    return verifyLedger(mission.ledger);
  }

  private append(
    m: Mission,
    action: string,
    cost: number,
    idempotencyKey?: string,
    stepId?: string,
    metadata?: Record<string, unknown>
  ) {
    const sequence = m.ledger.length + 1;
    const previousHash = m.ledger.at(-1)?.hash ?? 'GENESIS';
    const timestamp = new Date().toISOString();

    const hash = computeCanonicalV2Hash({
      sequence,
      previousHash,
      action,
      cost,
      timestamp,
      stepId,
      idempotencyKey,
      metadata,
    });

    const entry: LedgerEntry = {
      sequence,
      action,
      cost,
      previousHash,
      hash,
      timestamp,
      stepId,
      idempotencyKey,
      version: 2,
      metadata,
    };

    m.ledger.push(entry);
    m.costBreakdown = this.computeCostBreakdown(m);
  }

  /**
   * Creates a mission by formulating a plan with Gemini, Bedrock, or the scenario planner.
   */
  async createAsync(
    goal: string,
    budget: number,
    preferences?: Partial<MissionPreferences>
  ): Promise<Mission> {
    if (!goal || !goal.trim() || !Number.isSafeInteger(budget) || budget < 12000) {
      throw new Error('Enter a goal and a budget of at least INR 12,000 for this venue scenario.');
    }

    const defaultPrefs: MissionPreferences = {
      guests: preferences?.guests ?? 25,
      eventDate: preferences?.eventDate ?? 'Saturday evening',
      budget,
      dietaryPreferences: preferences?.dietaryPreferences ?? 'regular',
      notes: preferences?.notes,
      services: preferences?.services,
    };

    const planResult = await this.planner.planMission(goal.trim(), budget, defaultPrefs);
    const missionId = randomUUID();

    // Create a pending approval token bound to missionId and planVersion 1
    const pendingApproval = this.approvals.createPendingApproval(
      missionId,
      'book_venue',
      planResult.plannedCost,
      1,
      'adult',
      `Reserve Garden Hall for INR ${planResult.plannedCost.toLocaleString('en-IN')}`
    );

    const mission: Mission = {
      id: missionId,
      version: 1,
      goal: goal.trim(),
      budget,
      plannedCost: planResult.plannedCost,
      state: 'awaiting_approval',
      simulated: true,
      preferences: defaultPrefs,
      revisions: [],
      planner: {
        mode: planResult.mode,
        model: planResult.model,
        evaluatedAlternatives: planResult.evaluatedAlternatives,
      },
      steps: planResult.steps,
      ledger: [],
      pendingApproval,
    };

    mission.costBreakdown = this.computeCostBreakdown(mission);
    this.missions.push(mission);
    this.save();
    return structuredClone(mission);
  }

  /**
   * Synchronous create for backward compatibility with existing tests.
   */
  create(goal: string, budget: number, preferences?: Partial<MissionPreferences>): Mission {
    if (!goal || !goal.trim() || !Number.isSafeInteger(budget) || budget < 12000) {
      throw new Error('Enter a goal and a budget of at least INR 12,000 for this venue scenario.');
    }

    const defaultPrefs: MissionPreferences = {
      guests: preferences?.guests ?? 25,
      eventDate: preferences?.eventDate ?? 'Saturday evening',
      budget,
      dietaryPreferences: preferences?.dietaryPreferences ?? 'regular',
      notes: preferences?.notes,
      services: preferences?.services,
    };

    const planResult = (this.planner as any).planWithFixtures(goal.trim(), budget, defaultPrefs);
    const missionId = randomUUID();

    const pendingApproval = this.approvals.createPendingApproval(
      missionId,
      'book_venue',
      planResult.plannedCost,
      1,
      'adult',
      `Reserve Garden Hall for INR ${planResult.plannedCost.toLocaleString('en-IN')}`
    );

    const mission: Mission = {
      id: missionId,
      version: 1,
      goal: goal.trim(),
      budget,
      plannedCost: planResult.plannedCost,
      state: 'awaiting_approval',
      simulated: true,
      preferences: defaultPrefs,
      revisions: [],
      planner: {
        mode: 'fixture',
        model: 'deterministic-scenario-planner',
        evaluatedAlternatives: planResult.evaluatedAlternatives,
      },
      steps: planResult.steps,
      ledger: [],
      pendingApproval,
    };

    mission.costBreakdown = this.computeCostBreakdown(mission);
    this.missions.push(mission);
    this.save();
    return structuredClone(mission);
  }

  /**
   * Revises an existing mission plan with structured preferences.
   * Invalidates existing approvals and generates a before/after summary.
   */
  async revisePlan(
    id: string,
    changes: {
      budget?: number;
      guests?: number;
      eventDate?: string;
      dietaryPreferences?: string;
      notes?: string;
      instruction?: string;
      services?: ('venue' | 'catering' | 'cake')[];
    }
  ): Promise<{ mission: Mission; revisionSummary: string }> {
    const m = this.missions.find((item) => item.id === id);
    if (!m) throw new Error('Mission not found');

    // Prevent silent modification of already committed bookings or concurrent revision during execution
    if (m.state === 'completed') {
      throw new Error(
        `Cannot silently revise an already completed mission (ref #ATLAS-${m.id.slice(0, 8).toUpperCase()}). Modifying committed services requires explicit cancellation/undo first.`
      );
    }
    if (m.state === 'executing' || m.state === 'compensating') {
      throw new Error(`Cannot revise plan while mission is currently ${m.state}.`);
    }

    const previousBudget = m.budget;
    const previousCost = m.plannedCost;
    const previousVersion = m.version;
    const previousGuests = m.preferences?.guests ?? 25;

    // Merge preferences
    const updatedBudget = changes.budget ?? m.budget;
    if (updatedBudget < 12000) {
      throw new Error(`Budget cannot be reduced below minimum venue requirement (INR 12,000). Got INR ${updatedBudget}.`);
    }

    const updatedPrefs: MissionPreferences = {
      guests: changes.guests ?? m.preferences?.guests ?? 25,
      eventDate: changes.eventDate ?? m.preferences?.eventDate ?? 'Saturday evening',
      budget: updatedBudget,
      dietaryPreferences: changes.dietaryPreferences ?? m.preferences?.dietaryPreferences ?? 'regular',
      notes: changes.notes ?? m.preferences?.notes,
      services: changes.services ?? m.preferences?.services,
    };

    // Re-plan with updated preferences
    const planResult = await this.planner.planMission(m.goal, updatedBudget, updatedPrefs);

    m.version += 1;
    m.budget = updatedBudget;
    m.plannedCost = planResult.plannedCost;
    m.preferences = updatedPrefs;
    m.steps = planResult.steps;
    if (planResult.evaluatedAlternatives) {
      m.planner = {
        mode: planResult.mode,
        model: planResult.model,
        evaluatedAlternatives: planResult.evaluatedAlternatives,
      };
    }

    // Build human-readable before/after revision summary
    const changedFields: string[] = [];
    const changeDescriptions: string[] = [];

    if (changes.budget !== undefined && changes.budget !== previousBudget) {
      changedFields.push('budget');
      changeDescriptions.push(`Budget: INR ${previousBudget.toLocaleString('en-IN')} -> INR ${updatedBudget.toLocaleString('en-IN')}`);
    }
    if (changes.guests !== undefined && changes.guests !== previousGuests) {
      changedFields.push('guests');
      changeDescriptions.push(`Guests: ${previousGuests} -> ${changes.guests}`);
    }
    if (changes.dietaryPreferences !== undefined) {
      changedFields.push('dietaryPreferences');
      changeDescriptions.push(`Dietary: ${changes.dietaryPreferences}`);
    }
    if (changes.eventDate !== undefined) {
      changedFields.push('eventDate');
      changeDescriptions.push(`Date: ${changes.eventDate}`);
    }
    if (changes.instruction) {
      changedFields.push('instruction');
      changeDescriptions.push(`Note: "${changes.instruction}"`);
    }

    const summary = `Revision v${m.version}: ${changeDescriptions.length > 0 ? changeDescriptions.join('; ') : 'Parameters updated'}. Planned commitment: INR ${planResult.plannedCost.toLocaleString('en-IN')}.`;

    const revision: PlanRevision = {
      version: m.version,
      timestamp: new Date().toISOString(),
      changedFields,
      summary,
      previousCost,
      newCost: planResult.plannedCost,
      previousBudget,
      newBudget: updatedBudget,
    };

    if (!m.revisions) m.revisions = [];
    m.revisions.push(revision);

    // Invalidate old approval and generate fresh approval bound to the new plan version
    this.approvals.invalidate(m.id);
    m.pendingApproval = this.approvals.createPendingApproval(
      m.id,
      'book_venue',
      m.plannedCost,
      m.version,
      'adult',
      `Approve revised plan v${m.version} (INR ${m.plannedCost.toLocaleString('en-IN')})`
    );

    m.state = 'awaiting_approval';
    m.costBreakdown = this.computeCostBreakdown(m);
    this.save();

    return {
      mission: structuredClone(m),
      revisionSummary: summary,
    };
  }

  /**
   * Approves a mission and executes multi-step actions.
   * Requires valid approval token bound to exact planVersion, action, and expected amount.
   */
  approve(
    id: string,
    options?: {
      tokenOrPhrase?: string;
      role?: 'adult' | 'child';
      expectedPlanVersion?: number;
      expectedAction?: string;
      expectedAmount?: number;
    }
  ): Mission {
    const m = this.missions.find((item) => item.id === id);
    if (!m) throw new Error('Mission not found');

    if (m.state === 'completed') return structuredClone(m);
    if (m.state !== 'awaiting_approval') {
      throw new Error(`This mission cannot be approved in its current state ("${m.state}").`);
    }
    if (m.plannedCost > m.budget) {
      throw new Error(`Budget exceeded: planned cost INR ${m.plannedCost} exceeds INR ${m.budget}.`);
    }

    // Mandatory approval token verification: Tokenless approvals are strictly forbidden
    if (!options?.tokenOrPhrase || !options.tokenOrPhrase.trim()) {
      throw new ApprovalPolicyError(
        `Confirmation token or phrase is required to authorize "${m.pendingApproval?.action ?? 'book_venue'}".`,
        'TOKEN_INVALID'
      );
    }

    this.approvals.verifyAndConsume(
      id,
      options.tokenOrPhrase,
      options.role ?? 'adult',
      true,
      options.expectedPlanVersion ?? m.version,
      options.expectedAction ?? 'book_venue',
      options.expectedAmount ?? m.plannedCost
    );

    // Verify provider price stability before making commitments
    for (const step of m.steps) {
      const bound = step.costBound ?? 0;
      if (step.tool === 'fictional_venue_book') {
        const itemKey = (step.args?.itemKey as string) ?? 'garden_hall';
        const item = this.provider.getInventoryItem('venue', itemKey);
        if (item?.basePrice !== undefined && item.basePrice > bound) {
          throw new Error(
            `Provider price for ${step.title} has changed from INR ${bound.toLocaleString('en-IN')} to INR ${item.basePrice.toLocaleString('en-IN')}. Price change requires fresh authorization.`
          );
        }
      } else if (step.tool === 'fictional_catering_order') {
        const itemKey =
          step.args?.tier === 'veg_feast' ||
          step.args?.dietary === 'vegetarian' ||
          m.preferences?.dietaryPreferences?.toLowerCase().includes('veg')
            ? 'veg_feast'
            : 'gourmet_buffet';
        const price = this.provider.calculatePrice('catering', itemKey, m.preferences?.guests ?? 25);
        if (price.totalCost > bound) {
          throw new Error(
            `Provider price for ${step.title} has changed from INR ${bound.toLocaleString('en-IN')} to INR ${price.totalCost.toLocaleString('en-IN')}. Price change requires fresh authorization.`
          );
        }
      } else if (step.tool === 'fictional_cake_order') {
        const itemKey = (step.args?.itemKey as string) ?? 'milestone_truffle_3kg';
        const price = this.provider.calculatePrice('cake', itemKey);
        if (price.totalCost > bound) {
          throw new Error(
            `Provider price for ${step.title} has changed from INR ${bound.toLocaleString('en-IN')} to INR ${price.totalCost.toLocaleString('en-IN')}. Price change requires fresh authorization.`
          );
        }
      }
    }

    // Topological sort respecting dependencies
    const sortedSteps: MissionStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (s: MissionStep) => {
      if (visited.has(s.id)) return;
      if (visiting.has(s.id)) throw new Error(`Cycle detected involving step "${s.id}".`);
      visiting.add(s.id);
      for (const depId of s.dependencies ?? []) {
        const dep = m.steps.find((item) => item.id === depId);
        if (dep) visit(dep);
      }
      visiting.delete(s.id);
      visited.add(s.id);
      sortedSteps.push(s);
    };

    for (const step of m.steps) {
      visit(step);
    }

    m.state = 'executing';
    this.save();

    const executedSteps: MissionStep[] = [];

    try {
      for (const step of sortedSteps) {
        if (step.state === 'completed') {
          executedSteps.push(step);
          continue;
        }

        const stepCost = step.costBound ?? 0;
        const stepKey = `idem-${m.id}-v${m.version}-${step.id}`;
        m.executionIntent = {
          stepId: step.id,
          action: 'book',
          idempotencyKey: stepKey,
          status: 'started',
        };
        this.save();

        if (step.tool === 'fictional_venue_book') {
          const ref = `ATLAS-${m.id.slice(0, 8).toUpperCase()}`;
          const itemKey = (step.args?.itemKey as string) ?? 'garden_hall';
          const item = this.provider.getInventoryItem('venue', itemKey);
          if (item && !item.available) {
            throw new Error(`Inventory item "${item.name}" is currently unavailable.`);
          }
          this.provider.createOrConfirm({
            ref,
            occasion: m.goal,
            guests: m.preferences?.guests ?? 25,
            cost: stepCost,
            idempotencyKey: stepKey,
            serviceType: 'venue',
            itemKey,
          });
          m.executionIntent.status = 'effect_completed';
          this.save();

          this.append(m, 'fictional_venue_booked', stepCost, stepKey, step.id, {
            service: 'venue',
            ref,
            itemKey,
          });
          step.state = 'completed';
          m.executionIntent.status = 'ledger_written';
          this.save();
          executedSteps.push(step);
        } else if (step.tool === 'fictional_catering_order') {
          const ref = `ATLAS-${m.id.slice(0, 8).toUpperCase()}-CATERING`;
          const isVeg =
            step.args?.tier === 'veg_feast' ||
            step.args?.dietary === 'vegetarian' ||
            m.preferences?.dietaryPreferences?.toLowerCase().includes('veg');
          const itemKey = isVeg ? 'veg_feast' : 'gourmet_buffet';
          const item = this.provider.getInventoryItem('catering', itemKey);
          if (item && !item.available) {
            throw new Error(`Inventory item "${item.name}" is currently unavailable.`);
          }
          this.provider.createOrConfirm({
            ref,
            occasion: m.goal,
            guests: m.preferences?.guests ?? 25,
            cost: stepCost,
            idempotencyKey: stepKey,
            serviceType: 'catering',
            itemKey,
          });
          m.executionIntent.status = 'effect_completed';
          this.save();

          this.append(m, 'fictional_catering_booked', stepCost, stepKey, step.id, {
            service: 'catering',
            ref,
            itemKey,
          });
          step.state = 'completed';
          m.executionIntent.status = 'ledger_written';
          this.save();
          executedSteps.push(step);
        } else if (step.tool === 'fictional_cake_order') {
          const ref = `ATLAS-${m.id.slice(0, 8).toUpperCase()}-CAKE`;
          const itemKey = (step.args?.itemKey as string) ?? 'milestone_truffle_3kg';
          const item = this.provider.getInventoryItem('cake', itemKey);
          if (item && !item.available) {
            throw new Error(`Inventory item "${item.name}" is currently unavailable.`);
          }
          this.provider.createOrConfirm({
            ref,
            occasion: m.goal,
            guests: m.preferences?.guests ?? 25,
            cost: stepCost,
            idempotencyKey: stepKey,
            serviceType: 'cake',
            itemKey,
          });
          m.executionIntent.status = 'effect_completed';
          this.save();

          this.append(m, 'fictional_cake_booked', stepCost, stepKey, step.id, {
            service: 'cake',
            ref,
            itemKey,
          });
          step.state = 'completed';
          m.executionIntent.status = 'ledger_written';
          this.save();
          executedSteps.push(step);
        } else {
          // Informational / quote / review steps (e.g. fictional_catering_quote, fictional_cake_estimate)
          step.state = 'completed';
          m.executionIntent.status = 'ledger_written';
          this.save();
          executedSteps.push(step);
        }
      }
    } catch (err) {
      // SAGA COMPENSATION: roll back already executed steps in reverse dependency order
      m.state = 'compensating';
      this.save();

      for (let i = executedSteps.length - 1; i >= 0; i--) {
        const stepToRollback = executedSteps[i];
        if (
          stepToRollback.tool &&
          ['fictional_venue_book', 'fictional_catering_order', 'fictional_cake_order'].includes(
            stepToRollback.tool
          )
        ) {
          const serviceType: 'venue' | 'catering' | 'cake' =
            stepToRollback.tool === 'fictional_venue_book'
              ? 'venue'
              : stepToRollback.tool === 'fictional_catering_order'
              ? 'catering'
              : 'cake';
          const ref =
            serviceType === 'venue'
              ? `ATLAS-${m.id.slice(0, 8).toUpperCase()}`
              : serviceType === 'catering'
              ? `ATLAS-${m.id.slice(0, 8).toUpperCase()}-CATERING`
              : `ATLAS-${m.id.slice(0, 8).toUpperCase()}-CAKE`;
          const compKey = `idem-comp-${m.id}-v${m.version}-${stepToRollback.id}`;
          try {
            const cancelled = this.provider.cancel(ref, compKey);
            const refund = cancelled.refundAmount ?? (stepToRollback.costBound ?? 0);
            const actionName =
              serviceType === 'venue'
                ? 'fictional_venue_cancelled'
                : serviceType === 'catering'
                ? 'fictional_catering_cancelled'
                : 'fictional_cake_cancelled';
            this.append(m, actionName, -refund, compKey, stepToRollback.id, {
              refundPolicy: cancelled.cancellationPolicy,
              refundRate: cancelled.refundPolicyRate,
              service: serviceType,
              compensationReason: 'execution_failure',
            });
          } catch {
            // Ignore rollback errors to continue compensation
          }
        }
        stepToRollback.state = 'undone';
      }

      m.state = 'failed';
      m.executionIntent = undefined;
      m.costBreakdown = this.computeCostBreakdown(m);
      this.save();
      throw err;
    }

    m.state = 'completed';
    m.executionIntent = undefined;
    // Prepare single-use approval for undo with confirmation phrase "confirm cancellation"
    m.pendingApproval = this.approvals.createPendingApproval(
      m.id,
      'undo',
      0,
      m.version,
      'adult',
      'Compensate and cancel completed booking'
    );
    m.costBreakdown = this.computeCostBreakdown(m);
    this.save();
    return structuredClone(m);
  }

  /**
   * Undoes a completed booking with compensation saga in reverse dependency order.
   */
  undo(
    id: string,
    options?: {
      tokenOrPhrase?: string;
      role?: 'adult' | 'child';
    }
  ): Mission {
    const m = this.missions.find((item) => item.id === id);
    if (!m) throw new Error('Mission not found');

    if (m.state === 'undone') return structuredClone(m);
    if (m.state !== 'completed') {
      throw new Error(`Only completed bookings can be undone; current state is "${m.state}".`);
    }

    // Mandatory approval token verification for undo
    if (!options?.tokenOrPhrase || !options.tokenOrPhrase.trim()) {
      throw new ApprovalPolicyError(
        'Confirmation token or phrase is required to authorize "undo".',
        'TOKEN_INVALID'
      );
    }

    this.approvals.verifyAndConsume(
      id,
      options.tokenOrPhrase,
      options.role ?? 'adult',
      true,
      undefined,
      'undo'
    );

    m.state = 'compensating';
    this.save();

    // Reverse dependency order compensation (e.g. cake -> catering -> venue)
    for (let i = m.steps.length - 1; i >= 0; i--) {
      const step = m.steps[i];
      if (step.state !== 'completed') continue;

      if (
        step.tool &&
        ['fictional_venue_book', 'fictional_catering_order', 'fictional_cake_order'].includes(
          step.tool
        )
      ) {
        const serviceType: 'venue' | 'catering' | 'cake' =
          step.tool === 'fictional_venue_book'
            ? 'venue'
            : step.tool === 'fictional_catering_order'
            ? 'catering'
            : 'cake';
        const ref =
          serviceType === 'venue'
            ? `ATLAS-${m.id.slice(0, 8).toUpperCase()}`
            : serviceType === 'catering'
            ? `ATLAS-${m.id.slice(0, 8).toUpperCase()}-CATERING`
            : `ATLAS-${m.id.slice(0, 8).toUpperCase()}-CAKE`;

        const cancelKey = `idem-cancel-${m.id}-v${m.version}-${step.id}`;
        m.executionIntent = {
          stepId: step.id,
          action: 'cancel',
          idempotencyKey: cancelKey,
          status: 'started',
        };
        this.save();

        const cancelledBooking = this.provider.cancel(ref, cancelKey);
        m.executionIntent.status = 'effect_completed';
        this.save();

        const refundAmount: number = cancelledBooking.refundAmount ?? (step.costBound ?? 0);
        const actionName =
          serviceType === 'venue'
            ? 'fictional_venue_cancelled'
            : serviceType === 'catering'
            ? 'fictional_catering_cancelled'
            : 'fictional_cake_cancelled';

        this.append(m, actionName, -refundAmount, cancelKey, step.id, {
          refundPolicy: cancelledBooking.cancellationPolicy,
          refundRate: cancelledBooking.refundPolicyRate,
          service: serviceType,
          ref,
        });
        step.state = 'undone';
        m.executionIntent.status = 'ledger_written';
        this.save();
      } else {
        step.state = 'undone';
      }
    }

    m.state = 'undone';
    m.executionIntent = undefined;
    m.pendingApproval = undefined;
    m.costBreakdown = this.computeCostBreakdown(m);
    this.save();
    return structuredClone(m);
  }
}
