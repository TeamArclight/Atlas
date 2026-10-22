import type { Mission } from '../shared/contracts.js';

export type { Mission };

export type MissionStep = Mission['steps'][number];
export type LedgerEntry = Mission['ledger'][number];

export interface ProtocolLog {
  id: string;
  timestamp: string;
  direction: 'outgoing' | 'incoming';
  type: 'request' | 'response' | 'notification' | 'error';
  method?: string;
  rpcId?: string | number;
  durationMs?: number;
  payload: unknown;
  redacted: boolean;
  statusText?: string;
}

export interface ServerHealth {
  status: string;
  mode: string;
  planner: string;
}

export type VenueBookingState = 'available' | 'reserved' | 'cancelled';

export interface LearnedSkill {
  id: string;
  name: string;
  description: string;
  category: 'venue' | 'catering' | 'logistics';
  status: 'draft' | 'testing' | 'approved' | 'revoked';
  testedCases: number;
  householdPolicyApproved: boolean;
  codeSnippet: string;
}
