import { randomUUID } from 'node:crypto';
import type { Mission, ConverseInput, ConverseOutput } from '../shared/contracts.js';
import { MissionStore } from './missions.js';

interface ConversationState {
  id: string;
  history: { role: 'user' | 'assistant'; text: string; timestamp: string }[];
  activeMissionId?: string;
  pendingConfirmation?: {
    operation: 'approve' | 'undo';
    missionId: string;
    expiresAt: number;
    token?: string;
  };
}

export class ConverseService {
  private conversations = new Map<string, ConversationState>();
  private processedCommands = new Map<string, ConverseOutput>(); // commandId deduplication

  constructor(private store: MissionStore, private execute?: (missionId: string, operation: 'approve' | 'undo', options: { tokenOrPhrase?: string; role?: 'adult' | 'child' }) => Promise<Mission>) {}

  async converse(input: ConverseInput): Promise<ConverseOutput> {
    // Idempotent deduplication for repeat command IDs
    if (input.commandId && this.processedCommands.has(input.commandId)) {
      return structuredClone(this.processedCommands.get(input.commandId)!);
    }

    const conversationId = input.conversationId || randomUUID();
    let state = this.conversations.get(conversationId);
    if (!state) {
      state = { id: conversationId, history: [] };
      this.conversations.set(conversationId, state);
    }

    if (input.missionId) {
      state.activeMissionId = input.missionId;
    }

    const utterance = input.utterance.trim();
    state.history.push({ role: 'user', text: utterance, timestamp: new Date().toISOString() });

    const result = await this.processUtterance(state, utterance, input.missionId);

    state.history.push({ role: 'assistant', text: result.reply, timestamp: new Date().toISOString() });
    if (state.history.length > 20) state.history = state.history.slice(-20);

    if (input.commandId) {
      this.processedCommands.set(input.commandId, result);
    }

    return result;
  }

