import { randomUUID } from 'node:crypto';
import type { Mission, ConverseInput, ConverseOutput } from '../shared/contracts.js';
import { MissionStore } from './missions.js';
import { interpretGeminiUtterance, type InterpretedCommand } from './gemini.js';

interface ConversationState {
  id: string;
  history: { role: 'user' | 'assistant'; text: string; timestamp: string }[];
  activeMissionId?: string;
  pendingConfirmation?: {
    operation: 'approve' | 'undo';
    missionId: string;
    planVersion: number;
    expiresAt: number;
    token?: string;
    expectedPhrase: string;
  };
}

export class ConverseService {
  private conversations = new Map<string, ConversationState>();
  private processedCommands = new Map<string, ConverseOutput>(); // commandId deduplication

  constructor(
    private store: MissionStore,
    private execute?: (
      missionId: string,
      operation: 'approve' | 'undo',
      options: {
        tokenOrPhrase?: string;
        role?: 'adult' | 'child';
        expectedPlanVersion?: number;
      }
    ) => Promise<Mission>
  ) {}

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
    const missionId = passedMissionId || state.activeMissionId;
    let mission: Mission | undefined;

    if (missionId) {
      try {
        mission = this.store.get(missionId);
      } catch {
        // Mission not found
      }
    }

    // Determine planner mode
    const plannerMode = (this.store as any).planner?.getMode?.() ?? 'fixture';

    // 1. Interpret command: use Gemini when in gemini mode; use deterministic interpreter in fixture mode
    let command: InterpretedCommand;
    if (plannerMode === 'gemini') {
      const summary = mission
        ? {
            id: mission.id,
            version: mission.version,
            goal: mission.goal,
            budget: mission.budget,
            plannedCost: mission.plannedCost,
            state: mission.state,
            preferences: mission.preferences,
            bookedServices: mission.steps
              .filter((s) => s.state === 'completed')
              .map((s) => s.title),
          }
        : undefined;

      command = await interpretGeminiUtterance({
        utterance: text,
        missionSummary: summary,
        history: state.history,
      });
    } else {
      command = this.interpretDeterministically(text, mission);
    }

