/**
 * useDictation - Fixed speech-to-text hook for prescription dictation.
 *
 * CRITICAL FIX: Properly handles final vs interim transcripts to prevent repetition.
 *
 * The bug in the original implementation:
 * - Appended EVERY result (including interim) to the transcript
 * - This caused severe text repetition as the same words were added multiple times
 *
 * Correct implementation:
 * - Separate finalTranscript (committed once, never repeated)
 * - Separate interimTranscript (temporary, replaced on each event)
 * - Only append to finalTranscript when result.isFinal is true
 */

import { useRef, useState, useCallback, useEffect } from "react";

// Type definitions for Web Speech API (not always available in TypeScript lib)
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventType {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventType {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionType {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventType) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventType) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionType;
}

// Get the SpeechRecognition constructor
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface UseDictationReturn {
  /** Combined transcript (final + interim) for display */
  transcript: string;
  /** Finalized transcript only (committed words) */
  finalTranscript: string;
  /** Current interim transcript (being spoken, may change) */
  interimTranscript: string;
  /** Whether dictation is currently active */
  listening: boolean;
  /** Error message if speech recognition fails */
  error: string | null;
  /** Start dictation */
  start: () => void;
  /** Stop dictation */
  stop: () => void;
  /** Clear all transcripts */
  clear: () => void;
  /** Directly set the final transcript (for manual edits) */
  setFinalTranscript: React.Dispatch<React.SetStateAction<string>>;
  /** Browser supports speech recognition */
  supported: boolean;
}

export function useDictation(): UseDictationReturn {
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionType | null>(null);

  // Check for browser support
  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setSupported(false);
      setError("Speech recognition not supported in this browser");
    }
  }, []);

  const start = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setError("Speech recognition not supported");
      return;
    }

    // Clear any previous error
    setError(null);

    // Create or reuse recognition instance
    if (!recognitionRef.current) {
      const recog = new SR();
      recog.lang = "en-IN"; // Indian English
      recog.interimResults = true;
      recog.continuous = true;
      recog.maxAlternatives = 1;

      /**
       * FIXED onresult handler
       *
       * Key insight: event.results is a cumulative list of all results so far.
       * event.resultIndex tells us where new results start.
       * result.isFinal tells us if a result is finalized or still interim.
       *
       * Correct approach:
       * 1. For each result from resultIndex onwards:
       *    - If isFinal: append to finalTranscript (only once!)
       *    - If !isFinal: use as current interimTranscript (replaced each time)
       * 2. Never re-process old results
       */
      recog.onresult = (event: SpeechRecognitionEventType) => {
        let newFinalText = "";
        let newInterimText = "";

        // Only process new results (from resultIndex onwards)
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcriptText = result[0].transcript;

          if (result.isFinal) {
            // This segment is finalized - append to our cumulative final transcript
            newFinalText += transcriptText;
          } else {
            // This is still interim - will be replaced on next event
            newInterimText += transcriptText;
          }
        }

        // Update final transcript - only add new finalized text
        if (newFinalText) {
          setFinalTranscript((prev) => {
            const trimmedPrev = prev.trim();
            const trimmedNew = newFinalText.trim();
            if (!trimmedPrev) return trimmedNew;
            if (!trimmedNew) return trimmedPrev;
            return trimmedPrev + " " + trimmedNew;
          });
        }

        // Replace interim transcript entirely (it's always rebuilt)
        setInterimTranscript(newInterimText);
      };

      recog.onend = () => {
        setListening(false);
        // Clear interim when stopped
        setInterimTranscript("");
      };

      recog.onerror = (event: SpeechRecognitionErrorEventType) => {
        console.error("Speech recognition error:", event.error);

        // Don't treat 'no-speech' as a fatal error
        if (event.error === "no-speech") {
          // Just ignore - user might speak later
          return;
        }

        if (event.error === "aborted") {
          // User stopped manually
          return;
        }

        setError(`Speech recognition error: ${event.error}`);
        setListening(false);
      };

      recog.onspeechstart = () => {
        // Speech detected
      };

      recog.onspeechend = () => {
        // Speech ended
      };

      recognitionRef.current = recog;
    }

    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e) {
      // May throw if already started
      console.warn("Recognition start error:", e);
    }
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // May throw if not started
      }
    }
    setListening(false);
    // Commit any interim text to final
    setInterimTranscript((interim) => {
      if (interim.trim()) {
        setFinalTranscript((prev) => {
          const trimmedPrev = prev.trim();
          const trimmedInterim = interim.trim();
          if (!trimmedPrev) return trimmedInterim;
          if (!trimmedInterim) return trimmedPrev;
          return trimmedPrev + " " + trimmedInterim;
        });
      }
      return "";
    });
  }, []);

  const clear = useCallback(() => {
    setFinalTranscript("");
    setInterimTranscript("");
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, []);

  // Combine final and interim for display
  const transcript =
    finalTranscript + (interimTranscript ? " " + interimTranscript : "");

  return {
    transcript: transcript.trim(),
    finalTranscript,
    interimTranscript,
    listening,
    error,
    start,
    stop,
    clear,
    setFinalTranscript,
    supported,
  };
}

export default useDictation;
