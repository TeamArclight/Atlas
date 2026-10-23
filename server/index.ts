import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { MissionStore } from './missions.js';
import { VenueBrowserWorker } from './browser.js';
import { ConverseService } from './converse.js';
import { LearnedSkillStore } from './skills.js';
import { verifyLedger } from './ledger.js';
import { resolve } from 'node:path';

function makeServer(
  store: MissionStore,
  worker?: VenueBrowserWorker,
  skills = new LearnedSkillStore(),
  converseService = new ConverseService(store),
  operations = new Map<string, Promise<unknown>>()
) {
  const server = new McpServer({ name: 'atlas', version: '0.2.0' });
  function result(value: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: { result: value } };
  }

  // Mission tools
  server.registerTool(
    'create_mission',
    {
      description: 'Create a simulated milestone mission requiring explicit approval. Generates a validated multi-step plan.',
      inputSchema: {
        goal: z.string().min(1).max(2000),
        budget: z.number().int().positive(),
        guests: z.number().int().positive().optional(),
        dietaryPreferences: z.string().optional(),
        eventDate: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async ({ goal, budget, guests, dietaryPreferences, eventDate, notes }) =>
      result(await store.createAsync(goal, budget, { guests, dietaryPreferences, eventDate, notes }))
  );

  server.registerTool(
    'revise_plan',
    {
      description: 'Revise mission plan with updated preferences (budget, guests, dietary preferences, notes). Generates versioned plan with before/after comparison and invalidates previous approvals.',
      inputSchema: {
        missionId: z.string().uuid(),
        budget: z.number().int().positive().optional(),
        guests: z.number().int().positive().optional(),
        eventDate: z.string().optional(),
        dietaryPreferences: z.string().optional(),
        notes: z.string().optional(),
        instruction: z.string().optional(),
      },
    },
    async ({ missionId, ...changes }) => {
      try {
        return result(await store.revisePlan(missionId, changes));
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Plan revision failed' }], isError: true };
      }
    }
  );

  server.registerTool('list_missions', { description: 'List saved missions', inputSchema: {} }, async () =>
    result(store.list())
  );

  server.registerTool(
    'verify_ledger',
    {
      description: 'Cryptographically verify the action ledger chain for a mission. Validates SHA-256 hashes, link integrity, and detects tampering or mutations.',
      inputSchema: { missionId: z.string().uuid() },
    },
    async ({ missionId }) => {
      try {
        const mission = store.get(missionId);
        return result(verifyLedger(mission.ledger));
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Ledger verification failed' }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_browser_worker_status',
    {
      description: 'Actual Playwright evidence for the fictional venue; no real money moves.',
      inputSchema: { missionId: z.string().uuid() },
    },
    async ({ missionId }) => {
      store.get(missionId);
      return result(worker?.get(missionId) ?? { status: 'idle', lastAction: 'Browser worker disabled' });
    }
  );

  server.registerTool(
    'get_mission_status',
    { description: 'Read current saved mission status and evidence.', inputSchema: { missionId: z.string().uuid() } },
    async ({ missionId }) => {
      try {
        return result(store.get(missionId));
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Action failed' }], isError: true };
      }
    }
  );

  server.registerTool(
    'approve_mission',
    {
      description: 'Explicit human approval commits a fictional venue booking. Supports contextual tokens and role verification.',
      inputSchema: {
        missionId: z.string().uuid(),
        tokenOrPhrase: z.string().min(1, 'Approval token or confirmation phrase is required.'),
        role: z.enum(['adult', 'child']).optional(),
        planVersion: z.number().int().positive().optional(),
      },
    },
    async ({ missionId, tokenOrPhrase, role, planVersion }) => {
      try {
        const previous = operations.get(missionId) ?? Promise.resolve();
        const action = previous.catch(() => undefined).then(async () => {
          const mission = store.get(missionId);
          if (mission.state === 'completed') {
            return store.approve(missionId, {
              tokenOrPhrase,
              role,
              expectedPlanVersion: planVersion,
              expectedAmount: mission.plannedCost,
            });
          }
          // Pre-execution validation runs BEFORE any browser worker side effect!
          store.approvals.verifyAndConsume(
            missionId,
            tokenOrPhrase,
            role ?? 'adult',
            false,
            planVersion,
            'book_venue',
            mission.plannedCost
          );
          if (worker && mission.state === 'awaiting_approval') await worker.execute(mission, 'book');
          return store.approve(missionId, {
            tokenOrPhrase,
            role,
            expectedPlanVersion: planVersion,
            expectedAmount: mission.plannedCost,
          });
        });
        operations.set(missionId, action);
        try {
          return result(await action);
        } finally {
          if (operations.get(missionId) === action) operations.delete(missionId);
        }
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Action failed' }], isError: true };
      }
    }
  );

  server.registerTool(
    'undo_mission',
    {
      description: 'Compensate and cancel a completed fictional booking.',
      inputSchema: {
        missionId: z.string().uuid(),
        tokenOrPhrase: z.string().min(1, 'Confirmation token or phrase is required to undo a mission.'),
        role: z.enum(['adult', 'child']).optional(),
      },
    },
    async ({ missionId, tokenOrPhrase, role }) => {
      try {
        const previous = operations.get(missionId) ?? Promise.resolve();
        const action = previous.catch(() => undefined).then(async () => {
          const mission = store.get(missionId);
          if (mission.state === 'undone') {
            return store.undo(missionId, { tokenOrPhrase, role });
          }
          // Pre-execution validation runs BEFORE any browser worker side effect!
          store.approvals.verifyAndConsume(
            missionId,
            tokenOrPhrase,
            role ?? 'adult',
            false,
            undefined,
            'undo'
          );
          if (worker && mission.state === 'completed') await worker.execute(mission, 'cancel');
          return store.undo(missionId, { tokenOrPhrase, role });
        });
        operations.set(missionId, action);
        try {
          return result(await action);
        } finally {
          if (operations.get(missionId) === action) operations.delete(missionId);
        }
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Action failed' }], isError: true };
      }
    }
  );

  // Conversational Voice Tool
  server.registerTool(
    'converse',
    {
      description: 'Modular conversational interface for Alexa+ voice and text interaction. Handles planning, clarification, options comparison, and contextual confirmations.',
      inputSchema: {
        conversationId: z.string().optional(),
        utterance: z.string().min(1),
        missionId: z.string().uuid().optional(),
        commandId: z.string().min(1),
      },
    },
    async ({ conversationId, utterance, missionId, commandId }) => {
      try {
        const response = await converseService.converse({ conversationId, utterance, missionId, commandId });
        return result(response);
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Converse failed' }], isError: true };
      }
    }
  );

  // Learned Skills Meta-Tools
  server.registerTool(
    'list_learned_skills',
    { description: 'List all registered learned skills with test verification evidence and approval status.', inputSchema: {} },
    async () => result(skills.list())
  );

  server.registerTool(
    'create_learned_skill',
    {
      description: 'Register a constrained declarative learned skill with verification test fixtures.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().min(1),
        category: z.string().min(1),
        template: z.string().min(1),
        parameters: z.record(z.string()),
        tests: z.array(
          z.object({
            input: z.record(z.number()),
            expected: z.record(z.number()),
          })
        ),
      },
    },
    async (skillData) => {
      try {
        return result(skills.create(skillData));
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Failed to create skill' }], isError: true };
      }
    }
  );

  server.registerTool(
    'test_learned_skill',
    {
      description: 'Run real test fixtures against a learned skill using safe declarative evaluation.',
      inputSchema: { skillId: z.string() },
    },
    async ({ skillId }) => {
      try {
        return result(skills.testSkill(skillId));
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Skill test failed' }], isError: true };
      }
    }
  );

  server.registerTool(
    'approve_learned_skill',
    {
      description: 'Authorize a tested learned skill for household execution. Requires adult role.',
      inputSchema: { skillId: z.string(), approverRole: z.enum(['adult', 'child']) },
    },
    async ({ skillId, approverRole }) => {
      try {
        return result(skills.approveSkill(skillId, approverRole));
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Skill approval failed' }], isError: true };
      }
    }
  );

  server.registerTool(
    'run_learned_skill',
    {
      description: 'Execute an approved learned skill with concrete inputs. Rejects unapproved or revoked skills.',
      inputSchema: { skillId: z.string(), input: z.record(z.number()) },
    },
    async ({ skillId, input }) => {
      try {
        return result(skills.runSkill(skillId, input));
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Skill execution failed' }], isError: true };
      }
    }
  );

  server.registerTool(
    'revoke_learned_skill',
    {
      description: 'Revoke authorization of a learned skill.',
      inputSchema: { skillId: z.string(), reason: z.string().min(1) },
    },
    async ({ skillId, reason }) => {
      try {
        return result(skills.revokeSkill(skillId, reason));
      } catch (e) {
        return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'Skill revocation failed' }], isError: true };
      }
    }
  );

  return server;
}

