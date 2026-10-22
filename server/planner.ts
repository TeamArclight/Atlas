import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  validatePlanGraph as validatePlanGraphCore,
  PlanValidationError,
  type PlanValidationOptions,
  type PlanValidationResult,
} from 'atlas-plan-validator';
import type { MissionStep, AlternativeEvaluation } from '../shared/contracts.js';
import { generateGeminiPlan } from './gemini.js';

export const ALLOWED_TOOLS = new Set([
  'fictional_venue_book',
  'fictional_catering_quote',
  'fictional_cake_quote',
]);

export interface PlanGenerationResult {
  steps: MissionStep[];
  plannedCost: number;
  evaluatedAlternatives: AlternativeEvaluation[];
  mode: 'bedrock' | 'fixture' | 'gemini';
  model?: string;
  rejectionNotes?: string[];
}

export class PlannerValidationError extends PlanValidationError {
  constructor(message: string, counterexample?: Record<string, unknown>) {
    super(message, { counterexample });
    this.name = 'PlannerValidationError';
  }
}

/**
 * Deterministic graph & constraint validator.
 * Validates budget bounds, acyclic DAG dependencies, tool allowlist, and approval gates
 * using the extracted atlas-plan-validator package.
 */
export function validatePlanGraph(
  steps: MissionStep[],
  budget: number,
  options?: PlanValidationOptions
): PlanValidationResult {
  return validatePlanGraphCore(steps, budget, {
    allowedTools: ALLOWED_TOOLS,
    currency: 'INR',
    requireApprovalForPaidSteps: true,
    ...options,
  });
}

export class MissionPlanner {
  private mode: 'bedrock' | 'fixture' | 'gemini';
  private modelId: string;
  private region: string;
  private bedrockClient: BedrockRuntimeClient | null = null;

  constructor() {
    const requestedMode = process.env.PLANNER_MODE ?? 'fixture';
    if (!['gemini', 'bedrock', 'fixture'].includes(requestedMode)) throw new Error('Unknown PLANNER_MODE');
    this.mode = requestedMode as 'gemini' | 'bedrock' | 'fixture';
    this.modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
    this.region = process.env.AWS_REGION || 'us-east-1';
    if (this.mode === 'gemini') this.modelId = process.env.GEMINI_MODEL ?? 'not-configured';

    if (this.mode === 'bedrock') {
      this.bedrockClient = new BedrockRuntimeClient({
        region: this.region,
      });
    }
  }

  getMode() {
    return this.mode;
  }

  getModelId() {
    return this.modelId;
  }

  /**
   * Generates a validated multi-step mission plan.
   * Compares venue/catering/cake options, rejects over-budget options with counterexamples,
   * and verifies the plan graph deterministically.
   */
  async planMission(goal: string, budget: number): Promise<PlanGenerationResult> {
    if (this.mode === 'gemini') {
      const plan = await generateGeminiPlan(goal, budget);
      const validation = validatePlanGraph(plan.steps, budget);
      if (!validation.valid) throw new PlannerValidationError(validation.errors.join('; '));
      return { ...plan, plannedCost: validation.totalCost, mode: 'gemini', model: this.modelId };
    }
    if (this.mode === 'bedrock') {
      return this.planWithBedrock(goal, budget);
    }
    return this.planWithFixtures(goal, budget);
  }

