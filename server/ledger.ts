import { createHash } from 'node:crypto';
import type { LedgerEntry, LedgerVerificationResult } from '../shared/contracts.js';

/**
 * Deterministically serializes any JavaScript object or primitive into canonical JSON.
 * Keys in objects are sorted lexicographically at every depth.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
  return '{' + entries.join(',') + '}';
}

export interface CanonicalLedgerPayload {
  version: number;
  sequence: number;
  previousHash: string;
  action: string;
  cost: number;
  timestamp: string;
  stepId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Computes a SHA-256 hash using the canonical v2 format.
 */
export function computeCanonicalV2Hash(entry: {
  sequence: number;
  previousHash: string;
  action: string;
  cost: number;
  timestamp: string;
  stepId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}): string {
  const payload: CanonicalLedgerPayload = {
    version: 2,
    sequence: entry.sequence,
    previousHash: entry.previousHash,
    action: entry.action,
    cost: entry.cost,
    timestamp: entry.timestamp,
    stepId: entry.stepId ?? null,
    idempotencyKey: entry.idempotencyKey ?? null,
    metadata: entry.metadata ?? null,
  };
  return createHash('sha256').update(canonicalJsonStringify(payload)).digest('hex');
}

/**
 * Computes a legacy v1 hash for backward compatibility.
 */
export function computeLegacyV1Hash(entry: Omit<LedgerEntry, 'hash'>): string {
  return createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

/**
 * Recomputes and cryptographically verifies every entry in the ledger chain.
 * Detects:
 * - Mutated/modified action, cost, timestamp, or metadata fields (hash mismatch)
 * - Broken hash links between blocks (previousHash mismatch)
 * - Reordered entries or missing sequences (gap or sequence violation)
 * - Classifies legacy vs canonical v2 entries
 */
export function verifyLedger(ledger: LedgerEntry[]): LedgerVerificationResult {
  const errors: string[] = [];
  const notice =
    'Notice: An unanchored local hash chain verifies internal consistency from GENESIS. It mathematically proves linkage and tamper-detection against modified fields, but cannot detect wholesale disk-level rollbacks or truncation without an external timestamp authority or hardware anchor.';

  if (!Array.isArray(ledger)) {
    return {
      valid: false,
      algorithm: 'sha256-canonical-v2',
      checkedEntries: 0,
      errors: ['Ledger is not an array.'],
      summary: 'Malformed ledger.',
      notice,
    };
  }

  if (ledger.length === 0) {
    return {
      valid: true,
      algorithm: 'sha256-canonical-v2',
      checkedEntries: 0,
      errors: [],
      summary: 'Empty ledger (0 entries); genesis ready.',
      notice,
    };
  }

  let hasLegacy = false;
  let tamperedIndex: number | undefined;

  for (let i = 0; i < ledger.length; i++) {
    const entry = ledger[i];
    const expectedSeq = i + 1;

    // 1. Sequence checks
    if (entry.sequence !== expectedSeq) {
      errors.push(`Sequence mismatch at entry index ${i}: expected #${expectedSeq}, got #${entry.sequence}.`);
      if (tamperedIndex === undefined) tamperedIndex = i;
    }

    // 2. Previous hash linkage
    const expectedPrev = i === 0 ? 'GENESIS' : ledger[i - 1].hash;
    if (entry.previousHash !== expectedPrev) {
      errors.push(
        `Linkage broken at sequence #${entry.sequence}: expected previousHash "${expectedPrev.slice(0, 8)}...", got "${entry.previousHash.slice(0, 8)}...".`
      );
      if (tamperedIndex === undefined) tamperedIndex = i;
    }

    // 3. Recompute hash
    const isV2 = entry.version === 2;
    if (!isV2) hasLegacy = true;

    let computedHash: string;
    if (isV2) {
      computedHash = computeCanonicalV2Hash(entry);
    } else {
      // Legacy check: entry without hash
      const { hash: _h, ...rest } = entry;
      computedHash = computeLegacyV1Hash(rest);
    }

    if (computedHash !== entry.hash) {
      errors.push(
        `Hash mismatch at sequence #${entry.sequence} (${entry.action}): stored hash "${entry.hash.slice(0, 8)}..." does not match recomputed hash "${computedHash.slice(0, 8)}...". Field mutation detected.`
      );
      if (tamperedIndex === undefined) tamperedIndex = i;
    }
  }

  const valid = errors.length === 0;
  const algorithm = hasLegacy ? 'sha256-legacy' : 'sha256-canonical-v2';
  const summary = valid
    ? `All ${ledger.length} entries cryptographically verified against ${algorithm} from GENESIS.`
    : `Verification failed with ${errors.length} integrity violations.`;

  return {
    valid,
    algorithm,
    checkedEntries: ledger.length,
    errors,
    tamperedEntryIndex: tamperedIndex,
    summary,
    notice,
  };
}