export function createApp(
  store = new MissionStore(),
  worker?: VenueBrowserWorker,
  skills = new LearnedSkillStore()
) {
  const app = express();
  const operations = new Map<string, Promise<unknown>>();
  const converseService = new ConverseService(store, async (missionId, operation, options) => {
    const previous = operations.get(missionId) ?? Promise.resolve();
    const action = previous.catch(() => undefined).then(async () => {
      const mission = store.get(missionId);
      store.approvals.verifyAndConsume(
        missionId,
        options.tokenOrPhrase,
        options.role ?? 'adult',
        false,
        options.expectedPlanVersion,
        operation === 'approve' ? 'book_venue' : 'undo'
      );
      if (worker && operation === 'approve' && mission.state === 'awaiting_approval') await worker.execute(mission, 'book');
      if (worker && operation === 'undo' && mission.state === 'completed') await worker.execute(mission, 'cancel');
      return operation === 'approve' ? store.approve(missionId, options) : store.undo(missionId, options);
    });
    operations.set(missionId, action);
    try { return await action; }
    finally { if (operations.get(missionId) === action) operations.delete(missionId); }
  });
  const allowedOrigins = new Set([
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:3001',
    'http://localhost:3001',
  ]);

  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    next();
  });

  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) =>
    res.json({
      status: 'ok',
      mode: 'simulated',
      planner: (store as any).planner?.getMode?.() ?? 'fixture',
      model: (store as any).planner?.getModelId?.() ?? 'deterministic-scenario-planner',
      browser: worker ? 'playwright' : 'disabled',
      skillsCount: skills.list().length,
    })
  );

  // Persistent fictional venue API
  app.get('/demo/api/venue/:ref', (req, res) => {
    const booking = store.provider.getBooking(req.params.ref);
    if (!booking) {
      res.json({ ref: req.params.ref, status: 'available' });
      return;
    }
    res.json(booking);
  });

  app.get('/demo/venue', (_req, res) => res.sendFile(resolve('simulator/sites/fictional-venue.html')));

  app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = makeServer(store, worker, skills, converseService, operations);
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
    }
  });

  app.all('/mcp', (_req, res) => res.status(405).end());
  return app;
}
