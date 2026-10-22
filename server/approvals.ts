import { randomUUID, randomBytes } from 'node:crypto';
import type { PendingApproval } from '../shared/contracts.js';

export class ApprovalPolicyError extends Error {
  constructor(message: string, public readonly code: 'ROLE_UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'NO_PENDING_APPROVAL') {
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
    role: 'adult' | 'child' = 'adult',
    ttlSeconds = 300
  ): PendingApproval {
    const token = randomBytes(4).toString('hex').toUpperCase(); // e.g. "A1B2C3D4"
    const confirmationPhrase = action === 'undo' || action === 'fictional_venue_cancel'
      ? 'confirm cancellation'
      : 'confirm booking';

    const approval: PendingApproval = {
      id: randomUUID(),
      missionId,
      action,
      amount,
      approverRole: role,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      token,
      confirmationPhrase,
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

  verifyAndConsume(
    missionId: string,
    tokenOrPhrase?: string,
    role: 'adult' | 'child' = 'adult',
    consume = true
  ): PendingApproval {
    const pending = this.approvals.get(missionId);
    if (!pending) {
      throw new ApprovalPolicyError(
        'No active pending approval exists for this mission.',
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

    // Role policy check: Child cannot approve financial commitments
    if (role === 'child' && pending.amount > 0) {
      throw new ApprovalPolicyError(
        'Child role unauthorized: Financial bookings exceeding INR 0 require approval by an adult household member.',
        'ROLE_UNAUTHORIZED'
      );
    }

    // If a token or phrase was provided, verify it
    if (tokenOrPhrase) {
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
    }

    // Consume the token so it cannot be reused
    if (consume) this.approvals.delete(missionId);
    return structuredClone(pending);
  }
}
