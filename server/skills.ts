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

// Allowed math function names
const ALLOWED_MATH_FUNCS = new Set(['ceil', 'floor', 'round', 'max', 'min', 'abs']);

type TokenType =
  | 'NUMBER'
  | 'IDENT'
  | 'FUNC'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'PERCENT'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA';

interface Token {
  type: TokenType;
  value: string;
  num?: number;
}

/**
 * Tokenizes a mathematical expression without eval or code compilation.
 */
function tokenize(expression: string): Token[] {
  // Reject forbidden symbols that suggest code execution, objects, prototype pollution
  const forbiddenPattern = /[\[\]{};=!'"`\\~^&|#$@?<>]/;
  if (forbiddenPattern.test(expression)) {
    throw new SkillExecutionError('Forbidden character detected in expression.');
  }

  // Reject suspicious prototype/execution keywords
  const forbiddenKeywords = /\b(eval|Function|import|require|process|global|window|document|constructor|prototype|__proto__|return|typeof|void|delete|new|var|let|const|function|class)\b/;
  if (forbiddenKeywords.test(expression)) {
    throw new SkillExecutionError('Unsafe keyword detected in expression template.');
  }

  const tokens: Token[] = [];
  let i = 0;
  const n = expression.length;

  while (i < n) {
    const ch = expression[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (tokens.length >= 100) {
      throw new SkillExecutionError('Expression exceeds maximum complexity limit (100 tokens).');
    }

    // Number literal
    if (/\d/.test(ch) || (ch === '.' && i + 1 < n && /\d/.test(expression[i + 1]))) {
      let numStr = '';
      while (i < n && (/[\d.]/.test(expression[i]))) {
        numStr += expression[i];
        i++;
      }
      const num = Number(numStr);
      if (!Number.isFinite(num)) {
        throw new SkillExecutionError(`Invalid number format: "${numStr}"`);
      }
      tokens.push({ type: 'NUMBER', value: numStr, num });
      continue;
    }

    // Identifiers or Math functions
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < n && /[a-zA-Z0-9_.]/.test(expression[i])) {
        ident += expression[i];
        i++;
      }

      // Check property access: only "Math.<func>" is permitted
      if (ident.includes('.')) {
        const parts = ident.split('.');
        if (parts.length !== 2 || parts[0] !== 'Math' || !ALLOWED_MATH_FUNCS.has(parts[1])) {
          throw new SkillExecutionError(`Disallowed property access "${ident}". Only safe Math functions are permitted.`);
        }
        tokens.push({ type: 'FUNC', value: parts[1] });
      } else if (ALLOWED_MATH_FUNCS.has(ident)) {
        tokens.push({ type: 'FUNC', value: ident });
      } else {
        tokens.push({ type: 'IDENT', value: ident });
      }
      continue;
    }

    // Operators and delimiters
    switch (ch) {
      case '+':
        tokens.push({ type: 'PLUS', value: '+' });
        i++;
        break;
      case '-':
        tokens.push({ type: 'MINUS', value: '-' });
        i++;
        break;
      case '*':
        tokens.push({ type: 'STAR', value: '*' });
        i++;
        break;
      case '/':
        tokens.push({ type: 'SLASH', value: '/' });
        i++;
        break;
      case '%':
        tokens.push({ type: 'PERCENT', value: '%' });
        i++;
        break;
      case '(':
        tokens.push({ type: 'LPAREN', value: '(' });
        i++;
        break;
      case ')':
        tokens.push({ type: 'RPAREN', value: ')' });
        i++;
        break;
      case ',':
        tokens.push({ type: 'COMMA', value: ',' });
        i++;
        break;
      default:
        throw new SkillExecutionError(`Unexpected token "${ch}" in expression.`);
    }
  }

  return tokens;
}

/**
 * Recursive descent AST parser and evaluator for safe mathematical expressions.
 * Implements strict numeric evaluations without arbitrary code execution.
 */
class DeclarativeMathEvaluator {
  private pos = 0;
  private depth = 0;
  private readonly maxDepth = 25;

  constructor(
    private readonly tokens: Token[],
    private readonly params: Record<string, number>
  ) {}

  evaluate(): number {
    this.pos = 0;
    this.depth = 0;
    const result = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new SkillExecutionError(`Unexpected trailing token "${this.tokens[this.pos].value}" in expression.`);
    }
    if (!Number.isFinite(result)) {
      throw new SkillExecutionError(`Expression produced a non-finite result: ${result}`);
    }
    return result;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(expected?: TokenType): Token {
    const token = this.tokens[this.pos];
    if (!token) {
      throw new SkillExecutionError('Unexpected end of expression.');
    }
    if (expected && token.type !== expected) {
      throw new SkillExecutionError(`Expected "${expected}" but found "${token.value}".`);
    }
    this.pos++;
    return token;
  }

