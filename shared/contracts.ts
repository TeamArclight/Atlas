export type MissionState =
  | 'planning'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'compensating'
  | 'undone'
  | 'failed';

export type StepState =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'undone'
  | 'failed';

export interface MissionStep {
  id: string;
  title: string;
  state: StepState;
  tool?: string;
  args?: Record<string, unknown>;
  costBound?: number;
  dependencies?: string[];
  requiresApproval?: boolean;
  result?: unknown;
  error?: string;
}

export interface LedgerEntry {
  sequence: number;
  action: string;
  cost: number;
  previousHash: string;
  hash: string;
  timestamp: string;
  stepId?: string;
  idempotencyKey?: string;
}

export interface PendingApproval {
  id: string;
  missionId: string;
  action: string;
  amount: number;
  approverRole: 'adult' | 'child';
  expiresAt: string;
  token: string;
  confirmationPhrase: string;
}

export interface AlternativeEvaluation {
  name: string;
  category: 'venue' | 'catering' | 'cake';
  cost: number;
  accepted: boolean;
  rejectionReason?: string;
}

export interface Mission {
  id: string;
  goal: string;
  budget: number;
  state: MissionState;
  simulated: true;
  plannedCost: number;
  planner?: {
    mode: 'bedrock' | 'fixture' | 'gemini';
    model?: string;
    evaluatedAlternatives?: AlternativeEvaluation[];
  };
  steps: MissionStep[];
  ledger: LedgerEntry[];
  pendingApproval?: PendingApproval;
  executionIntent?: {
    stepId: string;
    action: string;
    idempotencyKey: string;
    status: 'started' | 'effect_completed' | 'ledger_written' | 'failed';
  };
}

export interface ConverseInput {
  conversationId?: string;
  utterance: string;
  missionId?: string;
  commandId: string;
}

export interface ConverseOutput {
  conversationId: string;
  reply: string;
  intent: string;
  mission?: Mission;
  pendingApproval?: {
    id: string;
    action: string;
    amount: number;
    expiresAt: string;
    confirmationPhrase: string;
  };
  mode: string;
}

export interface LearnedSkillTest {
  input: Record<string, number>;
  expected: Record<string, number>;
}

export interface LearnedSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  template: string;
  parameters: Record<string, string>;
  tests: LearnedSkillTest[];
  testResults?: {
    passed: boolean;
    executedCases: number;
    failures?: string[];
    timestamp: string;
  };
  status: 'draft' | 'tested' | 'approved' | 'revoked';
  approvedBy?: string;
  version: number;
}