    // 2. Dispatch validated command to deterministic application logic
    return this.dispatchCommand(state, command, text, mission);
  }

  /**
   * Deterministic command interpreter for fixture and fallback modes.
   * Understands goal formulation, follow-up revisions, options comparisons, status, approvals, and undo.
   */
  private interpretDeterministically(text: string, mission?: Mission): InterpretedCommand {
    const cleaned = text.trim().replace(/^(?:hey\s+)?(?:alexa|atlas)[,\s]+/i, '').trim();
    const normalized = cleaned.toLowerCase().replace(/[.!?]/g, '').trim();

    // 1. Cancel active confirmation
    if (/^(cancel|never mind|nevermind|stop|abort)$/.test(normalized)) {
      return { intent: 'cancel_confirmation', confidence: 1.0 };
    }

    // 2. Help
    if (/^(help|what can you do|what are your capabilities)$/.test(normalized)) {
      return { intent: 'help', confidence: 1.0 };
    }

    // 3. Confirm execution
    if (/^(confirm booking|confirm cancellation)$/.test(normalized) || /^confirm\b/.test(normalized)) {
      return {
        intent: 'confirm_action',
        confidence: 1.0,
        extractedParameters: { confirmationPhrase: normalized },
      };
    }

    // 4. Request booking approval
    if (/^(approve|book it|book the venue|approve (?:the )?(?:booking|plan|mission))$/.test(normalized)) {
      return { intent: 'request_approval', confidence: 1.0 };
    }

    // 5. Request undo
    if (/\b(undo|cancel (?:the |my )?(?:booking|reservation))\b/.test(normalized)) {
      return { intent: 'request_undo', confidence: 1.0 };
    }

    // 6. Compare options / Explain decision
    if (/\b(compare|alternatives|options|why did you (?:choose|pick|select)|why not)\b/.test(normalized)) {
      return { intent: 'compare_options', confidence: 1.0, extractedParameters: { instruction: text } };
    }

    // 7. Query status or what has been booked
    if (/\b(what have you booked|what has been booked|booked so far)\b/.test(normalized)) {
      return { intent: 'query_status', confidence: 1.0, extractedParameters: { instruction: 'booked_services' } };
    }
    if (/\b(status|progress|where are we|what happened|how is .*going)\b/.test(normalized)) {
      return { intent: 'query_status', confidence: 1.0 };
    }

    // 8. Follow-up revisions on active mission
    if (mission && mission.state !== 'completed') {
      // "make it cheaper" / "reduce budget to X"
      if (/\b(cheaper|lower budget|reduce budget|budget to)\b/.test(normalized)) {
        const budgetMatch = text.match(/(?:to|of)?\s*(?:inr\s*|rs\.?\s*|₹\s*)?([\d,]+)/i);
        const newBudget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, '')) : Math.max(12000, mission.budget - 5000);
        return {
          intent: 'revise_plan',
          confidence: 0.95,
          extractedParameters: { budget: newBudget, instruction: 'make it cheaper' },
        };
      }

      // "only vegetarian food" / "make it vegetarian"
      if (/\b(vegetarian|veg only|pure veg|no meat)\b/.test(normalized)) {
        return {
          intent: 'revise_plan',
          confidence: 0.95,
          extractedParameters: { dietaryPreferences: 'vegetarian', instruction: 'only vegetarian food' },
        };
      }

      // "change it to 30 guests" / "30 guests" / "guests to X"
      const guestMatch = text.match(/(?:change (?:it )?to|for|make it)?\s*(\d+)\s*(?:guests|people|pax|attendees)/i);
      if (guestMatch) {
        return {
          intent: 'revise_plan',
          confidence: 0.95,
          extractedParameters: { guests: Number(guestMatch[1]), instruction: `change to ${guestMatch[1]} guests` },
        };
      }
    }

    // 9. Create mission
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

      const guestMatch = text.match(/(\d+)\s*(?:people|guests|attendees|pax)/i);
      const guests = guestMatch ? Number(guestMatch[1]) : 25;
      const isVeg = /\b(veg|vegetarian)\b/i.test(text);

      return {
        intent: 'create_mission',
        confidence: 0.9,
        extractedParameters: {
          goal: text,
          budget,
          guests,
          dietaryPreferences: isVeg ? 'vegetarian' : 'regular',
        },
      };
    }

    return { intent: 'unknown', confidence: 0.2 };
  }

  /**
   * Dispatches an interpreted command to deterministic authorization and mission store logic.
   */
  private async dispatchCommand(
    state: ConversationState,
    command: InterpretedCommand,
    rawText: string,
    mission?: Mission
  ): Promise<ConverseOutput> {
    // 1. Cancel confirmation
    if (command.intent === 'cancel_confirmation') {
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
    if (command.intent === 'help') {
      return {
        conversationId: state.id,
        reply:
          'I can formulate milestone event plans, compare options, handle revisions ("make it cheaper", "only vegetarian food", "30 guests"), check status, request booking approvals with one-time confirmations, and compensate bookings.',
        intent: 'help',
        mission,
        mode: 'conversational',
      };
    }

    // 3. Query status
    if (command.intent === 'query_status') {
      if (!mission) {
        return {
          conversationId: state.id,
          reply:
            'There is no active mission selected. You can tell me to plan an event, for example: "Plan Dad’s 60th birthday with a budget of 40,000 rupees."',
          intent: 'status',
          mode: 'conversational',
        };
      }

      if (command.extractedParameters?.instruction === 'booked_services') {
        const booked = mission.steps.filter((s) => s.state === 'completed' && s.tool?.includes('book'));
        if (booked.length === 0) {
          return {
            conversationId: state.id,
            reply: `No services have been committed yet for mission #${mission.id.slice(0, 8)} (v${mission.version}). Planned venue is Garden Hall for INR ${mission.plannedCost.toLocaleString('en-IN')}, awaiting your approval.`,
            intent: 'status',
            mission,
            mode: 'conversational',
          };
        }
        return {
          conversationId: state.id,
          reply: `Currently booked services: ${booked.map((b) => b.title).join('; ')}. Reference #ATLAS-${mission.id.slice(0, 8).toUpperCase()}. Recorded in Action Ledger.`,
          intent: 'status',
          mission,
          mode: 'conversational',
        };
      }

      const reply = `Mission #${mission.id.slice(0, 8)} (plan v${mission.version}) is ${mission.state.replace(/_/g, ' ')}. Planned commitment is INR ${mission.plannedCost.toLocaleString('en-IN')} out of INR ${mission.budget.toLocaleString('en-IN')} budget for ${mission.preferences?.guests ?? 25} guests (${mission.preferences?.dietaryPreferences ?? 'regular'}). ${mission.ledger.length} ledger actions recorded.`;
      return {
        conversationId: state.id,
        reply,
        intent: 'status',
        mission,
        mode: 'conversational',
      };
    }

    // 4. Compare options
    if (command.intent === 'compare_options' || command.intent === 'explain_decision') {
      if (!mission) {
        return {
          conversationId: state.id,
          reply:
            'We evaluated multiple options for Dad’s 60th birthday: Royal Heritage Palace (35,000 rupees) was rejected because it leaves only 5,000 for catering and cake. Garden Hall (12,000 rupees) was selected, preserving a safe budget buffer.',
          intent: 'compare_options',
          mode: 'conversational',
        };
      }

      const alternatives = mission.planner?.evaluatedAlternatives || [];
      const rejected = alternatives.filter((a) => !a.accepted);
      const accepted = alternatives.filter((a) => a.accepted);

      const reply = `We evaluated multiple options: ${accepted.map((a) => `${a.name} (INR ${a.cost.toLocaleString('en-IN')})`).join(', ')} were selected. ${rejected.map((a) => `${a.name} was rejected because ${a.rejectionReason}`).join(' ')}`;
      return {
        conversationId: state.id,
        reply,
        intent: 'compare_options',
        mission,
        mode: 'conversational',
      };
    }

    // 5. Plan revision (follow-ups)
    if (command.intent === 'revise_plan') {
      if (!mission) {
        return {
          conversationId: state.id,
          reply: 'Please select or create an active mission before revising parameters.',
          intent: 'error',
          mode: 'conversational',
        };
      }

      try {
        const dietaryFallback = /\b(vegetarian|pure veg|veg only)\b/i.test(rawText)
          ? 'vegetarian'
          : undefined;
        const guestMatch = rawText.match(/(\d+)\s*(?:guests|people|pax|attendees)/i);
        const guestFallback = guestMatch ? Number(guestMatch[1]) : undefined;
        const budgetMatch = rawText.match(
          /(?:budget(?:\s+(?:is|of|to))?|under|within)\s*(?:inr\s*|rs\.?\s*|₹\s*)?([\d,]+)/i
        );
        const budgetFallback = budgetMatch ? Number(budgetMatch[1].replace(/,/g, '')) : undefined;

        const revision = await this.store.revisePlan(mission.id, {
          budget: command.extractedParameters?.budget ?? budgetFallback,
          guests: command.extractedParameters?.guests ?? guestFallback,
          dietaryPreferences: command.extractedParameters?.dietaryPreferences ?? dietaryFallback,
          eventDate: command.extractedParameters?.eventDate,
          instruction: command.extractedParameters?.instruction,
        });

        // Invalidate conversational confirmation state bound to old version
        state.pendingConfirmation = undefined;

        const reply = `I have updated the plan to version ${revision.mission.version}. ${revision.revisionSummary} Any previous approval tokens have been invalidated. Say "book it" to request approval for the updated plan.`;

        return {
          conversationId: state.id,
          reply,
          intent: 'revise_plan',
          mission: revision.mission,
          mode: 'conversational',
        };
      } catch (err: any) {
        return {
          conversationId: state.id,
          reply: `Could not revise plan: ${err.message}`,
          intent: 'error',
          mission,
          mode: 'conversational',
        };
      }
    }

    // 6. Create mission
    if (command.intent === 'create_mission') {
      const budgetMatch = rawText.match(
        /(?:budget(?:\s+(?:is|of))?|under|within)\s*(?:inr\s*|rs\.?\s*|₹\s*)?([\d,]+(?:\.\d+)?)\s*(thousand|lakh|k)?/i
      );
      let budgetFallback: number | undefined;
      if (budgetMatch) {
        const mult = budgetMatch[2]?.toLowerCase() === 'lakh' ? 100000 : budgetMatch[2] ? 1000 : 1;
        budgetFallback = Number(budgetMatch[1].replace(/,/g, '')) * mult;
      }

      const budget = command.extractedParameters?.budget ?? budgetFallback;
      if (!budget) {
        return {
          conversationId: state.id,
          reply: 'What total budget should I allocate for this mission? For example: budget 40,000 rupees.',
          intent: 'clarify_budget',
          mode: 'conversational',
        };
      }

      const guestMatch = rawText.match(/(\d+)\s*(?:people|guests|attendees|pax)/i);
      const guestFallback = guestMatch ? Number(guestMatch[1]) : 25;

      const newMission = await this.store.createAsync(rawText, budget, {
        guests: command.extractedParameters?.guests ?? guestFallback,
        dietaryPreferences: command.extractedParameters?.dietaryPreferences ?? 'regular',
        eventDate: command.extractedParameters?.eventDate ?? 'Saturday evening',
      });
      state.activeMissionId = newMission.id;

      const reply = `I have formulated plan v1 for "${newMission.goal}". The scenario reserves Garden Hall for ${newMission.plannedCost.toLocaleString('en-IN')} rupees for ${newMission.preferences?.guests ?? 25} guests, leaving ${Math.max(0, newMission.budget - newMission.plannedCost).toLocaleString('en-IN')} buffer. Say "book it" to request booking approval.`;
      return {
        conversationId: state.id,
        reply,
        intent: 'create_mission',
        mission: newMission,
        mode: 'conversational',
      };
    }

    // 7. Request booking approval
    if (command.intent === 'request_approval') {
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
        mission.version,
        'adult',
        `Commit Garden Hall reservation (plan v${mission.version}) for INR ${mission.plannedCost.toLocaleString('en-IN')}`
      );

      state.pendingConfirmation = {
        operation: 'approve',
        missionId: mission.id,
        planVersion: mission.version,
        expiresAt: Date.now() + 300000,
        token: pending.token,
        expectedPhrase: pending.confirmationPhrase,
      };

      const reply = `This will reserve Garden Hall (plan v${mission.version}) for ${mission.plannedCost.toLocaleString('en-IN')} rupees. Say "${pending.confirmationPhrase}" within 5 minutes to execute.`;
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

    // 8. Request undo
    if (command.intent === 'request_undo') {
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
        mission.version,
        'adult',
        'Compensate and cancel completed booking'
      );

      state.pendingConfirmation = {
        operation: 'undo',
        missionId: mission.id,
        planVersion: mission.version,
        expiresAt: Date.now() + 300000,
        token: pending.token,
        expectedPhrase: pending.confirmationPhrase,
      };

      const reply = `This will cancel your booking and issue a full compensation refund. Say "${pending.confirmationPhrase}" to proceed.`;
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

    // 9. Confirm action (approve or undo)
    if (command.intent === 'confirm_action') {
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

      // The model may classify a turn, but it cannot supply the user's consent.
      const phraseInput = rawText.trim().replace(/[.!?]+$/, '').trim().toLowerCase();
      const expectedPhrase = pending.expectedPhrase.toLowerCase();

      // Enforce exact confirmation phrase; generic "yes" is rejected
      if (phraseInput !== expectedPhrase && phraseInput !== (pending.token ?? '').toLowerCase()) {
        return {
          conversationId: state.id,
          reply: `Confirmation failed: Expected exact phrase "${pending.expectedPhrase}" or token code "${pending.token}". Generic or partial replies are not accepted.`,
          intent: 'unknown',
          mission,
          mode: 'conversational',
        };
      }

      state.pendingConfirmation = undefined;

      if (pending.operation === 'approve') {
        const updated = this.execute
          ? await this.execute(pending.missionId, 'approve', {
              tokenOrPhrase: pending.token,
              expectedPlanVersion: pending.planVersion,
            })
          : this.store.approve(pending.missionId, {
              tokenOrPhrase: pending.token,
              expectedPlanVersion: pending.planVersion,
            });

        return {
          conversationId: state.id,
          reply: `The fictional venue is confirmed and booked for plan v${pending.planVersion}! The Action Ledger recorded the cryptographic transaction.`,
          intent: 'confirmed_booking',
          mission: updated,
          mode: 'conversational',
        };
      } else {
        const updated = this.execute
          ? await this.execute(pending.missionId, 'undo', {
              tokenOrPhrase: pending.token,
            })
          : this.store.undo(pending.missionId, {
              tokenOrPhrase: pending.token,
            });

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
      reply:
        'I did not recognize that command. Try "Plan Dad’s 60th birthday with budget 40,000", "Make it cheaper", "Only vegetarian food", "What’s the status?", "Compare options", "Book it", or "Undo booking".',
      intent: 'unknown',
      mission,
      mode: 'conversational',
    };
  }
}
