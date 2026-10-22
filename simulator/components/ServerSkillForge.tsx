import React, { useEffect, useState } from 'react';
import type { LearnedSkill } from '../../shared/contracts.js';
import { mcpManager } from '../mcp/client.js';

export function ServerSkillForge() {
  const [skills, setSkills] = useState<LearnedSkill[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [guests, setGuests] = useState(25);
  const [budget, setBudget] = useState(40000);
  const refresh = async () => setSkills(await mcpManager.skillTool<LearnedSkill[]>('list_learned_skills'));
  useEffect(() => { void refresh().catch(e => setMessage(e.message)); }, []);
  const act = async (name: 'test_learned_skill' | 'approve_learned_skill' | 'run_learned_skill' | 'revoke_learned_skill', skillId: string) => {
    setBusy(true); setMessage('');
    try {
      const args = name === 'approve_learned_skill' ? { skillId, approverRole: 'adult' } : name === 'run_learned_skill' ? { skillId, input: { guests, budget } } : name === 'revoke_learned_skill' ? { skillId, reason: 'User revoked in simulator' } : { skillId };
      const result = await mcpManager.skillTool(name, args);
      setMessage(JSON.stringify(result, null, 2)); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Skill action failed'); }
    finally { setBusy(false); }
  };
  return <section className="panel"><div className="panel-header"><h2>Verified learned skills</h2></div><div className="panel-body">
    <p>Actual server tests and approval state. Constrained declarative skills; no arbitrary code execution. Adult approval here is a simulated household role.</p>
    <label>Guests for calculation <input type="number" min={1} max={1000} value={guests} onChange={e => setGuests(Number(e.target.value))} /></label>
    <label>Budget in INR <input type="number" min={1} value={budget} onChange={e => setBudget(Number(e.target.value))} /></label>
    {skills.map(skill => <article key={skill.id} style={{ padding: 16, borderBottom: '1px solid #334155' }}>
      <h3>{skill.name}</h3><p>{skill.description}</p><p>Status: {skill.status} · v{skill.version}</p>
      {skill.testResults && <p>{skill.testResults.executedCases} test cases executed: {skill.testResults.passed ? 'passed' : 'failed'}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button disabled={busy} onClick={() => void act('test_learned_skill', skill.id)}>Run tests</button>
        <button disabled={busy || skill.status !== 'tested' || !skill.testResults?.passed} onClick={() => void act('approve_learned_skill', skill.id)}>Approve tested skill</button>
        <button disabled={busy || skill.status !== 'approved' || !Number.isSafeInteger(guests) || guests < 1} onClick={() => void act('run_learned_skill', skill.id)}>Run calculator</button>
        <button disabled={busy || skill.status !== 'approved'} onClick={() => void act('revoke_learned_skill', skill.id)}>Revoke</button>
      </div>
    </article>)}
    {!skills.length && <p>No skills loaded yet. <button disabled={busy} onClick={() => void refresh().catch(e => setMessage(e.message))}>Refresh</button></p>}
    {message && <pre aria-live="polite" style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', marginTop: 16 }}>{message}</pre>}
  </div></section>;
}
