import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Mission, ProtocolLog, ServerHealth } from '../types.js';

type ProtocolLogListener = (log: ProtocolLog) => void;

class McpManager {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private listeners: Set<ProtocolLogListener> = new Set();
  private pendingRequests: Map<string | number, { method: string; startTime: number }> = new Map();
  private logHistory: ProtocolLog[] = [];

  constructor() {
    // Retain singleton
  }

  public subscribe(listener: ProtocolLogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getLogs(): ProtocolLog[] {
    return [...this.logHistory];
  }

  public clearLogs(): void {
    this.logHistory = [];
  }

  private emitLog(log: ProtocolLog): void {
    this.logHistory.unshift(log);
    // Keep last 200 logs
    if (this.logHistory.length > 200) {
      this.logHistory.pop();
    }
    for (const listener of this.listeners) {
      try {
        listener(log);
      } catch (err) {
        console.error('Error in protocol log listener:', err);
      }
    }
  }

  private redactSensitive(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map((item) => this.redactSensitive(item));

    const redactedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('authorization') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('apikey')
      ) {
        redactedObj[key] = '[REDACTED]';
      } else if (typeof val === 'object' && val !== null) {
        redactedObj[key] = this.redactSensitive(val);
      } else {
        redactedObj[key] = val;
      }
    }
    return redactedObj;
  }

  /**
   * Instrumented fetch that intercepts actual JSON-RPC requests & responses
   * over Streamable HTTP transport and emits them to the Protocol Inspector.
   */
  private createInstrumentedFetch(): typeof fetch {
    const self = this;
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const startTime = performance.now();
      let requestPayload: any = null;
      let rpcId: string | number | undefined;
      let method: string | undefined;

      if (init?.body && typeof init.body === 'string') {
        try {
          requestPayload = JSON.parse(init.body);
          if (Array.isArray(requestPayload)) {
            method = requestPayload.map((r) => r.method).join(', ');
            rpcId = requestPayload.map((r) => r.id).join(', ');
          } else if (requestPayload && typeof requestPayload === 'object') {
            rpcId = requestPayload.id;
            method = requestPayload.method;
          }
        } catch {
          requestPayload = init.body;
        }

        if (rpcId !== undefined && method) {
          self.pendingRequests.set(rpcId, { method, startTime });
        }

        self.emitLog({
          id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          direction: 'outgoing',
          type: 'request',
          method: method || 'HTTP POST',
          rpcId,
          payload: self.redactSensitive(requestPayload),
          redacted: true,
          statusText: 'Outgoing JSON-RPC',
        });
      }

      try {
        const response = await fetch(input, init);
        const durationMs = Math.round(performance.now() - startTime);

        // Clone response to inspect body without consuming the stream for the SDK
        const clonedResponse = response.clone();
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json') || contentType.includes('text/event-stream')) {
          void clonedResponse
            .text()
            .then((text) => {
              if (!text.trim()) return;
              let responsePayload: any = text;
              let respRpcId: string | number | undefined = rpcId;
              let respMethod: string | undefined = method;

              try {
                responsePayload = JSON.parse(text);
                if (responsePayload && typeof responsePayload === 'object') {
                  if (responsePayload.id !== undefined) {
                    respRpcId = responsePayload.id;
                    const reqInfo = self.pendingRequests.get(responsePayload.id);
                    if (reqInfo) {
                      respMethod = reqInfo.method;
                      self.pendingRequests.delete(responsePayload.id);
                    }
                  }
                }
              } catch {
                // Not standard JSON, could be SSE chunk
                responsePayload = text;
              }

              self.emitLog({
                id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                timestamp: new Date().toISOString(),
                direction: 'incoming',
                type: response.ok ? 'response' : 'error',
                method: respMethod,
                rpcId: respRpcId,
                durationMs,
                payload: self.redactSensitive(responsePayload),
                redacted: true,
                statusText: `${response.status} ${response.statusText}`,
              });
            })
            .catch(() => {
              // Non-blocking log inspection
            });
        }

        return response;
      } catch (networkError) {
        const durationMs = Math.round(performance.now() - startTime);
        self.emitLog({
          id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          direction: 'incoming',
          type: 'error',
          method,
          rpcId,
          durationMs,
          payload: { error: networkError instanceof Error ? networkError.message : String(networkError) },
          redacted: false,
          statusText: 'Network / Transport Error',
        });
        throw networkError;
      }
    };
  }

  public async getHealth(): Promise<ServerHealth> {
    const res = await fetch('/health');
    if (!res.ok) {
      throw new Error(`Health check failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as ServerHealth;
  }

  public async connect(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    const mcpUrl = new URL('/mcp', window.location.origin);
    const instrumentedFetch = this.createInstrumentedFetch();

    this.transport = new StreamableHTTPClientTransport(mcpUrl, {
      fetch: instrumentedFetch,
    });

    const client = new Client(
      { name: 'atlas-simulator-web', version: '0.1.0' },
      { capabilities: {} }
    );

    await client.connect(this.transport);
    this.client = client;
    return client;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (err) {
        console.warn('Error during MCP client close:', err);
      }
      this.client = null;
      this.transport = null;
    }
  }

  public isConnected(): boolean {
    return this.client !== null;
  }

  private parseToolResult<T>(rawResult: unknown): T {
    const anyResult = rawResult as any;
    if (anyResult?.isError) {
      const errText = anyResult.content?.[0]?.text || 'MCP tool execution failed';
      throw new Error(errText);
    }

    if (anyResult?.structuredContent?.result !== undefined) {
      return anyResult.structuredContent.result as T;
    }

    if (Array.isArray(anyResult?.content) && anyResult.content[0]?.text) {
      try {
        return JSON.parse(anyResult.content[0].text) as T;
      } catch {
        return anyResult.content[0].text as unknown as T;
      }
    }

    return rawResult as T;
  }

  public async createMission(goal: string, budget: number): Promise<Mission> {
    const client = await this.connect();
    const result = await client.callTool({
      name: 'create_mission',
      arguments: { goal, budget },
    });
    return this.parseToolResult<Mission>(result);
  }

  public async listMissions(): Promise<Mission[]> {
    const client = await this.connect();
    const result = await client.callTool({
      name: 'list_missions',
      arguments: {},
    });
    return this.parseToolResult<Mission[]>(result);
  }

  public async getMissionStatus(missionId: string): Promise<Mission> {
    const client = await this.connect();
    const result = await client.callTool({
      name: 'get_mission_status',
      arguments: { missionId },
    });
    return this.parseToolResult<Mission>(result);
  }

  public async approveMission(
    missionId: string,
    options?: { tokenOrPhrase?: string; role?: 'adult' | 'child'; planVersion?: number }
  ): Promise<Mission> {
    const client = await this.connect();
    const result = await client.callTool({
      name: 'approve_mission',
      arguments: { missionId, ...options },
    });
    return this.parseToolResult<Mission>(result);
  }

  public async undoMission(
    missionId: string,
    options?: { tokenOrPhrase?: string; role?: 'adult' | 'child' }
  ): Promise<Mission> {
    const client = await this.connect();
    const result = await client.callTool({
      name: 'undo_mission',
      arguments: { missionId, ...options },
    });
    return this.parseToolResult<Mission>(result);
  }

  public async revisePlan(
    missionId: string,
    changes: {
      budget?: number;
      guests?: number;
      eventDate?: string;
      dietaryPreferences?: string;
      notes?: string;
      instruction?: string;
    }
  ): Promise<{ mission: Mission; revisionSummary: string }> {
    const client = await this.connect();
    const result = await client.callTool({
      name: 'revise_plan',
      arguments: { missionId, ...changes },
    });
    return this.parseToolResult<{ mission: Mission; revisionSummary: string }>(result);
  }

  public async verifyLedger(missionId: string): Promise<import('../../shared/contracts.js').LedgerVerificationResult> {
    const client = await this.connect();
    const result = await client.callTool({
      name: 'verify_ledger',
      arguments: { missionId },
    });
    return this.parseToolResult<import('../../shared/contracts.js').LedgerVerificationResult>(result);
  }

  public async getBrowserWorkerStatus(missionId: string): Promise<import('../../server/browser.js').BrowserEvidence> {
    const client = await this.connect();
    return this.parseToolResult(await client.callTool({ name: 'get_browser_worker_status', arguments: { missionId } }));
  }

  public async converse(input: import('../../shared/contracts.js').ConverseInput): Promise<import('../../shared/contracts.js').ConverseOutput> {
    const client = await this.connect();
    return this.parseToolResult(await client.callTool({ name: 'converse', arguments: { ...input } }));
  }

  public async skillTool<T>(name: 'list_learned_skills' | 'test_learned_skill' | 'approve_learned_skill' | 'run_learned_skill' | 'revoke_learned_skill', args: Record<string, unknown> = {}): Promise<T> {
    const client = await this.connect();
    return this.parseToolResult(await client.callTool({ name, arguments: args }));
  }
}

export const mcpManager = new McpManager();
