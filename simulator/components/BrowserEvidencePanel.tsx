import React, { useEffect, useState } from 'react';
import type { BrowserEvidence } from '../../server/browser.js';
import { mcpManager } from '../mcp/client.js';

export function BrowserEvidencePanel({ missionId }: { missionId?: string }) {
  const [evidence, setEvidence] = useState<BrowserEvidence | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setEvidence(null); setError('');
    const refresh = async () => {
      if (!missionId) return;
      try {
        const result = await mcpManager.getBrowserWorkerStatus(missionId);
        if (active) { setEvidence(result); setError(''); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Browser evidence unavailable'); }
      if (active) timer = setTimeout(refresh, 3000);
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [missionId]);
  return <section aria-label="Actual browser worker evidence" style={{ marginBottom: '1rem' }}>
    <h3>Actual Playwright worker evidence</h3>
    {!missionId && <p>Select a mission to inspect its browser operation.</p>}
    {error && <p role="alert">{error} Restart the backend to load the latest worker tools.</p>}
    {evidence && <>
      <p>{evidence.status}: {evidence.lastAction}</p>
      {evidence.error && <p role="alert">{evidence.error}</p>}
      {evidence.snapshot && <details><summary>Captured accessibility snapshot</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>{evidence.snapshot}</pre></details>}
      <p style={{ fontSize: '0.8rem' }}>Real browser actions on a fictional page. The preview below mirrors mission state; it is not a live browser stream.</p>
    </>}
  </section>;
}
