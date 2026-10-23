import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiPlan } from './gemini.js';
test('Gemini uses revised preferences and validates three actual paid service steps', async () => {
  const steps = [
    { id: 'venue', title: 'Garden Hall', tool: 'fictional_venue_book', costBound: 12000, dependencies: [], requiresApproval: true },
    { id: 'food', title: 'Vegetarian catering', tool: 'fictional_catering_order', costBound: 14400, dependencies: ['venue'], requiresApproval: true },
    { id: 'cake', title: 'Cake', tool: 'fictional_cake_order', costBound: 3500, dependencies: ['food'], requiresApproval: true },
  ];
  const fetcher: typeof fetch = async (_url, init) => {
    const payload = JSON.parse(init?.body as string);
    assert.equal(JSON.parse(payload.contents[0].parts[0].text).preferences.guests, 30);
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ steps, evaluatedAlternatives: [] }) }] } }] }));
  };
  const result = await generateGeminiPlan('Birthday venue catering and cake', 40000, { apiKey: 'test-secret', model: 'test-model', fetcher, preferences: { guests: 30, dietaryPreferences: 'vegetarian', services: ['venue', 'catering', 'cake'] } });
  assert.equal(result.steps[1].args?.dietary, 'vegetarian');
  assert.equal(result.steps[1].args?.guests, 30);
  assert.equal(result.steps.reduce((sum, step) => sum + (step.costBound ?? 0), 0), 29900);
});
