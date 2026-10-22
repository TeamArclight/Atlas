import React, { useEffect, useRef, useState } from 'react';
import { createRecognition, speakReply } from '../voice/speech.js';

export function VoiceMissionConsole({ isOpen, onClose, onCommand }: { isOpen: boolean; onClose: () => void; onCommand: (text: string) => Promise<string> }) {
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  const recognition = useRef<any>(null);
  const submitRef = useRef<(text: string) => void>(() => {});
  const pending = useRef(false);
  const submit = async (text: string) => {
    if (!text.trim() || pending.current) return;
    pending.current = true; setBusy(true); setInput('');
    recognition.current?.abort();
    setHistory(prev => [...prev, { role: 'You', text }].slice(-20));
    try {
      const reply = await onCommand(text);
      setHistory(prev => [...prev, { role: 'Atlas', text: reply }].slice(-20));
      speakReply(reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The command failed. Try again.';
      setHistory(prev => [...prev, { role: 'Atlas', text: message }].slice(-20));
      speakReply(message);
    } finally { pending.current = false; setBusy(false); }
  };
  submitRef.current = text => { void submit(text); };
  useEffect(() => {
    if (!isOpen) return;
    recognition.current = createRecognition(text => submitRef.current(text), setListening, message => setHistory(prev => [...prev, { role: 'Atlas', text: message }]));
    return () => { recognition.current?.abort(); recognition.current = null; window.speechSynthesis?.cancel(); };
  }, [isOpen]);
  if (!isOpen) return null;
  return <aside aria-label="Atlas voice mission console" style={{ position: 'fixed', right: 16, bottom: 16, width: 'min(440px, calc(100vw - 32px))', background: '#101b2d', border: '1px solid #334155', borderRadius: 16, padding: 20, zIndex: 100, boxShadow: '0 12px 40px #0008' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}><h2>Talk to Atlas</h2><button aria-label="Close voice console" onClick={onClose}>×</button></div>
    <p style={{ fontSize: 12, color: '#94a3b8' }}>Alexa+ simulator · voice → MCP actions · browser speech</p>
    <div aria-live="polite" style={{ maxHeight: 280, overflowY: 'auto', margin: '12px 0' }}>{history.map((entry, i) => <p key={i} style={{ marginBottom: 10 }}><strong>{entry.role}: </strong>{entry.text}</p>)}</div>
    <p style={{ fontSize: 12 }}>Try “Plan Dad’s birthday, budget 40,000”, “What’s the status?”, “Book it”, or “Undo the booking”.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(input); }} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <input aria-label="Voice command text fallback" value={input} onChange={event => setInput(event.target.value)} disabled={busy} placeholder="Speak or type a command" style={{ flex: 1, minWidth: 0 }} />
      <button type="submit" disabled={busy || !input.trim()}>{busy ? 'Working…' : 'Send'}</button>
    </form>
    <button disabled={busy} style={{ marginTop: 10 }} onClick={() => {
      if (!recognition.current) { setHistory(prev => [...prev, { role: 'Atlas', text: 'Speech recognition is unavailable here. Use the text field.' }]); return; }
      if (listening) recognition.current.stop();
      else { window.speechSynthesis?.cancel(); try { recognition.current.start(); } catch { /* Already starting. */ } }
    }}>{listening ? 'Stop listening' : 'Tap to speak'}</button>
    <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 10 }}>Booking and undo require a specific second confirmation. Voice identity is not verified. All transactions are fictional.</p>
  </aside>;
}
