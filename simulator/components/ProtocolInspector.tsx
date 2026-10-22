import React, { useState } from 'react';
import type { ProtocolLog } from '../types.js';

interface ProtocolInspectorProps {
  logs: ProtocolLog[];
  onClear: () => void;
}

export const ProtocolInspector: React.FC<ProtocolInspectorProps> = ({ logs, onClear }) => {
  const [filterType, setFilterType] = useState<'all' | 'request' | 'response' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(logs.map((l) => l.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const filteredLogs = logs.filter((log) => {
    if (filterType !== 'all' && log.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const methodMatch = log.method?.toLowerCase().includes(q) ?? false;
      const statusMatch = log.statusText?.toLowerCase().includes(q) ?? false;
      const payloadMatch = JSON.stringify(log.payload).toLowerCase().includes(q);
      return methodMatch || statusMatch || payloadMatch;
    }
    return true;
  });

  const exportLogsAsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `atlas-mcp-traffic-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="panel protocol-inspector">
      <div className="panel-header">
        <h2>
          <span>📡</span> Protocol Inspector (JSON-RPC 2.0 / MCP)
        </h2>
        <div className="protocol-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={expandAll}
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
          >
            Expand All
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={collapseAll}
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
          >
            Collapse All
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={exportLogsAsJson}
            disabled={logs.length === 0}
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
            title="Export captured JSON-RPC logs"
          >
            💾 Export
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClear}
            disabled={logs.length === 0}
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            className="form-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search method, payload, or RPC ID..."
            style={{ flex: 1, minWidth: '180px', padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
          />

          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {(['all', 'request', 'response', 'error'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`btn-secondary ${filterType === t ? 'active' : ''}`}
                onClick={() => setFilterType(t)}
                style={{
                  fontSize: '0.72rem',
                  padding: '0.25rem 0.55rem',
                  textTransform: 'capitalize',
                  borderColor: filterType === t ? '#38bdf8' : undefined,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
          <span>Captured Events: {filteredLogs.length} of {logs.length}</span>
          <span style={{ color: '#2dd4bf' }}>🛡️ Sensitive Auth & Credentials Redacted</span>
        </div>

        <div className="protocol-logs-list">
          {filteredLogs.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <div className="empty-state-icon">📡</div>
              <div className="empty-state-title">No Protocol Traffic Yet</div>
              <p style={{ fontSize: '0.78rem' }}>
                Actual JSON-RPC requests & responses sent across Streamable HTTP will appear here in real time.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedIds.has(log.id);
              const tagClass =
                log.type === 'error'
                  ? 'log-tag-err'
                  : log.direction === 'outgoing'
                  ? 'log-tag-out'
                  : 'log-tag-in';

              return (
                <div key={log.id} className="log-entry">
                  <div
                    className="log-summary"
                    onClick={() => toggleExpand(log.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') toggleExpand(log.id);
                    }}
                  >
                    <span className={`log-tag ${tagClass}`}>
                      {log.type === 'error'
                        ? 'ERR'
                        : log.direction === 'outgoing'
                        ? 'REQ'
                        : 'RESP'}
                    </span>

                    <span className="log-method" title={log.method || log.statusText}>
                      {log.method ? `${log.method}` : log.statusText}
                    </span>

                    {log.rpcId !== undefined && (
                      <span
                        style={{
                          fontSize: '0.68rem',
                          color: '#38bdf8',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        id:{String(log.rpcId).slice(0, 8)}
                      </span>
                    )}

                    {log.durationMs !== undefined && (
                      <span style={{ fontSize: '0.68rem', color: '#fbbf24' }}>
                        {log.durationMs}ms
                      </span>
                    )}

                    <span className="log-time">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>

                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="log-payload-viewer">
                      <div
                        style={{
                          marginBottom: '0.35rem',
                          color: '#94a3b8',
                          fontSize: '0.68rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Direction: {log.direction === 'outgoing' ? 'Client -> MCP Server' : 'MCP Server -> Client'}</span>
                        <span>{log.statusText || 'JSON-RPC Payload'}</span>
                      </div>
                      <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
