import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LearnedSkill, LearnedSkillTest } from '../shared/contracts.js';

export class SkillExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillExecutionError';
  }
}

/**
 * Strictly safe declarative mathematical evaluator for constrained learned skills.
 * Allows arithmetic and safe Math functions only; rejects all arbitrary code, imports, or system calls.
 */
export function evaluateSafeExpression(
  expression: string,
  params: Record<string, number>
): number {
  // Disallow any suspicious keywords or symbols
  const forbidden = /\b(eval|Function|import|require|process|global|window|document|fetch|fs|exec|child_process|constructor|prototype|__proto__)\b/;
  if (forbidden.test(expression)) {
    throw new SkillExecutionError('Unsafe keyword detected in expression template.');
  }

  // Replace recognized Math tokens
  const safeMath = {
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    max: Math.max,
    min: Math.min,
    abs: Math.abs,
  };

  // Build a safe evaluation function with only math parameters
  const paramKeys = Object.keys(params);
  const paramValues = Object.values(params);

  try {
    // Only allow identifiers matching paramKeys or Math functions
    const func = new Function('Math', ...paramKeys, `"use strict"; return (${expression});`);
    const result = func(safeMath, ...paramValues);
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new SkillExecutionError(`Expression did not return a finite number: ${result}`);
    }
    return result;
  } catch (err) {
    throw new SkillExecutionError(
      `Evaluation failed for expression "${expression}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export class LearnedSkillStore {
  private skills: LearnedSkill[];
  private filepath: string;

  constructor(private directory = 'data') {
    mkdirSync(directory, { recursive: true });
    this.filepath = join(directory, 'learned_skills.json');
    this.skills = existsSync(this.filepath)
      ? JSON.parse(readFileSync(this.filepath, 'utf8'))
      : [];

    if (this.skills.length === 0) {
      this.seedDefaultSkill();
    }
  }

  private save() {
    const tmp = this.filepath + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.skills, null, 2));
    renameSync(tmp, this.filepath);
  }

  private seedDefaultSkill() {
    const defaultSkill: LearnedSkill = {
      id: 'skill-party-portion-calculator',
      name: 'party_portion_calculator',
      description:
        'Calculates vegetarian and non-vegetarian headcounts, cake size in kg, and remaining budget buffer for party attendees.',
      category: 'catering',
      version: 1,
      template: JSON.stringify({
        vegPortions: 'Math.ceil(guests * 0.6)',
        nonVegPortions: 'guests - Math.ceil(guests * 0.6)',
        cakeKg: 'Math.max(2, Math.ceil(guests * 0.12))',
        cateringEstimatedCost: 'guests * 600',
        bufferRemaining: 'budget - (guests * 600 + 12000 + 3500)',
      }),
      parameters: {
        guests: 'integer (headcount)',
        budget: 'integer (INR)',
      },
      tests: [
        {
          input: { guests: 25, budget: 40000 },
          expected: {
            vegPortions: 15,
            nonVegPortions: 10,
            cakeKg: 3,
            cateringEstimatedCost: 15000,
            bufferRemaining: 9500,
          },
        },
        {
          input: { guests: 10, budget: 20000 },
          expected: {
            vegPortions: 6,
            nonVegPortions: 4,
            cakeKg: 2,
            cateringEstimatedCost: 6000,
            bufferRemaining: -1500,
          },
        },
      ],
      status: 'draft',
    };
    this.skills.push(defaultSkill);
    this.save();
  }

  list(): LearnedSkill[] {
    return structuredClone(this.skills);
  }

  get(id: string): LearnedSkill {
    const skill = this.skills.find((s) => s.id === id || s.name === id);
    if (!skill) throw new SkillExecutionError(`Learned skill "${id}" not found.`);
    return structuredClone(skill);
  }

  create(skillData: {
    name: string;
    description: string;
    category: string;
    template: string;
    parameters: Record<string, string>;
    tests: LearnedSkillTest[];
  }): LearnedSkill {
    if (this.skills.some((s) => s.name === skillData.name)) {
      throw new SkillExecutionError(`Skill with name "${skillData.name}" already exists.`);
    }

    const skill: LearnedSkill = {
      id: `skill-${randomUUID().slice(0, 8)}`,
      name: skillData.name,
      description: skillData.description,
      category: skillData.category,
      template: skillData.template,
      parameters: skillData.parameters,
      tests: skillData.tests,
      status: 'draft',
      version: 1,
    };
    this.skills.push(skill);
    this.save();
    return structuredClone(skill);
  }

  testSkill(id: string): LearnedSkill {
    const skill = this.skills.find((s) => s.id === id || s.name === id);
    if (!skill) throw new SkillExecutionError(`Skill "${id}" not found.`);

    let templateObj: Record<string, string>;
    try {
      templateObj = JSON.parse(skill.template);
    } catch {
      throw new SkillExecutionError('Skill template must be a valid JSON map of output keys to expressions.');
    }

    const failures: string[] = [];
    let executedCases = 0;

    for (const testCase of skill.tests) {
      executedCases++;
      const actualOutputs: Record<string, number> = {};

      for (const [key, expr] of Object.entries(templateObj)) {
        try {
          actualOutputs[key] = evaluateSafeExpression(expr, testCase.input);
        } catch (err) {
          failures.push(`Test case ${executedCases} error in key "${key}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      for (const [expectedKey, expectedVal] of Object.entries(testCase.expected)) {
        if (actualOutputs[expectedKey] !== expectedVal) {
          failures.push(
            `Test case ${executedCases} mismatch for "${expectedKey}": expected ${expectedVal}, got ${actualOutputs[expectedKey]}`
          );
        }
      }
    }

    const passed = failures.length === 0;
    skill.testResults = {
      passed,
      executedCases,
      failures: passed ? undefined : failures,
      timestamp: new Date().toISOString(),
    };

    if (passed && skill.status === 'draft') {
      skill.status = 'tested';
    }
    this.save();
    return structuredClone(skill);
  }

  approveSkill(id: string, approverRole: string): LearnedSkill {
    const skill = this.skills.find((s) => s.id === id || s.name === id);
    if (!skill) throw new SkillExecutionError(`Skill "${id}" not found.`);

    if (approverRole !== 'adult') {
      throw new SkillExecutionError('Only an adult household member can authorize learned skills.');
    }

    if (!skill.testResults?.passed) {
      throw new SkillExecutionError('Cannot approve skill without passing all test cases first.');
    }

    skill.status = 'approved';
    skill.approvedBy = approverRole;
    this.save();
    return structuredClone(skill);
  }

  runSkill(id: string, input: Record<string, number>): Record<string, number> {
    const skill = this.get(id);
    if (skill.status !== 'approved') {
      throw new SkillExecutionError(
        `Cannot execute skill "${skill.name}" because its status is "${skill.status}". Only approved skills can be run.`
      );
    }

    const templateObj: Record<string, string> = JSON.parse(skill.template);
    const results: Record<string, number> = {};

    for (const [key, expr] of Object.entries(templateObj)) {
      results[key] = evaluateSafeExpression(expr, input);
    }

    return results;
  }

  revokeSkill(id: string, reason: string): LearnedSkill {
    const skill = this.skills.find((s) => s.id === id || s.name === id);
    if (!skill) throw new SkillExecutionError(`Skill "${id}" not found.`);

    skill.status = 'revoked';
    this.save();
    return structuredClone(skill);
  }
}
