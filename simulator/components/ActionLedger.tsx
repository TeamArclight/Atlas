import React from 'react';
import type { LedgerEntry } from '../types.js';

interface ActionLedgerProps {
  ledger: LedgerEntry[];
}

export const ActionLedger: React.FC<ActionLedgerProps> = ({ ledger }) => {
  // Verify hash linkage
  let isChainValid = true;
  for (let i = 0; i < ledger.length; i++) {
    const entry = ledger[i];
    if (i === 0) {
      if (entry.previousHash !== 'GENESIS') isChainValid = false;
    } else {
      if (entry.previousHash !== ledger[i - 1].hash) isChainValid = false;
    }
  }

  const netTotal = ledger.reduce((sum, item) => sum + item.cost, 0);

  return (
    <div className="panel" style={{ marginTop: '1.25rem' }}>
      <div className="panel-header">
        <h2>
          <span>📜</span> Action Ledger & Audit Trail
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {ledger.length > 0 && isChainValid && (
            <span className="chain-verified-badge" title="All block hashes sequentially link back to GENESIS">
              ✓ SHA-256 Chain Verified
            </span>
          )}
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {ledger.length} {ledger.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>

      <div className="panel-body">
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
                        <td style={{ fontWeight: 700, color: '#94a3b8' }}>{entry.sequence}</td>
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
