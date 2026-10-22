import React, { useRef, useEffect, useState } from 'react';
import type { Mission } from '../types.js';
import { BrowserEvidencePanel } from './BrowserEvidencePanel.js';

interface VenueSimulatorProps {
  mission: Mission | null;
}

export const VenueSimulator: React.FC<VenueSimulatorProps> = ({ mission }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showA11ySnapshot, setShowA11ySnapshot] = useState(false);

  // Sync state to iframe via postMessage whenever selected mission changes or updates
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;

    const syncMessage = {
      type: 'ATLAS_SYNC_MISSION',
      mission: mission
        ? {
            id: mission.id,
            state: mission.state,
            goal: mission.goal,
            plannedCost: mission.plannedCost,
          }
        : null,
    };

    const sendSync = () => {
      try {
        iframe.contentWindow?.postMessage(syncMessage, '*');
      } catch (err) {
        console.warn('Could not postMessage to venue iframe:', err);
      }
    };

    // If iframe already loaded, send immediately; otherwise listen for onload
    sendSync();
    iframe.addEventListener('load', sendSync);
    return () => iframe.removeEventListener('load', sendSync);
  }, [mission]);

  const venueStatus = !mission
    ? 'available'
    : mission.state === 'completed'
    ? 'reserved'
    : mission.state === 'undone'
    ? 'cancelled'
    : 'available';

  const iframeSrc = `/simulator/sites/fictional-venue.html?status=${venueStatus}&ref=ATLAS-${
    mission ? mission.id.slice(0, 8).toUpperCase() : 'DEMO'
  }`;

  return (
    <div className="panel" style={{ width: '100%' }}>
      <div className="panel-header">
        <div>
          <h2>
            <span>🌐</span> Fictional Venue Portal (The Grand Orchid)
          </h2>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            Visual Simulation View • Target for upcoming Playwright browser worker
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowA11ySnapshot((prev) => !prev)}
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
          >
            {showA11ySnapshot ? '👁️ Hide A11y Tree' : '🔍 Inspect A11y Tree'}
          </button>
          <a
            href={iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', textDecoration: 'none' }}
          >
            ↗ Open Tab
          </a>
        </div>
      </div>

      <div className="panel-body" style={{ padding: '0.75rem' }}>
        <BrowserEvidencePanel missionId={mission?.id} />
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            padding: '0.6rem 0.85rem',
            borderRadius: '6px',
            marginBottom: '0.75rem',
            fontSize: '0.78rem',
            color: '#bae6fd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            <strong>Architecture Notice:</strong> Codex will own the headless Playwright worker.
            This viewport visualizes the accessible DOM tree and state transitions.
          </div>
          <span
            className={`badge ${
              venueStatus === 'reserved'
                ? 'badge-status-completed'
                : venueStatus === 'cancelled'
                ? 'badge-status-undone'
                : 'badge-status-awaiting'
            }`}
          >
            Venue State: {venueStatus.toUpperCase()}
          </span>
        </div>

        {showA11ySnapshot ? (
          <div
            style={{
              background: '#060a12',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '1rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#93c5fd',
              maxHeight: '480px',
              overflowY: 'auto',
            }}
          >
            <div style={{ color: '#f59e0b', marginBottom: '0.5rem', fontWeight: 700 }}>
              // Playwright MCP Accessibility Snapshot (Simulated)
            </div>
            <pre>{`[RootWebArea] The Grand Orchid | Garden Hall Venue Booking
├── [Banner] role="note" aria-label="Demo Disclaimer"
├── [Heading level=1] "The Grand Orchid Residences & Halls"
├── [Status] role="status" data-testid="booking-status-badge" -> "${
              venueStatus === 'reserved'
                ? '● Booked / Confirmed'
                : venueStatus === 'cancelled'
                ? '● Cancelled & Refunded'
                : '● Available'
            }"
├── [Article] aria-labelledby="venue-title"
│   ├── [Heading level=2] "Garden Hall (Pavilion B)" data-testid="venue-name"
│   ├── [Text] "Capacity: 20 - 35 Guests" data-testid="venue-capacity"
│   └── [Text] "Base Rate: INR 12,000 / evening" data-testid="venue-price"
├── [Form] aria-label="Venue Reservation Form"
│   ├── [Textbox] aria-label="Occasion" data-testid="input-occasion" value="Dad's 60th Birthday Celebration"
│   ├── [Spinbutton] aria-label="Guest Count" data-testid="input-guests" value="25"
│   ├── [Textbox] aria-label="Event Date" data-testid="input-date" value="Upcoming Saturday"
│   ├── [Button] role="button" data-testid="btn-reserve" aria-label="Confirm Booking" disabled=${venueStatus === 'reserved'}
│   └── [Button] role="button" data-testid="btn-cancel" aria-label="Cancel Reservation" disabled=${venueStatus !== 'reserved'}
└── [Region] role="region" aria-live="polite"
    └── ${
      venueStatus === 'reserved'
        ? '[Heading level=3] "Reservation Confirmed: ATLAS-' + (mission ? mission.id.slice(0, 8).toUpperCase() : 'DEMO') + '"'
        : venueStatus === 'cancelled'
        ? '[Heading level=3] "Reservation Cancelled & Compensated"'
        : '[Empty]'
    }`}</pre>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title="The Grand Orchid Fictional Venue Portal"
            className="venue-preview-frame"
          />
        )}
      </div>
    </div>
  );
};
