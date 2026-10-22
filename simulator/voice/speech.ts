export function speakReply(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  window.speechSynthesis.speak(utterance);
}

// Recognition is intentionally activated by the user; no always-on microphone.
export function createRecognition(onText: (text: string) => void, onState: (listening: boolean) => void, onError: (message: string) => void) {
  const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Speech) return null;
  const recognition = new Speech();
  recognition.lang = 'en-IN'; recognition.continuous = false; recognition.interimResults = false;
  recognition.onstart = () => onState(true);
  recognition.onend = () => onState(false);
  recognition.onerror = (event: { error: string }) => { onState(false); onError(`Microphone: ${event.error}. You can type the same command below.`); };
  recognition.onresult = (event: any) => {
    const text = Array.from(event.results as ArrayLike<any>).filter((item: any) => item.isFinal).map((item: any) => item[0].transcript).join(' ');
    if (text.trim()) onText(text.trim());
  };
  return recognition;
}
