import { randomUUID, randomBytes } from 'node:crypto';
import type { PendingApproval } from '../shared/contracts.js';

export class ApprovalPolicyError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'ROLE_UNAUTHORIZED'
      | 'TOKEN_EXPIRED'
      | 'TOKEN_INVALID'
      | 'NO_PENDING_APPROVAL'
      | 'VERSION_MISMATCH'
      | 'ACTION_MISMATCH'
  ) {
    super(message);
    this.name = 'ApprovalPolicyError';
  }
}

export class ApprovalManager {
  private approvals = new Map<string, PendingApproval>(); // Keyed by missionId

  createPendingApproval(
    missionId: string,
    action: string,
    amount: number,
    planVersionOrRole: number | 'adult' | 'child' = 1,
    roleOrTtl: 'adult' | 'child' | number = 'adult',
    actionDescription?: string,
    ttlSeconds = 300
  ): PendingApproval {
    let planVersion = 1;
    let role: 'adult' | 'child' = 'adult';
    let ttl = ttlSeconds;

    if (typeof planVersionOrRole === 'string') {
      role = planVersionOrRole;
      if (typeof roleOrTtl === 'number') {
        ttl = roleOrTtl;
      }
    } else {
      planVersion = planVersionOrRole;
      if (typeof roleOrTtl === 'string') {
        role = roleOrTtl;
      }
    }

    const token = randomBytes(4).toString('hex').toUpperCase(); // e.g. "A1B2C3D4"
    const confirmationPhrase =
      action === 'undo' || action === 'fictional_venue_cancel'
        ? 'confirm cancellation'
        : 'confirm booking';

    const approval: PendingApproval = {
      id: randomUUID(),
      missionId,
      planVersion,
      action,
      amount,
      approverRole: role,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      token,
      confirmationPhrase,
      actionDescription:
        actionDescription ??
        `${action} (plan v${planVersion}, INR ${amount.toLocaleString('en-IN')})`,
    };

    this.approvals.set(missionId, approval);
    return structuredClone(approval);
  }

  getPendingApproval(missionId: string): PendingApproval | undefined {
    const existing = this.approvals.get(missionId);
    if (!existing) return undefined;

    // Check expiration
    if (new Date(existing.expiresAt).getTime() < Date.now()) {
      this.approvals.delete(missionId);
      return undefined;
    }
    return structuredClone(existing);
  }

  invalidate(missionId: string): void {
    this.approvals.delete(missionId);
  }

  rehydrate(approval: PendingApproval): void {
    if (new Date(approval.expiresAt).getTime() > Date.now()) {
      this.approvals.set(approval.missionId, structuredClone(approval));
    }
  }

  verifyAndConsume(
    missionId: string,
    tokenOrPhrase?: string,
    role: 'adult' | 'child' = 'adult',
    consume = true,
    expectedPlanVersion?: number,
    expectedAction?: string,
    expectedAmount?: number
  ): PendingApproval {
    const pending = this.approvals.get(missionId);
    if (!pending) {
      throw new ApprovalPolicyError(
        'No active pending approval exists for this mission. Please request approval first.',
        'NO_PENDING_APPROVAL'
      );
    }

    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      this.approvals.delete(missionId);
      throw new ApprovalPolicyError(
        'Approval confirmation window has expired. Please initiate a new request.',
        'TOKEN_EXPIRED'
      );
    }

    // Version binding check
    if (expectedPlanVersion !== undefined && pending.planVersion !== expectedPlanVersion) {
      throw new ApprovalPolicyError(
        `Approval token was generated for plan version ${pending.planVersion}, but current plan is version ${expectedPlanVersion}. Plan revision invalidated previous approval.`,
        'VERSION_MISMATCH'
      );
    }

    // Action binding check
    if (expectedAction !== undefined && pending.action !== expectedAction) {
      throw new ApprovalPolicyError(
        `Approval token was generated for action "${pending.action}", but execution requested "${expectedAction}".`,
        'ACTION_MISMATCH'
      );
    }

    // Amount binding check: Prevent approving if the price/amount has changed!
    if (expectedAmount !== undefined && pending.amount !== expectedAmount) {
      throw new ApprovalPolicyError(
        `Approval token was generated for amount INR ${pending.amount.toLocaleString('en-IN')}, but requested execution amount is INR ${expectedAmount.toLocaleString('en-IN')}. Price change requires fresh authorization.`,
        'ACTION_MISMATCH'
      );
    }

    // Role policy check: Child cannot approve financial commitments
    if (role === 'child' && pending.amount > 0) {
      throw new ApprovalPolicyError(
        'Child role unauthorized: Financial commitments exceeding INR 0 require approval by an adult household member.',
        'ROLE_UNAUTHORIZED'
      );
    }

    // Mandatory token or phrase verification: Tokenless approvals are strictly forbidden
    if (!tokenOrPhrase || !tokenOrPhrase.trim()) {
      throw new ApprovalPolicyError(
        `Confirmation token or phrase is required to authorize "${pending.action}". Expected "${pending.confirmationPhrase}" or code "${pending.token}".`,
        'TOKEN_INVALID'
      );
    }

    const normalizedInput = tokenOrPhrase.trim().toLowerCase();
    const normalizedPhrase = pending.confirmationPhrase.toLowerCase();
    const normalizedToken = pending.token.toLowerCase();

    const matches =
      normalizedInput === normalizedPhrase ||
      normalizedInput === normalizedToken;

    if (!matches) {
      throw new ApprovalPolicyError(
        `Invalid confirmation token or phrase. Expected "${pending.confirmationPhrase}" or code "${pending.token}".`,
        'TOKEN_INVALID'
      );
    }

    // Consume the token so it cannot be reused
    if (consume) this.approvals.delete(missionId);
    return structuredClone(pending);
  }
}
