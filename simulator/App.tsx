import React, { useState, useEffect, useCallback } from 'react';
import type { Mission, ProtocolLog, ServerHealth } from './types.js';
import { mcpManager } from './mcp/client.js';
import { Header } from './components/Header.js';
import { MissionCreator } from './components/MissionCreator.js';
import { MissionList } from './components/MissionList.js';
import { MissionDetails } from './components/MissionDetails.js';
import { VenueSimulator } from './components/VenueSimulator.js';
import { ProtocolInspector } from './components/ProtocolInspector.js';
import { ServerSkillForge } from './components/ServerSkillForge.js';
import { VoiceMissionConsole } from './components/VoiceMissionConsole.js';

import { useRef } from 'react';

export const App: React.FC = () => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);

  // Form inputs
  const [goal, setGoal] = useState("Plan Dad's 60th birthday for Saturday, 25 people, budget INR 40,000.");
  const [budget, setBudget] = useState(40000);

  // Connection & Health
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [health, setHealth] = useState<ServerHealth | null>(null);

  // Action pending states
  const [isCreating, setIsCreating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isLoadingMissions, setIsLoadingMissions] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Protocol Logs
  const [protocolLogs, setProtocolLogs] = useState<ProtocolLog[]>([]);

  // View Navigation
  const [activeTab, setActiveTab] = useState<'mission' | 'venue' | 'protocol' | 'skills'>('mission');

  // Voice Assistant
  const [voiceOpen, setVoiceOpen] = useState(false);
  const voiceConversation = useRef<string | undefined>(undefined);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);

  // Check speech recognition support
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));
    setHasSpeechSupport(Boolean(supported));
  }, []);

  // Subscribe to real protocol logs
  useEffect(() => {
    setProtocolLogs(mcpManager.getLogs());
    const unsubscribe = mcpManager.subscribe((log) => {
      setProtocolLogs((prev) => [log, ...prev].slice(0, 200));
    });
    return unsubscribe;
  }, []);

  // Fetch health check
  const checkHealth = useCallback(async () => {
    try {
      const h = await mcpManager.getHealth();
      setHealth(h);
      return true;
    } catch (err) {
      console.warn('Health check unreachable:', err);
      setHealth(null);
      return false;
    }
  }, []);

  // Connect to MCP and recover saved missions
  const initializeMcp = useCallback(async () => {
    setConnecting(true);
    setActionError(null);
    try {
      await checkHealth();
      await mcpManager.connect();
      setConnected(true);

      // Load saved missions
      setIsLoadingMissions(true);
      const list = await mcpManager.listMissions();
      setMissions(list);
      if (list.length > 0 && !selectedMissionId) {
        setSelectedMissionId(list[list.length - 1].id);
      }
    } catch (err) {
      console.error('Failed to initialize MCP connection:', err);
      setConnected(false);
      setActionError(
        err instanceof Error
          ? `Connection to MCP server failed: ${err.message}`
          : 'Failed to connect to MCP server.'
      );
    } finally {
      setConnecting(false);
      setIsLoadingMissions(false);
    }
  }, [checkHealth, selectedMissionId]);

  useEffect(() => {
    void initializeMcp();

    // Periodic health poll
    const interval = setInterval(() => {
      void checkHealth().then((ok) => {
        setConnected(ok && mcpManager.isConnected());
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [initializeMcp, checkHealth]);

  // Selected mission object
  const selectedMission = missions.find((m) => m.id === selectedMissionId) || null;

  // Actions
  const handleCreateMission = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setActionError(null);
    try {
      const newMission = await mcpManager.createMission(goal, budget);
      setMissions((prev) => [...prev, newMission]);
      setSelectedMissionId(newMission.id);
      setActiveTab('mission');
    } catch (err) {
      console.error('Failed to create mission:', err);
      setActionError(err instanceof Error ? err.message : 'Error creating mission.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleApproveMission = async (
    id: string,
    options?: { tokenOrPhrase?: string; role?: 'adult' | 'child'; planVersion?: number }
  ) => {
    if (isApproving) return;
    setIsApproving(true);
    setActionError(null);
    try {
      const updated = await mcpManager.approveMission(id, options);
      setMissions((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      console.error('Failed to approve mission:', err);
      setActionError(err instanceof Error ? err.message : 'Error approving mission.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleUndoMission = async (
    id: string,
    options?: { tokenOrPhrase?: string; role?: 'adult' | 'child' }
  ) => {
    if (isUndoing) return;
    setIsUndoing(true);
    setActionError(null);
    try {
      const updated = await mcpManager.undoMission(id, options);
      setMissions((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      console.error('Failed to undo mission:', err);
      setActionError(err instanceof Error ? err.message : 'Error undoing mission.');
    } finally {
      setIsUndoing(false);
    }
  };

  const handleReviseMission = async (
    id: string,
    changes: { budget?: number; guests?: number; eventDate?: string; dietaryPreferences?: string; notes?: string }
  ) => {
    setActionError(null);
    try {
      const res = await mcpManager.revisePlan(id, changes);
      setMissions((prev) => prev.map((m) => (m.id === id ? res.mission : m)));
    } catch (err) {
      console.error('Failed to revise plan:', err);
      setActionError(err instanceof Error ? err.message : 'Error revising plan.');
    }
  };

  const handleRefreshMissions = async () => {
    setIsLoadingMissions(true);
    try {
      const list = await mcpManager.listMissions();
      setMissions(list);
    } catch (err) {
      console.error('Failed to refresh missions:', err);
    } finally {
      setIsLoadingMissions(false);
    }
  };

  const handleLoadPreset = () => {
    setGoal("Plan Dad's 60th birthday for Saturday, 25 people, budget INR 40,000.");
    setBudget(40000);
    setActionError(null);
  };

  const handleClearLogs = () => {
    mcpManager.clearLogs();
    setProtocolLogs([]);
  };

  const handleVoiceCommand = async (text: string): Promise<string> => {
    const result = await mcpManager.converse({
      conversationId: voiceConversation.current,
      utterance: text,
      missionId: selectedMissionId ?? undefined,
      commandId: crypto.randomUUID(),
    });
    voiceConversation.current = result.conversationId;
    if (result.mission) {
      const updated = result.mission;
      setMissions(previous => previous.some(m => m.id === updated.id)
        ? previous.map(m => m.id === updated.id ? updated : m)
        : [...previous, updated]);
      setSelectedMissionId(updated.id);
      setGoal(updated.goal); setBudget(updated.budget); setActiveTab('mission');
    }
    return result.reply;
  };
  return (
    <div className="app-shell">
      <Header
        connected={connected}
        connecting={connecting}
        health={health}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLoadPreset={handleLoadPreset}
        voiceActive={voiceOpen}
        onToggleVoice={() => setVoiceOpen((prev) => !prev)}
        hasSpeechSupport={hasSpeechSupport}
      />

      <main className="main-content">
        {/* Disconnected Alert Banner if MCP is down */}
        {!connected && !connecting && (
          <div
            style={{
              background: 'var(--accent-red-bg)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              borderRadius: 'var(--radius)',
              padding: '0.85rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <strong style={{ color: '#fda4af' }}>⚠️ MCP Server Unreachable:</strong>
              <span style={{ fontSize: '0.85rem', color: '#fecdd3', marginLeft: '0.5rem' }}>
                Ensure backend is running (<code>npm run dev:server</code> at 127.0.0.1:3001).
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void initializeMcp()}
              style={{ fontSize: '0.78rem' }}
            >
              🔄 Retry Connection
            </button>
          </div>
        )}

        {/* Tab View: Mission Control */}
        {activeTab === 'mission' && (
          <div className="dashboard-grid">
            {/* Left Column: Creator & List */}
            <div>
              <MissionCreator
                goal={goal}
                budget={budget}
                onGoalChange={setGoal}
                onBudgetChange={setBudget}
                onSubmit={handleCreateMission}
                isCreating={isCreating}
                connected={connected}
              />

              <MissionList
                missions={missions}
                selectedMissionId={selectedMissionId}
                onSelectMission={setSelectedMissionId}
                isLoading={isLoadingMissions}
                onRefresh={() => void handleRefreshMissions()}
              />
            </div>

            {/* Middle Column: Active Mission Details & Timeline */}
            <div>
              <MissionDetails
                mission={selectedMission}
                onApprove={handleApproveMission}
                onUndo={handleUndoMission}
                onRevise={handleReviseMission}
                isApproving={isApproving}
                isUndoing={isUndoing}
                actionError={actionError}
              />
            </div>

            {/* Right Column: Live Protocol Inspector Feed & Quick Venue View */}
            <div className="protocol-column">
              <ProtocolInspector logs={protocolLogs} onClear={handleClearLogs} />
            </div>
          </div>
        )}

        {/* Tab View: Venue Portal View */}
        {activeTab === 'venue' && (
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <VenueSimulator mission={selectedMission} />
          </div>
        )}

        {/* Tab View: Full Protocol Inspector */}
        {activeTab === 'protocol' && (
          <div style={{ maxWidth: '1100px', margin: '0 auto', height: '80vh' }}>
            <ProtocolInspector logs={protocolLogs} onClear={handleClearLogs} />
          </div>
        )}

        {/* Tab View: Learned Skills Forge */}
        {activeTab === 'skills' && (
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <ServerSkillForge />
          </div>
        )}
      </main>

      {/* Voice Assistant Modal */}
      <VoiceMissionConsole
        isOpen={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onCommand={handleVoiceCommand}
      />
    </div>
  );
};
