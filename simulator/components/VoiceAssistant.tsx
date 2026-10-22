import React, { useEffect, useState, useRef } from 'react';

interface VoiceAssistantProps {
  onTranscribeGoal: (transcript: string) => void;
  isOpen: boolean;
  onClose: () => void;
  statusMessage?: string;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
  onTranscribeGoal,
  isOpen,
  onClose,
  statusMessage,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (final) {
          onTranscribeGoal(final);
          setInterimTranscript(final);
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onerror = (err: any) => {
        console.warn('Speech recognition error:', err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [onTranscribeGoal]);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      try {
        setInterimTranscript('');
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Could not start recognition:', e);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '360px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-medium)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'rgba(56, 189, 248, 0.1)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🎙️</span>
          <strong style={{ fontSize: '0.9rem', color: '#7dd3fc' }}>Alexa+ Voice Assistant</strong>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {speechSupported ? (
          <>
            <div style={{ textAlign: 'center', margin: '0.5rem 0' }}>
              <button
                type="button"
                className={`voice-mic-btn ${isListening ? 'listening' : ''}`}
                onClick={isListening ? stopListening : startListening}
                style={{ width: '56px', height: '56px', margin: '0 auto', fontSize: '1.4rem' }}
                aria-label={isListening ? 'Stop listening' : 'Start speech recognition'}
              >
                {isListening ? '🔴' : '🎤'}
              </button>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                {isListening ? 'Listening for your mission goal...' : 'Tap microphone to speak'}
              </div>
            </div>

            {interimTranscript && (
              <div
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '0.6rem 0.8rem',
                  fontSize: '0.82rem',
                  color: '#e2e8f0',
                  minHeight: '40px',
                }}
              >
                "{interimTranscript}"
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const demoSpeech = "Plan Dad's 60th birthday for Saturday, 25 people, budget INR 40,000.";
                  onTranscribeGoal(demoSpeech);
                  setInterimTranscript(demoSpeech);
                  speak("I have planned Dad's 60th birthday for Saturday. Budget is 40,000 rupees. Awaiting your approval.");
                }}
                style={{ fontSize: '0.75rem', flex: 1 }}
              >
                🗣️ Simulate Speech Command
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Web Speech API not detected in this browser environment. Using manual keyboard input fallback.
          </div>
        )}

        {statusMessage && (
          <div style={{ fontSize: '0.78rem', color: '#38bdf8' }}>
            ℹ️ {statusMessage}
          </div>
        )}

        <div
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.72rem',
            color: '#fbbf24',
            lineHeight: 1.4,
          }}
        >
          🛡️ <strong>Safety Policy:</strong> Transcribed speech alone cannot execute or approve a booking.
          Financial commitments strictly require explicit manual user button click.
        </div>
      </div>
    </div>
  );
};
