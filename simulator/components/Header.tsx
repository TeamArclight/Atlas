import React from 'react';
import type { ServerHealth } from '../types.js';

interface HeaderProps {
  connected: boolean;
  connecting: boolean;
  health: ServerHealth | null;
  activeTab: 'mission' | 'venue' | 'protocol' | 'skills';
  onTabChange: (tab: 'mission' | 'venue' | 'protocol' | 'skills') => void;
  onLoadPreset: () => void;
  voiceActive: boolean;
  onToggleVoice: () => void;
  hasSpeechSupport: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  connected,
  connecting,
  health,
  activeTab,
  onTabChange,
  onLoadPreset,
  voiceActive,
  onToggleVoice,
  hasSpeechSupport,
}) => {
  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-title">
          <div className="brand-logo-icon">A</div>
          <span>Atlas</span>
        </div>

        <div className="brand-badges">
          <span className="badge badge-alexa" title="Amazon Developer Hackathon Alexa+ Track">
            Alexa+ Simulator
          </span>
          <span className="badge badge-simulated" title="Simulated environment - no real financial transactions">
            Fictional Services
          </span>
        </div>
      </div>

      <nav className="nav-tabs" aria-label="Simulator Views">
        <button
          className={`nav-tab-btn ${activeTab === 'mission' ? 'active' : ''}`}
          onClick={() => onTabChange('mission')}
          type="button"
        >
          🎯 Mission Control
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'venue' ? 'active' : ''}`}
          onClick={() => onTabChange('venue')}
          type="button"
        >
          🌐 Venue Portal
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'protocol' ? 'active' : ''}`}
          onClick={() => onTabChange('protocol')}
          type="button"
        >
          📡 Protocol Inspector
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'skills' ? 'active' : ''}`}
          onClick={() => onTabChange('skills')}
          type="button"
        >
          ⚡ Learned Skills
        </button>
      </nav>

      <div className="header-status">
        <button
          type="button"
          className="btn-secondary"
          onClick={onLoadPreset}
          title="Pre-populate Dad's 60th Birthday goal (INR 40,000)"
          style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
        >
          ✨ Demo Preset
        </button>

        {(
          <button
            type="button"
            className={`voice-mic-btn ${voiceActive ? 'listening' : ''}`}
            onClick={onToggleVoice}
            title={voiceActive ? 'Voice console open' : hasSpeechSupport ? 'Talk to Atlas' : 'Open Atlas command console (text fallback)'}
            aria-label="Toggle Voice Assistant"
          >
            {voiceActive ? '🎙️' : '🎤'}
          </button>
        )}

        <div
          className="connection-pill"
          title={
            connected
              ? `Connected to MCP Server (${health?.planner || 'deterministic'} planner)`
              : connecting
              ? 'Connecting to MCP Server...'
              : 'MCP Server Disconnected'
          }
        >
          <span
            className={`dot ${
              connected ? 'dot-connected' : connecting ? 'dot-connecting' : 'dot-disconnected'
            }`}
          />
          <span>{connected ? 'MCP 127.0.0.1:3001' : connecting ? 'Connecting...' : 'Disconnected'}</span>
        </div>
      </div>
    </header>
  );
};