  private parseExpression(): number {
    this.checkDepth();
    this.depth++;
    try {
      let value = this.parseTerm();
      while (this.pos < this.tokens.length) {
        const next = this.peek();
        if (next?.type === 'PLUS') {
          this.consume('PLUS');
          value += this.parseTerm();
        } else if (next?.type === 'MINUS') {
          this.consume('MINUS');
          value -= this.parseTerm();
        } else {
          break;
        }
      }
      return value;
    } finally {
      this.depth--;
    }
  }

  private parseTerm(): number {
    this.checkDepth();
    this.depth++;
    try {
      let value = this.parseFactor();
      while (this.pos < this.tokens.length) {
        const next = this.peek();
        if (next?.type === 'STAR') {
          this.consume('STAR');
          value *= this.parseFactor();
        } else if (next?.type === 'SLASH') {
          this.consume('SLASH');
          const divisor = this.parseFactor();
          if (divisor === 0) {
            throw new SkillExecutionError('Division by zero detected in expression.');
          }
          value /= divisor;
        } else if (next?.type === 'PERCENT') {
          this.consume('PERCENT');
          const divisor = this.parseFactor();
          if (divisor === 0) {
            throw new SkillExecutionError('Modulo by zero detected in expression.');
          }
          value %= divisor;
        } else {
          break;
        }
      }
      return value;
    } finally {
      this.depth--;
    }
  }

  private parseFactor(): number {
    this.checkDepth();
    this.depth++;
    try {
      const next = this.peek();
      if (next?.type === 'PLUS') {
        this.consume('PLUS');
        return this.parseFactor();
      }
      if (next?.type === 'MINUS') {
        this.consume('MINUS');
        return -this.parseFactor();
      }
      return this.parsePrimary();
    } finally {
      this.depth--;
    }
  }

  private parsePrimary(): number {
    this.checkDepth();
    const token = this.peek();
    if (!token) {
      throw new SkillExecutionError('Unexpected end of expression.');
    }

    // Number literal
    if (token.type === 'NUMBER') {
      this.consume('NUMBER');
      return token.num!;
    }

    // Variable reference
    if (token.type === 'IDENT') {
      this.consume('IDENT');
      const varName = token.value;
      if (!(varName in this.params)) {
        throw new SkillExecutionError(`Unknown variable "${varName}" in expression.`);
      }
      const val = this.params[varName];
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new SkillExecutionError(`Variable "${varName}" must be a finite number; got ${val}.`);
      }
      return val;
    }

    // Function call
    if (token.type === 'FUNC') {
      this.consume('FUNC');
      const funcName = token.value;
      this.consume('LPAREN');
      const args: number[] = [];
      if (this.peek()?.type !== 'RPAREN') {
        args.push(this.parseExpression());
        while (this.peek()?.type === 'COMMA') {
          this.consume('COMMA');
          args.push(this.parseExpression());
        }
      }
      this.consume('RPAREN');

      switch (funcName) {
        case 'ceil':
          if (args.length !== 1) throw new SkillExecutionError('ceil() expects exactly 1 argument.');
          return Math.ceil(args[0]);
        case 'floor':
          if (args.length !== 1) throw new SkillExecutionError('floor() expects exactly 1 argument.');
          return Math.floor(args[0]);
        case 'round':
          if (args.length !== 1) throw new SkillExecutionError('round() expects exactly 1 argument.');
          return Math.round(args[0]);
        case 'abs':
          if (args.length !== 1) throw new SkillExecutionError('abs() expects exactly 1 argument.');
          return Math.abs(args[0]);
        case 'max':
          if (args.length < 1) throw new SkillExecutionError('max() expects at least 1 argument.');
          return Math.max(...args);
        case 'min':
          if (args.length < 1) throw new SkillExecutionError('min() expects at least 1 argument.');
          return Math.min(...args);
        default:
          throw new SkillExecutionError(`Unsupported function "${funcName}".`);
      }
    }

    // Grouping parentheses
    if (token.type === 'LPAREN') {
      this.consume('LPAREN');
      const inner = this.parseExpression();
      this.consume('RPAREN');
      return inner;
    }

    throw new SkillExecutionError(`Unexpected token "${token.value}" in expression.`);
  }

  private checkDepth() {
    if (this.depth > this.maxDepth) {
      throw new SkillExecutionError(`Expression exceeded maximum nesting depth (${this.maxDepth}).`);
    }
  }
}

/**
 * Strictly safe declarative AST evaluator for learned skill mathematical expressions.
 * Does NOT use `eval`, `new Function`, or dynamic compilation.
 */
