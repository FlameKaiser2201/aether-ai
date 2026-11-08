"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getSpeechRecognition,
  type SpeechRecognitionLike,
} from "@/lib/speech";

interface SpeechOptions {
  lang?: string;
  autoRestart?: boolean;
  onFinal?: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone permission was denied.",
  "service-not-allowed": "Microphone permission was denied.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs a network connection.",
  "language-not-supported": "That recognition language is not supported.",
};

/**
 * Thin, safe wrapper around the browser SpeechRecognition API with automatic
 * cleanup and optional continuous restart.
 */
export function useSpeechRecognition({
  lang = "en-US",
  autoRestart = false,
  onFinal,
  onInterim,
  onError,
  onEnd,
}: SpeechOptions = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const callbacksRef = useRef({ onFinal, onInterim, onError, onEnd });

  useEffect(() => {
    callbacksRef.current = { onFinal, onInterim, onError, onEnd };
  }, [onFinal, onInterim, onError, onEnd]);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()));
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.stop();
      } catch {
        // already stopped
      }
    }
  }, []);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      callbacksRef.current.onError?.(
        "This browser does not support speech recognition.",
      );
      return;
    }
    if (activeRef.current) return;

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      setInterim(interimText.trim());
      if (interimText.trim()) callbacksRef.current.onInterim?.(interimText.trim());
      if (finalText.trim()) {
        setInterim("");
        callbacksRef.current.onFinal?.(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      callbacksRef.current.onError?.(
        ERROR_MESSAGES[event.error] ?? `Speech recognition failed (${event.error}).`,
      );
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
      if (activeRef.current && autoRestart) {
        window.setTimeout(() => {
          if (activeRef.current) start();
        }, 350);
      } else {
        activeRef.current = false;
        callbacksRef.current.onEnd?.();
      }
    };

    recognitionRef.current = recognition;
    activeRef.current = true;
    try {
      recognition.start();
    } catch {
      activeRef.current = false;
      recognitionRef.current = null;
      setListening(false);
      callbacksRef.current.onError?.("Could not start the microphone.");
    }
  }, [autoRestart, lang]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        try {
          recognition.onend = null;
          recognition.abort();
        } catch {
          // already stopped
        }
      }
    };
  }, []);

  return { supported, listening, interim, start, stop };
}
