import React from 'react';
import type { Mission } from '../types.js';

interface MissionListProps {
  missions: Mission[];
  selectedMissionId: string | null;
  onSelectMission: (id: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export const MissionList: React.FC<MissionListProps> = ({
  missions,
  selectedMissionId,
  onSelectMission,
  isLoading,
  onRefresh,
}) => {
  const getBadgeClass = (state: Mission['state']) => {
    switch (state) {
      case 'awaiting_approval':
        return 'badge-status-awaiting';
      case 'completed':
        return 'badge-status-completed';
      case 'undone':
        return 'badge-status-undone';
      default:
        return '';
    }
  };

  const getStatusLabel = (state: Mission['state']) => {
    switch (state) {
      case 'awaiting_approval':
        return 'Approval Pending';
      case 'completed':
        return 'Booked';
      case 'undone':
        return 'Compensated';
      default:
        return state;
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>
          <span>📋</span> Saved Missions ({missions.length})
        </h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={onRefresh}
          disabled={isLoading}
          style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
          title="Reload missions from MCP server"
        >
          {isLoading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      <div className="panel-body" style={{ padding: '0.75rem' }}>
        {missions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">No Missions Saved</div>
            <p style={{ fontSize: '0.78rem' }}>
              Create your first mission using the form above.
            </p>
          </div>
        ) : (
          <div className="mission-list">
            {missions.map((m) => {
              const isSelected = m.id === selectedMissionId;
              return (
                <div
                  key={m.id}
                  className={`mission-item ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectMission(m.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectMission(m.id);
                    }
                  }}
                >
                  <div className="mission-item-header">
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.7rem',
                        color: '#38bdf8',
                      }}
                    >
                      #{m.id.slice(0, 8)}
                    </span>
                    <span className={`badge ${getBadgeClass(m.state)}`}>
                      {getStatusLabel(m.state)}
                    </span>
                  </div>

                  <div className="mission-item-goal" title={m.goal}>
                    {m.goal}
                  </div>

                  <div className="mission-item-footer">
                    <span>Budget: ₹{m.budget.toLocaleString('en-IN')}</span>
                    <span>Cost: ₹{m.plannedCost.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
