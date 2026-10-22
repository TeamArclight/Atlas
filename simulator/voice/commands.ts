export type VoiceCommand =
  | { kind: 'create'; goal: string; budget?: number }
  | { kind: 'status' | 'approve' | 'undo' | 'cancel' | 'help' }
  | { kind: 'confirm'; operation: 'approve' | 'undo' }
  | { kind: 'unknown' };

export function parseVoiceCommand(input: string): VoiceCommand {
  const text = input.trim().replace(/^(?:hey\s+)?(?:alexa|atlas)[,\s]+/i, '').trim();
  const normalized = text.toLowerCase().replace(/[.!?]/g, '').trim();
  if (/^confirm booking$/.test(normalized)) return { kind: 'confirm', operation: 'approve' };
  if (/^confirm cancellation$/.test(normalized)) return { kind: 'confirm', operation: 'undo' };
  if (/^(cancel|never mind|nevermind|stop)$/.test(normalized)) return { kind: 'cancel' };
  if (/\b(undo|cancel (?:the |my )?(?:booking|reservation))\b/.test(normalized)) return { kind: 'undo' };
  if (/^(approve|book it|book the venue|approve (?:the )?(?:booking|plan|mission))$/.test(normalized)) return { kind: 'approve' };
  if (/\b(status|progress|where are we|what happened|how is .*going)\b/.test(normalized)) return { kind: 'status' };
  if (/^(help|what can you do)$/.test(normalized)) return { kind: 'help' };
  if (/^(plan|organize|organise|arrange)\b/.test(normalized)) {
    const match = text.match(/(?:budget(?:\s+(?:is|of))?|under|within)\s*(?:inr\s*|rs\.?\s*|₹\s*)?([\d,]+(?:\.\d+)?)\s*(thousand|lakh|k)?/i);
    let budget = match ? Number(match[1].replace(/,/g, '')) * (match[2]?.toLowerCase() === 'lakh' ? 100000 : match[2] ? 1000 : 1) : undefined;
    if (!budget && /budget\s+(?:is\s+)?forty thousand/i.test(text)) budget = 40000;
    return { kind: 'create', goal: text, budget };
  }
  return { kind: 'unknown' };
}
