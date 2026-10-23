import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  validatePlanGraph as validatePlanGraphCore,
  PlanValidationError,
  type PlanValidationOptions,
  type PlanValidationResult,
} from 'atlas-plan-validator';
import type { MissionStep, AlternativeEvaluation, MissionPreferences } from '../shared/contracts.js';
import { generateGeminiPlan } from './gemini.js';

export const ALLOWED_TOOLS = new Set([
  'fictional_venue_book',
  'fictional_catering_quote',
  'fictional_cake_quote',
  'fictional_catering_order',
  'fictional_cake_order',
]);

export interface PlanGenerationResult {
  steps: MissionStep[];
  plannedCost: number;
  evaluatedAlternatives: AlternativeEvaluation[];
  mode: 'bedrock' | 'fixture' | 'gemini';
  model?: string;
  rejectionNotes?: string[];
  preferences?: MissionPreferences;
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
  async planMission(
    goal: string,
    budget: number,
    preferences?: Partial<MissionPreferences>
  ): Promise<PlanGenerationResult> {
    if (this.mode === 'gemini') {
      const plan = await generateGeminiPlan(goal, budget, { preferences });
      const validation = validatePlanGraph(plan.steps, budget);
      if (!validation.valid) throw new PlannerValidationError(validation.errors.join('; '));
      return { ...plan, plannedCost: validation.totalCost, mode: 'gemini', model: this.modelId };
    }
    if (this.mode === 'bedrock') {
      return this.planWithBedrock(goal, budget);
    }
    return this.planWithFixtures(goal, budget, preferences);
  }

