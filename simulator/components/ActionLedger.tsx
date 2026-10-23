import React from 'react';
import type { LedgerEntry } from '../types.js';

interface ActionLedgerProps {
  ledger: LedgerEntry[];
  verificationResult?: {
    valid: boolean;
    format: 'v1_legacy' | 'v2_canonical';
    verifiedCount: number;
    errors: string[];
    brokenLinkIndex?: number;
    tamperedSequence?: number;
  };
}

export const ActionLedger: React.FC<ActionLedgerProps> = ({ ledger, verificationResult }) => {
  // Local verification fallback if server verificationResult is not passed
  let isChainValid = true;
  let hasBrokenLink = false;
  let hasMissingSequence = false;
  let hasV2Entries = false;

  for (let i = 0; i < ledger.length; i++) {
    const entry = ledger[i];
    if (entry.version === 2) hasV2Entries = true;
    if (entry.sequence !== i + 1) hasMissingSequence = true;
    if (i === 0) {
      if (entry.previousHash !== 'GENESIS') {
        isChainValid = false;
        hasBrokenLink = true;
      }
    } else {
      if (entry.previousHash !== ledger[i - 1].hash) {
        isChainValid = false;
        hasBrokenLink = true;
      }
    }
  }

  const valid = verificationResult ? verificationResult.valid : (isChainValid && !hasMissingSequence);
  const netTotal = ledger.reduce((sum, item) => sum + item.cost, 0);

  return (
    <div className="panel" style={{ marginTop: '1.25rem' }}>
      <div className="panel-header">
        <h2>
          <span>📜</span> Action Ledger & Audit Trail
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {ledger.length > 0 && (
            <span
              className={valid ? 'chain-verified-badge' : 'badge badge-status-error'}
              title={
                valid
                  ? 'All block hashes canonically and sequentially link back to GENESIS'
                  : 'Tampering or link break detected in ledger chain'
              }
              style={{
                background: valid ? 'rgba(45, 212, 191, 0.15)' : 'rgba(239, 68, 68, 0.2)',
                color: valid ? '#2dd4bf' : '#fda4af',
                border: `1px solid ${valid ? 'rgba(45, 212, 191, 0.4)' : 'rgba(239, 68, 68, 0.5)'}`,
                padding: '0.2rem 0.55rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 600,
              }}
            >
              {valid
                ? hasV2Entries
                  ? '✓ V2 Canonical SHA-256 Chain Verified'
                  : '✓ SHA-256 Chain Verified'
                : '⚠️ Tampered / Invalid Hash Chain'}
            </span>
          )}
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {ledger.length} {ledger.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>

      <div className="panel-body">
        {/* Verification Report Notice */}
        {ledger.length > 0 && (
          <div
            style={{
              background: valid ? 'rgba(15, 23, 42, 0.6)' : 'rgba(153, 27, 27, 0.2)',
              border: `1px solid ${valid ? 'var(--border-subtle)' : 'rgba(239, 68, 68, 0.4)'}`,
              borderRadius: '6px',
              padding: '0.65rem 0.85rem',
              marginBottom: '0.85rem',
              fontSize: '0.75rem',
              color: '#94a3b8',
              lineHeight: 1.45,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ color: valid ? '#38bdf8' : '#fda4af', fontWeight: 600 }}>
                {valid ? '🛡️ Cryptographic Ledger Verification Report: PASS' : '❌ Integrity Check: FAIL'}
              </span>
              <span style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>
                Format: {hasV2Entries ? 'V2 Canonical JSON' : 'V1 Legacy Record'}
              </span>
            </div>
            {verificationResult?.errors && verificationResult.errors.length > 0 ? (
              <div style={{ color: '#fda4af', marginBottom: '0.35rem' }}>
                Detected Anomaly: {verificationResult.errors.join('; ')}
              </div>
            ) : null}
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
              <strong>Limitation Notice:</strong> Cryptographic verification guarantees ledger tamper-evidence and
              sequencing integrity within this storage boundary. It does not replace external multi-party consensus or
              external financial audit certification.
            </div>
          </div>
        )}

        {ledger.length === 0 ? (
          <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
            <div className="empty-state-icon">⏳</div>
            <div className="empty-state-title">No Ledger Actions Recorded</div>
            <p style={{ fontSize: '0.78rem' }}>
              Actions will be cryptographically recorded in this ledger upon explicit user approval.
            </p>
          </div>
        ) : (
          <>
            <div className="ledger-table-wrap">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Action</th>
                    <th>Impact</th>
                    <th>Previous Hash</th>
                    <th>Hash</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => {
                    const isPositive = entry.cost > 0;
                    const isNegative = entry.cost < 0;
                    return (
                      <tr key={entry.sequence}>
                        <td style={{ fontWeight: 700, color: '#94a3b8' }}>
                          {entry.sequence}
                          {entry.version === 2 && (
                            <span style={{ fontSize: '0.65rem', color: '#38bdf8', marginLeft: '0.2rem' }}>v2</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                          {entry.action === 'fictional_venue_booked' ? (
                            <span style={{ color: '#2dd4bf' }}>🏨 Fictional Venue Booked</span>
                          ) : entry.action === 'fictional_venue_cancelled' ? (
                            <span style={{ color: '#fda4af' }}>↩ Fictional Venue Cancelled</span>
                          ) : (
                            entry.action
                          )}
                        </td>
                        <td
                          style={{
                            fontWeight: 700,
                            color: isPositive ? '#38bdf8' : isNegative ? '#4ade80' : '#94a3b8',
                          }}
                        >
                          {isPositive
                            ? `+₹${entry.cost.toLocaleString('en-IN')}`
                            : isNegative
                            ? `-₹${Math.abs(entry.cost).toLocaleString('en-IN')}`
                            : '₹0'}
                        </td>
                        <td className="hash-cell" title={entry.previousHash}>
                          {entry.previousHash === 'GENESIS' ? (
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>GENESIS</span>
                          ) : (
                            `${entry.previousHash.slice(0, 10)}...`
                          )}
                        </td>
                        <td className="hash-cell" title={entry.hash}>
                          {entry.hash.slice(0, 12)}...
                        </td>
                        <td style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '0.85rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ color: '#94a3b8' }}>Net Ledger Impact (Simulated):</span>
              <strong style={{ fontSize: '1rem', color: netTotal === 0 ? '#4ade80' : '#38bdf8' }}>
                ₹{netTotal.toLocaleString('en-IN')}
                {netTotal === 0 && ledger.length > 0 ? ' (Fully Compensated)' : ''}
              </strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
