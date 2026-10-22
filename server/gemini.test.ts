import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiPlan } from './gemini.js';
const plan = { steps: [{ id: 'venue', title: 'Reserve Garden Hall', tool: 'fictional_venue_book', costBound: 12000, dependencies: [], requiresApproval: true }], evaluatedAlternatives: [] };
function fakeResponse(value: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 })) as typeof fetch;
}
test('Gemini sends a server-side structured request and validates response', async () => {
  let called = false;
  const fetcher: typeof fetch = async (url, init) => {
    called = true;
    assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/'));
    assert.ok(!String(url).includes('test-secret'));
    assert.equal((init?.headers as Record<string, string>)['x-goog-api-key'], 'test-secret');
    assert.equal(JSON.parse(init?.body as string).generationConfig.responseMimeType, 'application/json');
    return fakeResponse(plan)(url, init);
  };
  const result = await generateGeminiPlan('Birthday', 40000, { apiKey: 'test-secret', model: 'test-model', fetcher });
  assert.equal(called, true); assert.equal(result.steps[0].state, 'pending');
});
test('Gemini rejects malformed plans, missing approval, and provider errors', async () => {
  const options = { apiKey: 'test-secret', model: 'test-model' };
  await assert.rejects(generateGeminiPlan('Birthday', 40000, { ...options, fetcher: fakeResponse({ steps: [] }) }), /invalid plan schema/);
  await assert.rejects(generateGeminiPlan('Birthday', 40000, { ...options, fetcher: fakeResponse({ ...plan, steps: [{ ...plan.steps[0], requiresApproval: false }] }) }), /supported fictional venue/);
  await assert.rejects(generateGeminiPlan('Birthday', 40000, { ...options, fetcher: (async () => new Response('secret provider body', { status: 429 })) as typeof fetch }), /HTTP 429/);
});