  public planWithFixtures(
    goal: string,
    budget: number,
    prefs?: Partial<MissionPreferences>
  ): PlanGenerationResult {
    const guests = prefs?.guests ?? 25;
    const dietary = prefs?.dietaryPreferences ?? 'regular';
    const isVeg = dietary.toLowerCase().includes('veg');

    const cateringRate = isVeg ? 480 : 600;
    const cateringName = isVeg ? 'Royal Vegetarian Feast' : 'Gourmet Celebration Buffet';
    const cateringCost = cateringRate * guests;
    const cakeCost = 3500;
    const venueCost = 12000;

    // Deterministic alternative evaluation
    const luxuryCateringCost = 1280 * guests;
    const alternatives: AlternativeEvaluation[] = [
      {
        name: 'Royal Heritage Palace Grand Lawn',
        category: 'venue',
        cost: 35000,
        accepted: false,
        rejectionReason: `Venue cost (INR 35,000) leaves only INR ${(budget - 35000).toLocaleString('en-IN')} for catering and cake, which is insufficient for ${guests} attendees.`,
      },
      {
        name: 'Garden Hall (The Grand Orchid)',
        category: 'venue',
        cost: venueCost,
        accepted: true,
      },
      {
        name: 'Luxury 7-Course Banquet',
        category: 'catering',
        cost: luxuryCateringCost,
        accepted: false,
        rejectionReason: `Combined with venue (INR 12,000), total would reach INR ${(venueCost + luxuryCateringCost).toLocaleString('en-IN')}, exceeding INR ${budget.toLocaleString('en-IN')} budget.`,
      },
      {
        name: `${cateringName} (${guests} pax)`,
        category: 'catering',
        cost: cateringCost,
        accepted: true,
      },
      {
        name: 'Custom Milestone 3-Tier Cake',
        category: 'cake',
        cost: cakeCost,
        accepted: true,
      },
    ];

    const services = prefs?.services ?? ['venue'];
    const isMultiService = services.includes('catering') && services.includes('cake');

    const steps: MissionStep[] = isMultiService
      ? [
          {
            id: 'venue_booking',
            title: `Reserve fictional Garden Hall for INR ${venueCost.toLocaleString('en-IN')}`,
            tool: 'fictional_venue_book',
            args: {
              venueName: 'Garden Hall',
              guests,
              slot: prefs?.eventDate ?? 'Saturday evening',
              price: venueCost,
            },
            costBound: venueCost,
            dependencies: [],
            requiresApproval: true,
            state: 'pending',
          },
          {
            id: 'catering_booking',
            title: `Book ${cateringName} for ${guests} guests (INR ${cateringCost.toLocaleString('en-IN')})`,
            tool: 'fictional_catering_order',
            args: {
              tier: isVeg ? 'veg_feast' : 'gourmet_buffet',
              guests,
              dietary: isVeg ? 'vegetarian' : 'regular',
              price: cateringCost,
            },
            costBound: cateringCost,
            dependencies: ['venue_booking'],
            requiresApproval: true,
            state: 'pending',
          },
          {
            id: 'cake_booking',
            title: `Book 3kg Milestone Birthday Cake (INR ${cakeCost.toLocaleString('en-IN')})`,
            tool: 'fictional_cake_order',
            args: {
              flavor: 'Belgian Chocolate Truffle',
              itemKey: 'milestone_truffle_3kg',
              price: cakeCost,
            },
            costBound: cakeCost,
            dependencies: ['catering_booking'],
            requiresApproval: true,
            state: 'pending',
          },
        ]
      : [
          {
            id: 'venue_booking',
            title: `Reserve fictional Garden Hall for INR ${venueCost.toLocaleString('en-IN')}`,
            tool: 'fictional_venue_book',
            args: {
              venueName: 'Garden Hall',
              guests,
              slot: prefs?.eventDate ?? 'Saturday evening',
              price: venueCost,
            },
            costBound: venueCost,
            dependencies: [],
            requiresApproval: true,
            state: 'pending',
          },
          {
            id: 'catering_quote',
            title: `Review ${cateringName} quote for ${guests} people (INR ${cateringCost.toLocaleString('en-IN')})`,
            tool: 'fictional_catering_quote',
            args: {
              tier: isVeg ? 'vegetarian' : 'gourmet',
              guests,
              dietary: isVeg ? 'vegetarian' : 'regular',
              price: cateringCost,
            },
            costBound: 0,
            dependencies: ['venue_booking'],
            requiresApproval: false,
            state: 'completed',
            result: {
              quote: `INR ${cateringCost.toLocaleString('en-IN')} for ${guests} guests`,
              supplier: isVeg ? 'Royal Veg Caterers' : 'Gourmet Delights',
              dietary: isVeg ? 'Vegetarian' : 'Standard',
            },
          },
          {
            id: 'cake_quote',
            title: `Review 3kg Milestone Birthday Cake quote (INR ${cakeCost.toLocaleString('en-IN')})`,
            tool: 'fictional_cake_quote',
            args: {
              flavor: 'Belgian Chocolate Truffle',
              weightKg: Math.max(2, Math.ceil(guests * 0.1)),
              price: cakeCost,
            },
            costBound: 0,
            dependencies: ['venue_booking'],
            requiresApproval: false,
            state: 'completed',
            result: { quote: `INR ${cakeCost.toLocaleString('en-IN')}`, baker: 'Sweet Celebrations' },
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
      plannedCost: validation.totalCost,
      evaluatedAlternatives: alternatives,
      mode: 'fixture',
      model: 'deterministic-scenario-planner',
      rejectionNotes: alternatives
        .filter((a) => !a.accepted)
        .map((a) => `${a.name}: ${a.rejectionReason}`),
      preferences: {
        guests,
        eventDate: prefs?.eventDate ?? 'Saturday evening',
        budget,
        dietaryPreferences: dietary,
        notes: prefs?.notes,
        services,
      },
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
        const command = new InvokeModelCommand({
          modelId: this.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 1500,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            temperature: 0.2,
          }),
        });

        const response = await this.bedrockClient.send(command);
        const rawBody = new TextDecoder().decode(response.body);
        const parsed = JSON.parse(rawBody);

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