  public planWithFixtures(goal: string, budget: number): PlanGenerationResult {
    // Deterministic alternative evaluation
    const alternatives: AlternativeEvaluation[] = [
      {
        name: 'Royal Heritage Palace Grand Lawn',
        category: 'venue',
        cost: 35000,
        accepted: false,
        rejectionReason:
          'Venue cost (INR 35,000) leaves only INR 5,000 for catering and cake, which is insufficient for 25 attendees.',
      },
      {
        name: 'Garden Hall (The Grand Orchid)',
        category: 'venue',
        cost: 12000,
        accepted: true,
      },
      {
        name: 'Luxury 7-Course Banquet',
        category: 'catering',
        cost: 32000,
        accepted: false,
        rejectionReason:
          'Combined with venue (INR 12,000), total would reach INR 44,000, exceeding INR 40,000 budget.',
      },
      {
        name: 'Gourmet Celebration Buffet (25 pax)',
        category: 'catering',
        cost: 15000,
        accepted: true,
      },
      {
        name: 'Custom Milestone 3-Tier Cake',
        category: 'cake',
        cost: 3500,
        accepted: true,
      },
    ];

    // Primary plan steps: Venue booking is the financial commitment step (INR 12,000)
    // Catering and cake quotes are evaluated companion steps
    const steps: MissionStep[] = [
      {
        id: 'venue_booking',
        title: 'Reserve fictional Garden Hall for INR 12,000',
        tool: 'fictional_venue_book',
        args: {
          venueName: 'Garden Hall',
          guests: 25,
          slot: 'Saturday evening',
          price: 12000,
        },
        costBound: 12000,
        dependencies: [],
        requiresApproval: true,
        state: 'pending',
      },
      {
        id: 'catering_quote',
        title: 'Review Gourmet Celebration Buffet quote for 25 people (INR 15,000)',
        tool: 'fictional_catering_quote',
        args: {
          tier: 'gourmet',
          guests: 25,
          price: 15000,
        },
        costBound: 0,
        dependencies: ['venue_booking'],
        requiresApproval: false,
        state: 'completed',
        result: { quote: 'INR 15,000 for 25 guests', supplier: 'Gourmet Delights' },
      },
      {
        id: 'cake_quote',
        title: 'Review 3kg Milestone Birthday Cake quote (INR 3,500)',
        tool: 'fictional_cake_quote',
        args: {
          flavor: 'Belgian Chocolate Truffle',
          weightKg: 3,
          price: 3500,
        },
        costBound: 0,
        dependencies: ['venue_booking'],
        requiresApproval: false,
        state: 'completed',
        result: { quote: 'INR 3,500', baker: 'Sweet Celebrations' },
      },
    ];

    const validation = validatePlanGraph(steps, budget);
    if (!validation.valid) {
      throw new PlannerValidationError(
        `Plan validation failed: ${validation.errors.join('; ')}`,
        { budget, totalCost: validation.totalCost }
      );
    }

    return {
      steps,
      plannedCost: 12000, // Fictional venue booking commitment
      evaluatedAlternatives: alternatives,
      mode: 'fixture',
      model: 'deterministic-scenario-planner',
      rejectionNotes: alternatives
        .filter((a) => !a.accepted)
        .map((a) => `${a.name}: ${a.rejectionReason}`),
    };
  }

  private async planWithBedrock(goal: string, budget: number): Promise<PlanGenerationResult> {
    if (!this.bedrockClient) {
      throw new Error('Bedrock client is uninitialized. Configure AWS credentials and AWS_REGION.');
    }

    const systemPrompt = `You are the Atlas Household Mission Planner.
Your task is to generate a structured JSON plan for a household milestone event.
You must adhere strictly to the budget constraint: INR ${budget}.
You may only assign tools from this allowlist:
- "fictional_venue_book" (fictional venue reservation)
- "fictional_catering_quote" (catering buffet quote)
- "fictional_cake_quote" (custom cake order)

Respond ONLY with a valid JSON object matching this schema:
{
  "steps": [
    {
      "id": string,
      "title": string,
      "tool": "fictional_venue_book" | "fictional_catering_quote" | "fictional_cake_quote",
      "args": object,
      "costBound": number,
      "dependencies": string[],
      "requiresApproval": boolean
    }
  ],
  "evaluatedAlternatives": [
    {
      "name": string,
      "category": "venue" | "catering" | "cake",
      "cost": number,
      "accepted": boolean,
      "rejectionReason": string (optional if accepted)
    }
  ]
}`;

    const userPrompt = `Goal: "${goal}". Total Budget: INR ${budget}. Generate plan now.`;

    let attempts = 0;
    const maxAttempts = 2;
    let lastError: Error | null = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const payload = JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 1200,
          temperature: 0.1,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const command = new InvokeModelCommand({
          modelId: this.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: Buffer.from(payload),
        });

        const response = await this.bedrockClient.send(command);
        const rawJson = new TextDecoder().decode(response.body);
        const parsed = JSON.parse(rawJson);

        const contentText =
          parsed.content?.[0]?.text ||
          parsed.generation ||
          parsed.choices?.[0]?.message?.content ||
          '';

        const jsonMatch = contentText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Model did not return valid JSON.');
        }

        const planData = JSON.parse(jsonMatch[0]);
        const steps: MissionStep[] = (planData.steps || []).map((s: any) => ({
          ...s,
          state: 'pending',
        }));

        const validation = validatePlanGraph(steps, budget);
        if (!validation.valid) {
          throw new PlannerValidationError(
            `Bedrock proposed plan failed deterministic validation: ${validation.errors.join('; ')}`
          );
        }

        return {
          steps,
          plannedCost: validation.totalCost,
          evaluatedAlternatives: planData.evaluatedAlternatives || [],
          mode: 'bedrock',
          model: this.modelId,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new Error(
      `Bedrock planning failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }
}
