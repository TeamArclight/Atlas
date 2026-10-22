import React, { useState } from 'react';
import type { LearnedSkill } from '../types.js';

export const LearnedSkillForge: React.FC = () => {
  const [skills, setSkills] = useState<LearnedSkill[]>([
    {
      id: 'skill-venue-negotiator',
      name: 'fictional_venue_negotiator',
      description:
        'Analyzes party size (25 guests) and Saturday evening availability to negotiate package rates with fictional venues under INR 15,000.',
      category: 'venue',
      status: 'approved',
      testedCases: 5,
      householdPolicyApproved: true,
      codeSnippet: `// Constrained Template-based Skill Specification
export async function executeSkill(ctx: SkillContext) {
  assert(ctx.householdLimit >= 12000, "Spending limit insufficient");
  const quote = await fictionalVenueClient.getQuote({ guests: 25, slot: "sat_evening" });
  if (quote.inr <= 12000) return quote;
  throw new Error("Quote exceeds target threshold");
}`,
    },
    {
      id: 'skill-catering-planner',
      name: 'dietary_catering_allocator',
      description:
        'Calculates menu portions and split vegetarian/non-vegetarian headcount for 25 attendees within INR 18,000.',
      category: 'catering',
      status: 'testing',
      testedCases: 2,
      householdPolicyApproved: false,
      codeSnippet: `// Catering Allocation Skill (Testing in simulated sandbox)
export async function planMenu(guests: number, budget: number) {
  const vegCount = Math.ceil(guests * 0.6);
  const nonVegCount = guests - vegCount;
  return { vegPortions: vegCount, nonVegPortions: nonVegCount, costEstimate: guests * 650 };
}`,
    },
  ]);

  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  const toggleApproval = (id: string) => {
    setSkills((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const newApproved = !s.householdPolicyApproved;
        const newStatus = newApproved ? 'approved' : 'revoked';
        setActiveNotice(
          `Skill ${s.name} ${newApproved ? 'approved by household authority' : 'revoked'}.`
        );
        return {
          ...s,
          householdPolicyApproved: newApproved,
          status: newStatus,
        };
      })
    );
  };

  const runRehearsalTest = (id: string) => {
    setSkills((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        setActiveNotice(`Ran simulated test rehearsal on ${s.name} (3 test cases passed).`);
        return {
          ...s,
          testedCases: s.testedCases + 1,
        };
      })
    );
  };

  return (
    <div className="panel" style={{ width: '100%' }}>
      <div className="panel-header">
        <div>
          <h2>
            <span>⚡</span> Learned Skills & Tool Forge (Demonstration)
          </h2>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            Constrained template-based skills • Isolated E2B sandbox backend requested in COORDINATION.md
          </span>
        </div>
      </div>

      <div className="panel-body">
        {/* Truthful Architecture Disclaimer */}
        <div
          style={{
            background: 'var(--accent-amber-bg)',
            border: '1px solid var(--accent-amber-border)',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.8rem',
            color: '#fef08a',
            lineHeight: 1.5,
          }}
        >
          <strong>Compliance Notice:</strong> This demonstration presents constrained, template-based
          skills with policy checks and verification lifecycles. Real autonomous dynamic code generation
          requires an isolated sandbox environment (e.g. E2B) and a backend meta-tool registry.
          Full backend contract is tracked in <code>COORDINATION.md</code>.
        </div>

        {activeNotice && (
          <div
            style={{
              background: 'var(--accent-teal-bg)',
              border: '1px solid var(--accent-teal-border)',
              padding: '0.5rem 0.85rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              color: '#2dd4bf',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>✓ {activeNotice}</span>
            <button
              type="button"
              onClick={() => setActiveNotice(null)}
              style={{ background: 'none', border: 'none', color: '#99f6e4', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
          {skills.map((skill) => (
            <div key={skill.id} className="skill-card">
              <div className="skill-card-header">
                <div>
                  <h3 style={{ fontSize: '0.95rem', color: '#f8fafc', fontWeight: 700 }}>
                    <code>{skill.name}</code>
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'capitalize' }}>
                    Category: {skill.category}
                  </div>
                </div>

                <span
                  className={`badge ${
                    skill.status === 'approved'
                      ? 'badge-status-completed'
                      : skill.status === 'revoked'
                      ? 'badge-status-error'
                      : 'badge-status-awaiting'
                  }`}
                >
                  {skill.status.toUpperCase()}
                </span>
              </div>

              <p style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.6rem' }}>
                {skill.description}
              </p>

              <div className="skill-code-box">
                <pre>{skill.codeSnippet}</pre>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  marginTop: '0.5rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span>Rehearsal Tests: <strong>{skill.testedCases} passed</strong></span>
                <span>Household Policy: <strong style={{ color: skill.householdPolicyApproved ? '#2dd4bf' : '#fda4af' }}>
                  {skill.householdPolicyApproved ? 'Approved' : 'Pending'}
                </strong></span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => runRehearsalTest(skill.id)}
                  style={{ fontSize: '0.75rem', flex: 1 }}
                >
                  🧪 Rehearse Test Case
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => toggleApproval(skill.id)}
                  style={{
                    fontSize: '0.75rem',
                    flex: 1,
                    borderColor: skill.householdPolicyApproved ? 'rgba(244, 63, 94, 0.4)' : 'rgba(20, 184, 166, 0.4)',
                    color: skill.householdPolicyApproved ? '#fda4af' : '#2dd4bf',
                  }}
                >
                  {skill.householdPolicyApproved ? '🚫 Revoke Authorization' : '🛡️ Approve for Household'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
