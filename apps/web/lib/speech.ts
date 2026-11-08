/* Browser speech primitives with safe feature detection. */

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export function browserSupportsSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!browserSupportsSpeech()) return [];
  return window.speechSynthesis.getVoices();
}

export function stopSpeaking(): void {
  if (browserSupportsSpeech()) window.speechSynthesis.cancel();
}

export interface SpeakOptions {
  voiceName?: string;
  rate?: number;
  pitch?: number;
  lang?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onBoundary?: () => void;
}

export function speakText(text: string, options: SpeakOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!browserSupportsSpeech()) {
      reject(new Error("Speech synthesis is not supported in this browser."));
      return;
    }
    const clean = stripMarkdownForSpeech(text).trim();
    if (!clean) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    if (options.lang) utterance.lang = options.lang;
    const voices = window.speechSynthesis.getVoices();
    const selected =
      (options.voiceName && voices.find((voice) => voice.name === options.voiceName)) ||
      voices.find((voice) => voice.lang.startsWith("en")) ||
      voices[0];
    if (selected) utterance.voice = selected;
    utterance.onstart = () => options.onStart?.();
    utterance.onend = () => {
      options.onEnd?.();
      resolve();
    };
    utterance.onerror = (event) => {
      options.onEnd?.();
      if (event.error === "canceled" || event.error === "interrupted") resolve();
      else reject(new Error(`Speech failed: ${event.error}`));
    };
    utterance.onboundary = () => options.onBoundary?.();
    window.speechSynthesis.speak(utterance);
  });
}

export function stripMarkdownForSpeech(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " Code block omitted from speech. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Flush a streaming answer into speakable sentences so the voice feels live.
 */
export class SentenceBuffer {
  private buffer = "";

  push(text: string): string[] {
    this.buffer += text;
    const chunks: string[] = [];
    let match = this.buffer.match(/^([\s\S]*?[.!?])(\s+|$)/);
    while (match) {
      const sentence = match[1].trim();
      if (sentence.length > 12) chunks.push(sentence);
      this.buffer = this.buffer.slice(match[0].length);
      match = this.buffer.match(/^([\s\S]*?[.!?])(\s+|$)/);
    }
    if (this.buffer.length > 320) {
      chunks.push(this.buffer.trim());
      this.buffer = "";
    }
    return chunks;
  }

  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest.length > 0 ? rest : null;
  }
}
