import { chromium } from 'playwright';
import type { Mission } from '../shared/contracts.js';
import { existsSync } from 'node:fs';

export interface BrowserEvidence {
  status: 'idle' | 'navigating' | 'filling_form' | 'confirming' | 'captured_snapshot' | 'failed';
  targetUrl: string;
  lastAction: string;
  snapshot?: string;
  operation?: 'book' | 'cancel';
  error?: string;
}

export class VenueBrowserWorker {
  private evidence = new Map<string, BrowserEvidence>();
  constructor(private target = 'http://127.0.0.1:3001/demo/venue') {
    const url = new URL(target);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/demo/venue') throw new Error('Only the local fictional venue is allowed');
  }
  get(missionId: string): BrowserEvidence {
    return structuredClone(this.evidence.get(missionId) ?? { status: 'idle', targetUrl: this.target, lastAction: 'No browser operation yet' });
  }
  async execute(mission: Mission, operation: 'book' | 'cancel') {
    const url = new URL(this.target);
    url.searchParams.set('ref', `ATLAS-${mission.id.slice(0, 8).toUpperCase()}`);
    if (operation === 'cancel') url.searchParams.set('status', 'reserved');
    const evidence: BrowserEvidence = { status: 'navigating', targetUrl: url.href, lastAction: 'Open fictional venue', operation };
    this.evidence.set(mission.id, evidence);
    const channel = existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? 'msedge' : undefined;
    const browser = await chromium.launch({ headless: true, channel });
    try {
      const page = await browser.newPage();
      await page.goto(url.href);
      evidence.status = 'filling_form'; evidence.lastAction = 'Fill occasion';
      await page.getByRole('textbox', { name: 'Occasion', exact: true }).fill(mission.goal);
      const cost = await page.getByTestId('total-cost').innerText();
      const venueStep = mission.steps.find((s) => s.tool === 'fictional_venue_book' || s.id === 'venue' || s.id === 'venue_booking');
      const venueCost = venueStep?.costBound ?? 12000;
      if (cost !== 'INR 12,000' || venueCost !== 12000 || mission.budget < 12000) throw new Error('Venue price differs from approved plan');
      evidence.status = 'confirming';
      const label = operation === 'book' ? 'Confirm Booking' : 'Cancel Reservation';
      evidence.lastAction = `Click ${label}`;
      await page.getByRole('button', { name: label, exact: true }).click();
      const expected = operation === 'book' ? 'Booked / Confirmed' : 'Cancelled & Refunded';
      await page.getByTestId('booking-status-badge').filter({ hasText: expected }).waitFor();
      evidence.snapshot = await page.locator('body').ariaSnapshot();
      evidence.status = 'captured_snapshot';
      return this.get(mission.id);
    } catch (error) {
      evidence.status = 'failed'; evidence.error = error instanceof Error ? error.message : 'Browser operation failed';
      throw error;
    } finally { await browser.close(); }
  }
}
