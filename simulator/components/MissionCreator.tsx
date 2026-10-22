import React, { useState } from 'react';

interface MissionCreatorProps {
  goal: string;
  budget: number;
  onGoalChange: (val: string) => void;
  onBudgetChange: (val: number) => void;
  onSubmit: () => Promise<void>;
  isCreating: boolean;
  connected: boolean;
}

export const MissionCreator: React.FC<MissionCreatorProps> = ({
  goal,
  budget,
  onGoalChange,
  onBudgetChange,
  onSubmit,
  isCreating,
  connected,
}) => {
  const [budgetTouched, setBudgetTouched] = useState(false);

  const isBudgetValid = Number.isSafeInteger(budget) && budget >= 12000;
  const isGoalValid = goal.trim().length > 0;
  const canSubmit = isBudgetValid && isGoalValid && !isCreating && connected;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit();
  };

  return (
    <div className="panel" style={{ marginBottom: '1.25rem' }}>
      <div className="panel-header">
        <h2>
          <span>🎯</span> Create Household Mission
        </h2>
        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Tool: create_mission</span>
      </div>

      <div className="panel-body">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="mission-goal-input">
              Mission Goal
            </label>
            <textarea
              id="mission-goal-input"
              className="form-textarea"
              value={goal}
              onChange={(e) => onGoalChange(e.target.value)}
              placeholder="e.g. Plan Dad's 60th birthday for Saturday, 25 people, budget INR 40,000."
              disabled={isCreating}
              rows={3}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="mission-budget-input">
              Total Budget (INR)
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              >
                ₹
              </span>
              <input
                id="mission-budget-input"
                type="number"
                className={`form-input ${budgetTouched && !isBudgetValid ? 'error' : ''}`}
                value={budget || ''}
                onChange={(e) => {
                  setBudgetTouched(true);
                  onBudgetChange(parseInt(e.target.value, 10) || 0);
                }}
                onBlur={() => setBudgetTouched(true)}
                placeholder="40000"
                min={12000}
                step={1000}
                disabled={isCreating}
                style={{ paddingLeft: '26px' }}
                required
              />
            </div>

            {budgetTouched && !isBudgetValid ? (
              <span className="validation-hint error">
                ⚠️ Minimum budget for this fictional venue scenario is ₹12,000.
              </span>
            ) : (
              <span className="validation-hint">
                Deterministic scenario requires at least ₹12,000 for Garden Hall reservation.
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={!canSubmit}
            aria-busy={isCreating}
          >
            {isCreating ? (
              <>
                <span className="dot dot-connecting" style={{ width: '6px', height: '6px' }} />
                <span>Formulating Plan via MCP...</span>
              </>
            ) : (
              <>
                <span>🚀 Plan & Initialize Mission</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
