import React, { useState } from 'react';
import type { Mission } from '../types.js';
import { ActionLedger } from './ActionLedger.js';

interface MissionDetailsProps {
  mission: Mission | null;
  onApprove: (
    id: string,
    options?: { tokenOrPhrase?: string; role?: 'adult' | 'child'; planVersion?: number }
  ) => Promise<void>;
  onUndo: (
    id: string,
    options?: { tokenOrPhrase?: string; role?: 'adult' | 'child' }
  ) => Promise<void>;
  onRevise?: (
    id: string,
    changes: {
      budget?: number;
      guests?: number;
      eventDate?: string;
      dietaryPreferences?: string;
      notes?: string;
    }
  ) => Promise<void>;
  isApproving: boolean;
  isUndoing: boolean;
  actionError: string | null;
}

export const MissionDetails: React.FC<MissionDetailsProps> = ({
  mission,
  onApprove,
  onUndo,
  onRevise,
  isApproving,
  isUndoing,
  actionError,
}) => {
  const [selectedRole, setSelectedRole] = useState<'adult' | 'child'>('adult');
  const [tokenInput, setTokenInput] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revGuests, setRevGuests] = useState(25);
  const [revBudget, setRevBudget] = useState(40000);
  const [revDietary, setRevDietary] = useState('regular');
  const [isRevising, setIsRevising] = useState(false);

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
  const planVersion = mission.version ?? 1;

  const handleApplyRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRevise) return;
    setIsRevising(true);
    try {
      await onRevise(mission.id, {
        guests: revGuests,
        budget: revBudget,
        dietaryPreferences: revDietary,
      });
      setShowRevisionForm(false);
    } finally {
      setIsRevising(false);
    }
  };

  const handleApproveWithContext = () => {
    const token = tokenInput.trim() || mission.pendingApproval?.token;
    onApprove(mission.id, {
      tokenOrPhrase: token,
      role: selectedRole,
      planVersion: mission.version,
    });
  };

  const handleUndoWithContext = () => {
    const token =
      tokenInput.trim() ||
      mission.pendingApproval?.token ||
      mission.pendingApproval?.confirmationPhrase ||
      'confirm cancellation';
    onUndo(mission.id, {
      tokenOrPhrase: token,
      role: selectedRole,
    });
  };

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
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <span>MISSION ID: {mission.id}</span>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '4px',
                  fontWeight: 700,
                }}
              >
                PLAN V{planVersion}
              </span>
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

        {/* Structured Preferences Pill Row */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginTop: '0.6rem',
            marginBottom: '0.85rem',
            fontSize: '0.75rem',
          }}
        >
          <span
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-subtle)',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              color: '#cbd5e1',
            }}
          >
            👥 <strong>Guests:</strong> {mission.preferences?.guests ?? 25}
          </span>
          <span
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-subtle)',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              color: '#cbd5e1',
            }}
          >
            📅 <strong>Date:</strong> {mission.preferences?.eventDate ?? 'Upcoming Saturday'}
          </span>
          <span
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-subtle)',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              color: '#cbd5e1',
              textTransform: 'capitalize',
            }}
          >
            🥗 <strong>Dietary:</strong> {mission.preferences?.dietaryPreferences ?? 'regular'}
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
            <div className="meta-box-label">Cost Breakdown</div>
            <div className="meta-box-value" style={{ color: '#a78bfa', fontSize: '0.8rem' }}>
              {mission.costBreakdown ? (
                <span>
                  V: ₹{((mission.costBreakdown.venueCommitted || 12000) / 1000).toFixed(0)}k | C: ₹
                  {(mission.costBreakdown.cateringCommitted / 1000).toFixed(0)}k | K: ₹
                  {(mission.costBreakdown.cakeCommitted / 1000).toFixed(0)}k
                </span>
              ) : (
                'Venue Only (₹12k)'
              )}
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

      {/* Plan Revision Toolbar / Form */}
      {mission.state === 'awaiting_approval' && (
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 600 }}>
              ✏️ Plan Revision Controls
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setRevGuests(mission.preferences?.guests ?? 25);
                setRevBudget(mission.budget);
                setRevDietary(mission.preferences?.dietaryPreferences ?? 'regular');
                setShowRevisionForm((prev) => !prev);
              }}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              {showRevisionForm ? 'Close Editor' : 'Modify Guests / Budget'}
            </button>
          </div>

          {showRevisionForm && (
            <form onSubmit={handleApplyRevision} style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Guests Count:</label>
                  <input
                    type="number"
                    value={revGuests}
                    onChange={(e) => setRevGuests(Number(e.target.value))}
                    min={5}
                    max={50}
                    style={{
                      width: '100%',
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      color: '#f8fafc',
                      padding: '0.35rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Budget (INR):</label>
                  <input
                    type="number"
                    value={revBudget}
                    onChange={(e) => setRevBudget(Number(e.target.value))}
                    step={1000}
                    min={12000}
                    style={{
                      width: '100%',
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      color: '#f8fafc',
                      padding: '0.35rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Dietary Menu:</label>
                  <select
                    value={revDietary}
                    onChange={(e) => setRevDietary(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      color: '#f8fafc',
                      padding: '0.35rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                    }}
                  >
                    <option value="regular">Standard Gourmet</option>
                    <option value="vegetarian">Pure Vegetarian Feast</option>
                    <option value="vegan">Vegan Specialty</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.6rem' }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isRevising}
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.8rem' }}
                >
                  {isRevising ? 'Revising Plan...' : 'Apply Revision & Invalidate Old Tokens'}
                </button>
              </div>
            </form>
          )}

          {/* Revision History List */}
          {mission.revisions && mission.revisions.length > 0 && (
            <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                Revision History ({mission.revisions.length}):
              </div>
              {mission.revisions.map((rev) => (
                <div
                  key={rev.version}
                  style={{
                    fontSize: '0.72rem',
                    color: '#cbd5e1',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '0.3rem 0.5rem',
                    borderRadius: '4px',
                    marginBottom: '0.25rem',
                  }}
                >
                  <strong style={{ color: '#38bdf8' }}>v{rev.version}</strong>: {rev.summary} (at{' '}
                  {new Date(rev.timestamp).toLocaleTimeString()})
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Approval / Undo Controls */}
      {mission.state === 'awaiting_approval' && (
        <div className="approval-callout" role="alert">
          <div className="approval-callout-header">
            <span style={{ fontSize: '1.25rem' }}>🛡️</span>
            <div>
              <div className="approval-callout-title">Explicit Contextual Approval Required</div>
              <div style={{ fontSize: '0.75rem', color: '#fef08a' }}>
                Token bound to Mission #{mission.id.slice(0, 8)}, Plan Version {planVersion}, Action:{' '}
                <code>{mission.pendingApproval?.action ?? 'book_venue'}</code>
              </div>
            </div>
          </div>

          <p className="approval-callout-text">
            Alexa+ policy mandates explicit human approval before committing financial reservations.
            Approving will reserve <strong>Garden Hall</strong> for <strong>INR {mission.plannedCost.toLocaleString('en-IN')}</strong>.
            This action runs in simulated sandbox mode — no real credit card or money will be moved.
          </p>

          {/* Token & Role Verification Form */}
          <div
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(254, 240, 138, 0.25)',
              borderRadius: '6px',
              padding: '0.75rem',
              marginTop: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: '#fef08a', display: 'block', marginBottom: '0.2rem' }}>
                  Household Role:
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as 'adult' | 'child')}
                  style={{
                    width: '100%',
                    background: '#0b1120',
                    border: '1px solid #475569',
                    color: '#f8fafc',
                    padding: '0.35rem',
                    borderRadius: '4px',
                    fontSize: '0.78rem',
                  }}
                >
                  <option value="adult">Adult (Authorized)</option>
                  <option value="child">Child (Unauthorized for spending)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: '#fef08a', display: 'block', marginBottom: '0.2rem' }}>
                  Confirmation Token / Phrase:
                </label>
                <input
                  type="text"
                  placeholder={mission.pendingApproval?.token ?? 'A1B2C3D4'}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0b1120',
                    border: '1px solid #475569',
                    color: '#f8fafc',
                    padding: '0.35rem',
                    borderRadius: '4px',
                    fontSize: '0.78rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>
              Voice phrase:{' '}
              <code style={{ color: '#fde047' }}>
                "{mission.pendingApproval?.confirmationPhrase ?? 'confirm booking'}"
              </code>{' '}
              | Token code:{' '}
              <code style={{ color: '#38bdf8' }}>{mission.pendingApproval?.token ?? 'GEN-TOKEN'}</code>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-approve"
              onClick={handleApproveWithContext}
              disabled={isApproving}
              aria-busy={isApproving}
            >
              {isApproving
                ? '⏳ Committing Approval via MCP...'
                : `✓ Approve & Commit Booking (₹${mission.plannedCost.toLocaleString('en-IN')})`}
            </button>
            <span style={{ fontSize: '0.75rem', color: '#fef08a' }}>
              Single-use token automatically invalidated on execution.
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
              🎉 Fictional Booking Executed & Confirmed (Plan v{planVersion})
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#99f6e4' }}>
              Garden Hall is reserved for {mission.preferences?.guests ?? 25} guests. Entry #{mission.ledger.length} hashed in Action Ledger.
            </p>
          </div>

          <button
            type="button"
            className="btn-undo"
            onClick={handleUndoWithContext}
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
            The fictional booking has been cancelled and compensated in reverse dependency order. A reversal entry has been recorded
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
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Multi-Step Dependency Order • Plan v{planVersion}
          </span>
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
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      Tool: <code>{step.tool ?? 'internal'}</code> | Bound: ₹{(step.costBound ?? 0).toLocaleString('en-IN')}
                    </div>
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