export function evaluateSafeExpression(
  expression: string,
  params: Record<string, number>
): number {
  if (!expression || typeof expression !== 'string' || !expression.trim()) {
    throw new SkillExecutionError('Expression cannot be empty.');
  }
  const tokens = tokenize(expression.trim());
  const evaluator = new DeclarativeMathEvaluator(tokens, params);
  return evaluator.evaluate();
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

    if (!skillData.tests || skillData.tests.length === 0) {
      throw new SkillExecutionError('Learned skill requires at least one test fixture before registration.');
    }

    // Pre-validate template JSON
    let templateObj: Record<string, string>;
    try {
      templateObj = JSON.parse(skillData.template);
    } catch {
      throw new SkillExecutionError('Skill template must be a valid JSON map of output keys to expressions.');
    }

    // Pre-validate expressions
    for (const [key, expr] of Object.entries(templateObj)) {
      if (typeof expr !== 'string' || !expr.trim()) {
        throw new SkillExecutionError(`Expression for key "${key}" must be a non-empty string.`);
      }
      tokenize(expr); // Syntax and safety check
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

  update(id: string, updates: {
    template?: string;
    parameters?: Record<string, string>;
    tests?: LearnedSkillTest[];
    description?: string;
  }): LearnedSkill {
    const skill = this.skills.find((s) => s.id === id || s.name === id);
    if (!skill) throw new SkillExecutionError(`Skill "${id}" not found.`);
    if (skill.status === 'revoked') {
      throw new SkillExecutionError(`Cannot edit revoked skill "${skill.name}". Revoked skills are permanently disabled.`);
    }

    let changed = false;
    if (updates.template && updates.template !== skill.template) {
      // Pre-validate
      const templateObj = JSON.parse(updates.template);
      for (const [key, expr] of Object.entries(templateObj)) {
        if (typeof expr !== 'string') throw new SkillExecutionError(`Expression for key "${key}" must be string.`);
        tokenize(expr);
      }
      skill.template = updates.template;
      changed = true;
    }

    if (updates.parameters) {
      skill.parameters = updates.parameters;
      changed = true;
    }

    if (updates.tests) {
      if (updates.tests.length === 0) {
        throw new SkillExecutionError('Skill tests cannot be empty.');
      }
      skill.tests = updates.tests;
      changed = true;
    }

    if (updates.description && updates.description !== skill.description) {
      skill.description = updates.description;
      changed = true;
    }

    if (changed) {
      skill.version += 1;
      // Invalidate previous test evidence and approvals
      skill.status = 'draft';
      skill.testResults = undefined;
      skill.approvedBy = undefined;
    }

    this.save();
    return structuredClone(skill);
  }

  testSkill(id: string): LearnedSkill {
    const skill = this.skills.find((s) => s.id === id || s.name === id);
    if (!skill) throw new SkillExecutionError(`Skill "${id}" not found.`);
    if (skill.status === 'revoked') {
      throw new SkillExecutionError(`Cannot test revoked skill "${skill.name}".`);
    }

    if (!skill.tests || skill.tests.length === 0) {
      throw new SkillExecutionError(`Skill "${skill.name}" has no test fixtures. Meaningful tests are mandatory.`);
    }

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
      skillVersion: skill.version,
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

    if (skill.status === 'revoked') {
      throw new SkillExecutionError(`Cannot approve revoked skill "${skill.name}". Revoked skills cannot be reactivated.`);
    }

    if (approverRole !== 'adult') {
      throw new SkillExecutionError('Only an adult household member can authorize learned skills.');
    }

    if (!skill.tests || skill.tests.length === 0) {
      throw new SkillExecutionError('Cannot approve skill without test fixtures.');
    }

    if (!skill.testResults?.passed) {
      throw new SkillExecutionError('Cannot approve skill without passing all test cases first.');
    }

    // Invariant: test evidence must match the exact skill version
    if (skill.testResults.skillVersion !== skill.version) {
      throw new SkillExecutionError(
        `Test evidence is from version ${skill.testResults.skillVersion}, but current skill is version ${skill.version}. Re-run tests before approval.`
      );
    }

    skill.status = 'approved';
    skill.approvedBy = approverRole;
    this.save();
    return structuredClone(skill);
  }

  runSkill(id: string, input: Record<string, number>): Record<string, number> {
    const skill = this.get(id);
    if (skill.status === 'revoked') {
      throw new SkillExecutionError(
        `Cannot execute revoked skill "${skill.name}". Revoked skills are permanently blocked. Only approved skills can be run.`
      );
    }
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
    skill.approvedBy = undefined;
    this.save();
    return structuredClone(skill);
  }
}