  private async processUtterance(
    state: ConversationState,
    text: string,
    passedMissionId?: string
  ): Promise<ConverseOutput> {
    const cleaned = text.trim().replace(/^(?:hey\s+)?(?:alexa|atlas)[,\s]+/i, '').trim();
    const normalized = cleaned.toLowerCase().replace(/[.!?]/g, '').trim();
    const missionId = passedMissionId || state.activeMissionId;
    let mission: Mission | undefined;

    if (missionId) {
      try {
        mission = this.store.get(missionId);
      } catch {
        // Mission may have been deleted or invalid
      }
    }

    // 1. Cancel active confirmation
    if (/^(cancel|never mind|nevermind|stop|abort)$/.test(normalized)) {
      state.pendingConfirmation = undefined;
      return {
        conversationId: state.id,
        reply: 'Cancelled the pending confirmation. No actions or bookings were changed.',
        intent: 'cancel',
        mission,
        mode: 'conversational',
      };
    }

    // 2. Help
    if (/^(help|what can you do|what are your capabilities)$/.test(normalized)) {
      return {
        conversationId: state.id,
        reply: 'I can formulate milestone event plans, compare options, check status, request booking approvals with one-time confirmations, and compensate bookings.',
        intent: 'help',
        mission,
        mode: 'conversational',
      };
    }

    // 3. Compare options / Explain decision
    if (/\b(compare|alternatives|options|why did you choose|why not)\b/.test(normalized)) {
      if (!mission) {
        return {
          conversationId: state.id,
          reply: 'We compared options for Dad’s 60th birthday: Royal Heritage Palace (35,000 rupees) was rejected because it leaves only 5,000 for catering. Garden Hall (12,000 rupees) was selected, leaving a healthy budget buffer.',
          intent: 'compare_options',
          mode: 'conversational',
        };
      }

      const alternatives = mission.planner?.evaluatedAlternatives || [];
      const rejected = alternatives.filter((a) => !a.accepted);
      const accepted = alternatives.filter((a) => a.accepted);

      const reply = `We evaluated multiple options: ${accepted.map((a) => `${a.name} (${a.cost} rupees)`).join(', ')} were selected. ${rejected.map((a) => `${a.name} was rejected because ${a.rejectionReason}`).join(' ')}`;
      return {
        conversationId: state.id,
        reply,
        intent: 'compare_options',
        mission,
        mode: 'conversational',
      };
    }

    // 4. Status inquiry
    if (/\b(status|progress|where are we|what happened|how is .*going)\b/.test(normalized)) {
      if (!mission) {
        return {
          conversationId: state.id,
          reply: 'There is no active mission selected. You can tell me to plan an event, for example: Plan Dad’s 60th birthday with a budget of 40,000 rupees.',
          intent: 'status',
          mode: 'conversational',
        };
      }

      const reply = `Mission #${mission.id.slice(0, 8)} is ${mission.state.replace(/_/g, ' ')}. Planned cost is ${mission.plannedCost.toLocaleString('en-IN')} rupees out of ${mission.budget.toLocaleString('en-IN')} budget. ${mission.ledger.length} ledger actions recorded.`;
      return {
        conversationId: state.id,
        reply,
        intent: 'status',
        mission,
        mode: 'conversational',
      };
    }

    // 5. Create mission
    if (/^(plan|organize|organise|arrange)\b/.test(normalized)) {
      const budgetMatch = text.match(
        /(?:budget(?:\s+(?:is|of))?|under|within)\s*(?:inr\s*|rs\.?\s*|₹\s*)?([\d,]+(?:\.\d+)?)\s*(thousand|lakh|k)?/i
      );
      let budget: number | undefined;
      if (budgetMatch) {
        const mult = budgetMatch[2]?.toLowerCase() === 'lakh' ? 100000 : budgetMatch[2] ? 1000 : 1;
        budget = Number(budgetMatch[1].replace(/,/g, '')) * mult;
      } else if (/budget\s+(?:is\s+)?forty thousand/i.test(text)) {
        budget = 40000;
      }

      if (!budget) {
        return {
          conversationId: state.id,
          reply: 'What total budget should I allocate for this mission? For example: budget 40,000 rupees.',
          intent: 'clarify_budget',
          mode: 'conversational',
        };
      }

      const newMission = await this.store.createAsync(text, budget);
      state.activeMissionId = newMission.id;

      const reply = `I have formulated a multi-step plan for "${newMission.goal}". The scenario reserves Garden Hall for ${newMission.plannedCost.toLocaleString('en-IN')} rupees, leaving ${Math.max(0, newMission.budget - newMission.plannedCost).toLocaleString('en-IN')} buffer. Say "book it" to request booking approval.`;
      return {
        conversationId: state.id,
        reply,
        intent: 'create_mission',
        mission: newMission,
        mode: 'conversational',
      };
    }

    // 6. Request booking approval
    if (/^(approve|book it|book the venue|approve (?:the )?(?:booking|plan|mission))$/.test(normalized)) {
      if (!mission) {
        return {
          conversationId: state.id,
          reply: 'Please select or create a mission before requesting a booking.',
          intent: 'error',
          mode: 'conversational',
        };
      }

      if (mission.state === 'completed') {
        return {
          conversationId: state.id,
          reply: 'This mission is already booked and completed.',
          intent: 'already_completed',
          mission,
          mode: 'conversational',
        };
      }

      const pending = this.store.approvals.createPendingApproval(
        mission.id,
        'book_venue',
        mission.plannedCost,
        'adult'
      );

      state.pendingConfirmation = {
        operation: 'approve',
        missionId: mission.id,
        expiresAt: Date.now() + 300000,
        token: pending.token,
      };

      const reply = `This will reserve Garden Hall for ${mission.plannedCost.toLocaleString('en-IN')} rupees. Say "confirm booking" within 5 minutes to execute.`;
      return {
        conversationId: state.id,
        reply,
        intent: 'request_approval',
        mission,
        pendingApproval: {
          id: pending.id,
          action: pending.action,
          amount: pending.amount,
          expiresAt: pending.expiresAt,
          confirmationPhrase: pending.confirmationPhrase,
        },
        mode: 'conversational',
      };
    }

    // 7. Request undo
    if (/\b(undo|cancel (?:the |my )?(?:booking|reservation))\b/.test(normalized)) {
      if (!mission) {
        return {
          conversationId: state.id,
          reply: 'No active mission selected to undo.',
          intent: 'error',
          mode: 'conversational',
        };
      }

      if (mission.state !== 'completed') {
        return {
          conversationId: state.id,
          reply: `Cannot undo this mission in state "${mission.state}". Only completed bookings can be compensated.`,
          intent: 'error',
          mission,
          mode: 'conversational',
        };
      }

      const pending = this.store.approvals.createPendingApproval(
        mission.id,
        'undo',
        0,
        'adult'
      );

      state.pendingConfirmation = {
        operation: 'undo',
        missionId: mission.id,
        expiresAt: Date.now() + 300000,
        token: pending.token,
      };

      const reply = `This will cancel your booking and issue a full compensation refund. Say "confirm cancellation" to proceed.`;
      return {
        conversationId: state.id,
        reply,
        intent: 'request_undo',
        mission,
        pendingApproval: {
          id: pending.id,
          action: pending.action,
          amount: pending.amount,
          expiresAt: pending.expiresAt,
          confirmationPhrase: pending.confirmationPhrase,
        },
        mode: 'conversational',
      };
    }

    // 8. Confirm execution
    if (/^(confirm booking|confirm cancellation)$/.test(normalized) || /^confirm\b/.test(normalized)) {
      const pending = state.pendingConfirmation;
      if (!pending || pending.expiresAt < Date.now() || pending.missionId !== mission?.id) {
        return {
          conversationId: state.id,
          reply: 'There is no active confirmation pending. Ask to book or undo the mission first.',
          intent: 'no_active_confirmation',
          mission,
          mode: 'conversational',
        };
      }

      state.pendingConfirmation = undefined;

      if (pending.operation === 'approve') {
        if (normalized !== 'confirm booking') throw new Error('Say exactly confirm booking for this action.');
        const updated = this.execute ? await this.execute(pending.missionId, 'approve', { tokenOrPhrase: pending.token }) : this.store.approve(pending.missionId, { tokenOrPhrase: pending.token });
        return {
          conversationId: state.id,
          reply: 'The fictional venue is confirmed and booked! The Action Ledger recorded the cryptographic transaction.',
          intent: 'confirmed_booking',
          mission: updated,
          mode: 'conversational',
        };
      } else {
        if (normalized !== 'confirm cancellation') throw new Error('Say exactly confirm cancellation for this action.');
        const updated = this.execute ? await this.execute(pending.missionId, 'undo', { tokenOrPhrase: pending.token }) : this.store.undo(pending.missionId, { tokenOrPhrase: pending.token });
        return {
          conversationId: state.id,
          reply: 'The fictional booking is cancelled and fully compensated. The ledger recorded the refund reversal.',
          intent: 'confirmed_undo',
          mission: updated,
          mode: 'conversational',
        };
      }
    }

    // Default fallback
    return {
      conversationId: state.id,
      reply: 'I did not recognize that command. Try "Plan Dad’s 60th birthday with budget 40,000", "What’s the status?", "Compare options", "Book it", or "Undo booking".',
      intent: 'unknown',
      mission,
      mode: 'conversational',
    };
  }
}
