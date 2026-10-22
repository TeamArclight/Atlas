import React from 'react';
import type { Mission } from '../types.js';
import { ActionLedger } from './ActionLedger.js';

interface MissionDetailsProps {
  mission: Mission | null;
  onApprove: (id: string) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
  isApproving: boolean;
  isUndoing: boolean;
  actionError: string | null;
}

export const MissionDetails: React.FC<MissionDetailsProps> = ({
  mission,
  onApprove,
  onUndo,
  isApproving,
  isUndoing,
  actionError,
}) => {
  if (!mission) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <div className="empty-state-title">No Mission Selected</div>
            <p style={{ fontSize: '0.85rem' }}>
              Select a mission from the list or create a new mission to view its plan, timeline, and approval controls.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const budgetPct = Math.min(100, Math.round((mission.plannedCost / mission.budget) * 100));
  const remainingBudget = Math.max(0, mission.budget - mission.plannedCost);

  return (
    <div>
      {/* Mission Hero Card */}
      <div className="mission-hero">
        <div className="mission-title-row">
          <div>
            <div
              style={{
                fontSize: '0.72rem',
                color: '#38bdf8',
                fontFamily: 'var(--font-mono)',
                marginBottom: '0.2rem',
              }}
            >
              MISSION ID: {mission.id}
            </div>
            <h1 className="mission-goal-text">{mission.goal}</h1>
          </div>

          <span
            className={`badge ${
              mission.state === 'awaiting_approval'
                ? 'badge-status-awaiting'
                : mission.state === 'completed'
                ? 'badge-status-completed'
                : 'badge-status-undone'
            }`}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
          >
            {mission.state === 'awaiting_approval'
              ? '● Awaiting User Approval'
              : mission.state === 'completed'
              ? '✓ Execution Completed'
              : '↩ Undone & Compensated'}
          </span>
        </div>

        {/* Budget & Cost Metrics */}
        <div className="mission-meta-grid">
          <div className="meta-box">
            <div className="meta-box-label">Total Budget</div>
            <div className="meta-box-value">₹{mission.budget.toLocaleString('en-IN')}</div>
          </div>
          <div className="meta-box">
            <div className="meta-box-label">Planned Cost</div>
            <div className="meta-box-value" style={{ color: '#fbbf24' }}>
              ₹{mission.plannedCost.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="meta-box">
            <div className="meta-box-label">Remaining Buffer</div>
            <div className="meta-box-value" style={{ color: '#34d399' }}>
              ₹{remainingBudget.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="meta-box">
            <div className="meta-box-label">Mode</div>
            <div className="meta-box-value" style={{ color: '#a78bfa', fontSize: '0.85rem' }}>
              Simulated Fictional
            </div>
          </div>
        </div>

        {/* Budget Bar */}
        <div className="budget-progress-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8' }}>
            <span>Planned Commitment ({budgetPct}% of Budget)</span>
            <span>₹{mission.plannedCost.toLocaleString('en-IN')} / ₹{mission.budget.toLocaleString('en-IN')}</span>
          </div>
          <div className="budget-bar-track">
            <div className="budget-bar-fill" style={{ width: `${budgetPct}%` }} />
          </div>
        </div>
      </div>

      {/* Action Error Banner if any */}
      {actionError && (
        <div
          style={{
            background: 'var(--accent-red-bg)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            color: '#fda4af',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius)',
            marginBottom: '1rem',
            fontSize: '0.85rem',
          }}
        >
          ⚠️ {actionError}
        </div>
      )}

      {/* Approval / Undo Controls */}
      {mission.state === 'awaiting_approval' && (
        <div className="approval-callout" role="alert">
          <div className="approval-callout-header">
            <span style={{ fontSize: '1.25rem' }}>🛡️</span>
            <div className="approval-callout-title">Explicit User Approval Required</div>
          </div>
          <p className="approval-callout-text">
            Alexa+ policy mandates explicit approval before committing financial or reservation actions.
            Approving will reserve <strong>Garden Hall</strong> for <strong>INR 12,000</strong>.
            This action runs in simulated sandbox mode — no real credit card or money will be moved.
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-approve"
              onClick={() => onApprove(mission.id)}
              disabled={isApproving}
              aria-busy={isApproving}
            >
              {isApproving ? '⏳ Committing Approval via MCP...' : '✓ Approve & Commit Booking (₹12,000)'}
            </button>
            <span style={{ fontSize: '0.75rem', color: '#fef08a' }}>
              Repeated clicks safely disabled while pending.
            </span>
          </div>
        </div>
      )}

      {mission.state === 'completed' && (
        <div
          style={{
            background: 'var(--accent-teal-bg)',
            border: '1px solid var(--accent-teal-border)',
            borderRadius: 'var(--radius)',
            padding: '1.1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h3 style={{ fontSize: '0.95rem', color: '#2dd4bf', marginBottom: '0.25rem' }}>
              🎉 Fictional Booking Executed & Confirmed
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#99f6e4' }}>
              Garden Hall is reserved for 25 people. Entry #1 hashed in Action Ledger.
            </p>
          </div>

          <button
            type="button"
            className="btn-undo"
            onClick={() => onUndo(mission.id)}
            disabled={isUndoing}
            aria-busy={isUndoing}
          >
            {isUndoing ? '⏳ Compensating via MCP...' : '↩ Compensate / Undo Booking'}
          </button>
        </div>
      )}

      {mission.state === 'undone' && (
        <div
          style={{
            background: 'var(--accent-purple-bg)',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            borderRadius: 'var(--radius)',
            padding: '1.1rem',
            marginBottom: '1.25rem',
          }}
        >
          <h3 style={{ fontSize: '0.95rem', color: '#d8b4fe', marginBottom: '0.25rem' }}>
            ↩ Mission Compensated (Undone)
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#e9d5ff' }}>
            The fictional booking has been cancelled and compensated. A reversal entry of -₹12,000 has been recorded
            with cryptographic hash linkage. Net impact is ₹0.
          </p>
        </div>
      )}

      {/* Steps Checklist Timeline */}
      <div className="panel">
        <div className="panel-header">
          <h2>
            <span>📝</span> Mission Execution Steps ({mission.steps.length})
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Deterministic Scenario</span>
        </div>

        <div className="panel-body">
          <div className="steps-container">
            {mission.steps.map((step, idx) => (
              <div key={step.id} className="step-card">
                <div className="step-left">
                  <div className={`step-number ${step.state === 'completed' ? 'completed' : ''}`}>
                    {idx + 1}
                  </div>
                  <div>
                    <div className="step-title">{step.title}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Step ID: {step.id}</div>
                  </div>
                </div>

                <span
                  className={`badge ${
                    step.state === 'completed'
                      ? 'badge-status-completed'
                      : step.state === 'undone'
                      ? 'badge-status-undone'
                      : 'badge-status-awaiting'
                  }`}
                >
                  {step.state === 'completed'
                    ? '✓ Completed'
                    : step.state === 'undone'
                    ? '↩ Undone'
                    : '⏳ Pending Approval'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Ledger Component */}
      <ActionLedger ledger={mission.ledger} />
    </div>
  );
};
